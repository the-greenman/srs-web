import { afterEach, describe, expect, it, vi } from "vitest";
import { DropboxProvider, DropboxTreeHandle } from "../src/lib/storage/dropbox.js";
import { StorageConflictError } from "../src/lib/storage/errors.js";
import { genericScanForSrs } from "../src/lib/storage/srs-scan.js";
import type { StorageEntry } from "../src/lib/storage/types.js";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function signedIn(): DropboxProvider {
  const provider = new DropboxProvider({ appKey: "key", redirectUri: "https://app.test/" });
  // biome-ignore lint/suspicious/noExplicitAny: test seam — pre-seed a token to skip the OAuth popup
  (provider as any).accessToken = "token";
  // biome-ignore lint/suspicious/noExplicitAny: test seam
  (provider as any).expiresAt = Date.now() + 3_600_000;
  return provider;
}

const file = (name: string, dir: string, rev = `rev-${name}`) => ({
  ".tag": "file",
  id: `id:${name}`,
  name,
  path_lower: `${dir}/${name}`.toLowerCase(),
  path_display: `${dir}/${name}`,
  rev,
});

const repoEntry: StorageEntry = {
  id: "id:folder#repo",
  name: "Open as SRS repository",
  kind: "repository",
  path: "/org",
};

/** Route fetch by URL: list_folder, download (by path), upload, delete_v2. */
function dropboxFetch(
  tree: Record<string, string>,
  listing = Object.keys(tree).map((p) =>
    file(
      p.split("/").pop() as string,
      `/org/${p.split("/").slice(0, -1).join("/")}`.replace(/\/$/, "")
    )
  )
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/files/list_folder")) {
      return json({ entries: listing, cursor: "c", has_more: false });
    }
    if (url.endsWith("/files/download")) {
      const arg = JSON.parse((init?.headers as Record<string, string>)["Dropbox-API-Arg"]) as {
        path: string;
      };
      const rel = arg.path.replace(/^\/org\//, "");
      const key = Object.keys(tree).find((k) => k.toLowerCase() === rel);
      return key ? new Response(enc(tree[key] as string)) : new Response("nope", { status: 409 });
    }
    return json({ ".tag": "file", id: "id:x", name: "x", rev: "rev-new" });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("DropboxProvider.list repo detection", () => {
  it("surfaces an 'Open as SRS repository' entry and hides manifest.json", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        entries: [
          { ".tag": "file", id: "id:m", name: "manifest.json", path_lower: "/org/manifest.json" },
          { ".tag": "folder", id: "id:r", name: "records", path_lower: "/org/records" },
        ],
        cursor: "c",
        has_more: false,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const entries = await signedIn().list("/org");
    expect(entries.map((e) => [e.kind, e.name])).toEqual([
      ["repository", "Open as SRS repository"],
      ["folder", "records"],
    ]);
    expect(entries[0]?.path).toBe("/org");
  });

  it("adds no repository entry for an ordinary folder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          entries: [{ ".tag": "file", id: "id:a", name: "a.srsj", path_lower: "/a.srsj" }],
          cursor: "c",
          has_more: false,
        })
      )
    );
    const entries = await signedIn().list("");
    expect(entries.some((e) => e.kind === "repository")).toBe(false);
  });
});

