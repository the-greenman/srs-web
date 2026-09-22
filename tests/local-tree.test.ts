// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  LocalTreeHandle,
  pickLocalDirectory,
  treeFromDirectoryInput,
} from "../src/lib/storage/local.js";

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

/**
 * A stub File System Access directory, backed by a flat path -> bytes map. It
 * records every write and removal so a test can assert that a save touched
 * exactly the paths it should — the on-disk equivalent of GitHub tree mode's
 * minimal-commit guarantee.
 */
function stubDirectory(initial: Record<string, string> = {}, name = "repo") {
  const disk = new Map<string, Uint8Array>(
    Object.entries(initial).map(([path, content]) => [path, bytes(content)])
  );
  const written: string[] = [];
  const removed: string[] = [];

  function makeDir(prefix: string): FileSystemDirectoryHandle {
    const dir = {
      kind: "directory" as const,
      name: prefix === "" ? name : prefix.replace(/\/$/, "").split("/").pop(),
      async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
        const seen = new Set<string>();
        for (const path of disk.keys()) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          const [head, ...tail] = rest.split("/");
          if (seen.has(head)) continue;
          seen.add(head);
          yield tail.length > 0
            ? [head, makeDir(`${prefix}${head}/`)]
            : [head, makeFile(`${prefix}${head}`)];
        }
      },
      getDirectoryHandle: (child: string) => Promise.resolve(makeDir(`${prefix}${child}/`)),
      getFileHandle: (child: string) => Promise.resolve(makeFile(`${prefix}${child}`)),
      removeEntry: (child: string) => {
        removed.push(`${prefix}${child}`);
        disk.delete(`${prefix}${child}`);
        return Promise.resolve();
      },
    };
    return dir as unknown as FileSystemDirectoryHandle;
  }

  function makeFile(path: string): FileSystemFileHandle {
    const file = {
      kind: "file" as const,
      name: path.split("/").pop(),
      getFile: () =>
        Promise.resolve({
          arrayBuffer: () => {
            const stored = disk.get(path) ?? new Uint8Array();
            return Promise.resolve(
              stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.byteLength)
            );
          },
        }),
      createWritable: () =>
        Promise.resolve({
          write: (chunk: ArrayBuffer) => {
            written.push(path);
            disk.set(path, new Uint8Array(chunk));
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        }),
    };
    return file as unknown as FileSystemFileHandle;
  }

  return { dir: makeDir(""), disk, written, removed };
}

const REPO = { "manifest.json": '{"v":1}', "records/a.json": "a", ".srs/.gitkeep": "" };

describe("LocalTreeHandle", () => {
  it("is a writable tree handle when opened with a directory", async () => {
    const { dir } = stubDirectory(REPO);
    const handle = new LocalTreeHandle("id", "repo", {}, dir);
    expect(handle.kind).toBe("tree");
    expect(handle.provider).toBe("local");
    expect(handle.capabilities).toEqual({ read: true, write: true });
    await expect(handle.read()).rejects.toThrow(/readTree/);
    await expect(handle.write()).rejects.toThrow(/commitTree/);
  });

  it("is read-only without a directory, and says how to get changes out", async () => {
    const handle = new LocalTreeHandle("id", "repo", { "manifest.json": bytes("{}") });
    expect(handle.capabilities.write).toBe(false);
    await expect(handle.commitTree({})).rejects.toThrow(/Export/);
  });

  it("commitTree() writes nothing when the tree is unchanged", async () => {
    const { dir, written, removed } = stubDirectory(REPO);
    const handle = await pickHandle(dir);

    await handle.commitTree(await handle.readTree());

    expect(written).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("commitTree() writes only the changed path", async () => {
    const { dir, disk, written } = stubDirectory(REPO);
    const handle = await pickHandle(dir);
    const files = await handle.readTree();
    files["records/a.json"] = bytes("edited");

    await handle.commitTree(files);

    expect(written).toEqual(["records/a.json"]);
    // biome-ignore lint/style/noNonNullAssertion: asserted present by the write above
    expect(text(disk.get("records/a.json")!)).toBe("edited");
  });

  it("commitTree() creates a new nested path and removes a deleted one", async () => {
    const { dir, disk, written, removed } = stubDirectory(REPO);
    const handle = await pickHandle(dir);
    const files = await handle.readTree();
    files["records/tier-2/new.json"] = bytes("new");
    delete files["records/a.json"];

    await handle.commitTree(files);

    expect(written).toEqual(["records/tier-2/new.json"]);
    expect(removed).toEqual(["records/a.json"]);
    expect(disk.has("records/a.json")).toBe(false);
  });

  it("rebases after a save, so a second save diffs against what is on disk", async () => {
    const { dir, written } = stubDirectory(REPO);
    const handle = await pickHandle(dir);
    const files = await handle.readTree();
    files["records/a.json"] = bytes("edited");

    await handle.commitTree(files);
    await handle.commitTree(files);

    expect(written).toEqual(["records/a.json"]);
  });
});

describe("pickLocalDirectory", () => {
  it("reads the whole tree, including the .srs marker directory", async () => {
    const { dir } = stubDirectory(REPO);
    const handle = await pickHandle(dir);
    expect(Object.keys(await handle.readTree()).sort()).toEqual([
      ".srs/.gitkeep",
      "manifest.json",
      "records/a.json",
    ]);
  });

  it("skips .git and node_modules, which are not repository content", async () => {
    const { dir } = stubDirectory({
      ...REPO,
      ".git/HEAD": "ref: refs/heads/main",
      "node_modules/pkg/index.js": "x",
    });
    const handle = await pickHandle(dir);
    expect(Object.keys(await handle.readTree())).not.toContain(".git/HEAD");
    expect(Object.keys(await handle.readTree())).not.toContain("node_modules/pkg/index.js");
  });

  it("refuses a folder that is not an SRS repository", async () => {
    const { dir } = stubDirectory({ "README.md": "hello" });
    await expect(pickHandle(dir)).rejects.toThrow(/not an SRS repository/);
  });

  it("resolves null when the user dismisses the picker", async () => {
    withPicker(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(pickLocalDirectory()).resolves.toBeNull();
  });
});

describe("treeFromDirectoryInput", () => {
  const fileAt = (relativePath: string, content: string): File => {
    const file = new File([content], relativePath.split("/").pop() ?? "");
    Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
    return file;
  };

  it("strips the picked folder's own name from every path", async () => {
    const handle = await treeFromDirectoryInput([
      fileAt("my-repo/manifest.json", '{"v":1}'),
      fileAt("my-repo/records/a.json", "a"),
    ]);
    expect(handle.name).toBe("my-repo");
    expect(Object.keys(await handle.readTree()).sort()).toEqual([
      "manifest.json",
      "records/a.json",
    ]);
  });

  it("is read-only — the fallback path has no write side", async () => {
    const handle = await treeFromDirectoryInput([fileAt("my-repo/manifest.json", "{}")]);
    expect(handle.capabilities.write).toBe(false);
  });

  it("refuses a folder that is not an SRS repository", async () => {
    await expect(treeFromDirectoryInput([fileAt("notes/README.md", "hi")])).rejects.toThrow(
      /not an SRS repository/
    );
  });
});

/** Drive the real `pickLocalDirectory()` against a stub directory. */
function pickHandle(dir: FileSystemDirectoryHandle): Promise<LocalTreeHandle> {
  withPicker(() => Promise.resolve(dir));
  return pickLocalDirectory() as Promise<LocalTreeHandle>;
}

function withPicker(impl: () => Promise<FileSystemDirectoryHandle>): void {
  (window as Window).showDirectoryPicker = impl;
}