describe("DropboxProvider.openTree", () => {
  it("reads the folder recursively into dir-relative paths, skipping .git/node_modules", async () => {
    const fetchMock = dropboxFetch({ "manifest.json": "{}", "records/Board.srsj": "rec" }, [
      file("manifest.json", "/org"),
      file("Board.srsj", "/org/Records"),
      file("HEAD", "/org/.git"),
      { ".tag": "folder", id: "id:f", name: "Records", path_lower: "/org/records" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const handle = await signedIn().openTree(repoEntry);
    const tree = await handle.readTree();

    expect(handle.kind).toBe("tree");
    expect(handle.capabilities).toEqual({ read: true, write: true });
    expect(Object.keys(tree).sort()).toEqual(["Records/Board.srsj", "manifest.json"]);
    expect(dec(tree["manifest.json"] as Uint8Array)).toBe("{}");
    const listCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(listCall[1].body as string)).toEqual({ path: "/org", recursive: true });
  });

  it("rejects a folder that turns out not to be an SRS repository", async () => {
    vi.stubGlobal("fetch", dropboxFetch({ "notes.txt": "hi" }));
    await expect(signedIn().openTree(repoEntry)).rejects.toThrow(/not an SRS repository/);
  });

  it("rejects a non-repository entry", async () => {
    await expect(
      signedIn().openTree({ id: "x", name: "x", kind: "file", path: "/x" })
    ).rejects.toThrow(/usable repository path/);
  });
});

describe("DropboxTreeHandle.commitTree", () => {
  async function open(tree: Record<string, string>) {
    const fetchMock = dropboxFetch(tree);
    vi.stubGlobal("fetch", fetchMock);
    const handle = await signedIn().openTree(repoEntry);
    fetchMock.mockClear();
    return { handle, fetchMock };
  }

  const calls = (m: ReturnType<typeof vi.fn>) => m.mock.calls as unknown as [string, RequestInit][];

  it("uploads only changed paths, with update-mode revisions, and deletes removed ones", async () => {
    const { handle, fetchMock } = await open({
      "manifest.json": "{}",
      "records/a.srsj": "a",
      "records/b.srsj": "b",
    });
    const files = await handle.readTree();
    files["records/a.srsj"] = enc("a2"); // changed
    files["records/c.srsj"] = enc("c"); // new
    delete files["records/b.srsj"]; // removed

    await handle.commitTree(files);

    const uploads = calls(fetchMock).filter(([u]) => u.endsWith("/files/upload"));
    const args = uploads.map(([, init]) =>
      JSON.parse((init.headers as Record<string, string>)["Dropbox-API-Arg"])
    );
    expect(args).toHaveLength(2);
    expect(args.find((a) => a.path === "/org/records/a.srsj").mode).toEqual({
      ".tag": "update",
      update: "rev-a.srsj",
    });
    expect(args.find((a) => a.path === "/org/records/c.srsj").mode).toBe("add");
    expect(args.every((a) => a.autorename === false)).toBe(true);

    const deletes = calls(fetchMock).filter(([u]) => u.endsWith("/files/delete_v2"));
    expect(deletes).toHaveLength(1);
    expect(JSON.parse(deletes[0]?.[1].body as string)).toEqual({
      path: "/org/records/b.srsj",
      parent_rev: "rev-b.srsj",
    });
  });

  it("makes no requests when nothing changed, and rebases so a second save is a no-op", async () => {
    const { handle, fetchMock } = await open({ "manifest.json": "{}", "x.srsj": "x" });
    await handle.commitTree(await handle.readTree());
    expect(fetchMock).not.toHaveBeenCalled();

    const files = await handle.readTree();
    files["x.srsj"] = enc("y");
    await handle.commitTree(files);
    fetchMock.mockClear();
    await handle.commitTree(files);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dec((await handle.readTree())["x.srsj"] as Uint8Array)).toBe("y");
  });

  it("maps a Dropbox 409 to StorageConflictError and keeps landed files rebased", async () => {
    const { handle, fetchMock } = await open({
      "manifest.json": "{}",
      "a.srsj": "a",
      "b.srsj": "b",
    });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const arg = JSON.parse((init?.headers as Record<string, string>)["Dropbox-API-Arg"]);
      if ((url as string).endsWith("/files/upload") && arg.path === "/org/b.srsj") {
        return json({ error_summary: "path/conflict" }, 409);
      }
      return json({ ".tag": "file", id: "id:x", name: "x", rev: "rev-new" });
    });
    const files = await handle.readTree();
    files["a.srsj"] = enc("a2");
    files["b.srsj"] = enc("b2");

    await expect(handle.commitTree(files)).rejects.toBeInstanceOf(StorageConflictError);

    // a landed, b did not: a retry resends only b.
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () =>
      json({ ".tag": "file", id: "i", name: "n", rev: "r2" })
    );
    await handle.commitTree(files);
    expect(calls(fetchMock)).toHaveLength(1);
  });

  it("treats deleting an already-gone file as success", async () => {
    const { handle, fetchMock } = await open({ "manifest.json": "{}", "a.srsj": "a" });
    fetchMock.mockImplementation(async () =>
      json({ error_summary: "path_lookup/not_found/" }, 409)
    );
    const files = await handle.readTree();
    delete files["a.srsj"];
    await expect(handle.commitTree(files)).resolves.toEqual({ revision: null });
  });

  it("JSON-escapes non-ASCII paths in the Dropbox-API-Arg header", async () => {
    const { handle, fetchMock } = await open({ "manifest.json": "{}" });
    const files = await handle.readTree();
    files["records/café.srsj"] = enc("c");
    await handle.commitTree(files);
    const header = (calls(fetchMock)[0]?.[1].headers as Record<string, string>)["Dropbox-API-Arg"];
    expect(header).toContain("caf\\u00e9");
    expect(JSON.parse(header as string).path).toBe("/org/records/café.srsj");
  });

  it("rejects single-file read/write", async () => {
    const { handle } = await open({ "manifest.json": "{}" });
    await expect(handle.read()).rejects.toThrow(/readTree/);
    await expect(handle.write()).rejects.toThrow(/commitTree/);
  });
});

describe("discovery scan", () => {
  it("surfaces a marker folder as a repository now that Dropbox can open trees", async () => {
    const provider = signedIn();
    const listings: Record<string, StorageEntry[]> = {
      "": [{ id: "id:f", name: "proj", kind: "folder", path: "/proj" }],
      "/proj": [{ id: "id:m", name: "manifest.json", kind: "file", path: "/proj/manifest.json" }],
    };
    const outcome = await genericScanForSrs(
      { list: async (p = "") => listings[p] ?? [], openTree: provider.openTree.bind(provider) },
      "",
      "explicit"
    );
    expect(outcome.entries.map((e) => e.kind)).toEqual(["repository"]);
  });
});
