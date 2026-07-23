import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubProvider } from "../src/lib/storage/github.js";
import {
  AUTO_MAX_LIST_REQUESTS,
  AUTO_MAX_ROOT_ENTRIES,
} from "../src/lib/storage/scan-config.js";
import { genericScanForSrs } from "../src/lib/storage/srs-scan.js";
import type { StorageEntry } from "../src/lib/storage/types.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function folder(path: string): StorageEntry {
  const name = path.split("/").filter(Boolean).pop() ?? "";
  return { id: `id:${path}`, name, kind: "folder", path };
}

function file(path: string): StorageEntry {
  const name = path.split("/").filter(Boolean).pop() ?? "";
  return { id: `id:${path}`, name, kind: "file", path };
}

/** A fake listing provider over a path → entries map. */
function fakeProvider(tree: Record<string, StorageEntry[]>, withOpenTree = false) {
  const list = vi.fn(async (path = ""): Promise<StorageEntry[]> => tree[path] ?? []);
  return {
    list,
    openTree: withOpenTree ? vi.fn() : undefined,
  };
}

describe("genericScanForSrs", () => {
  const nested: Record<string, StorageEntry[]> = {
    "": [folder("/a"), folder("/deep"), file("/root.srsj")],
    "/a": [file("/a/gov.srsj"), file("/a/readme.md"), file("/a/data.srs")],
    "/deep": [folder("/deep/s1")],
    "/deep/s1": [folder("/deep/s1/s2")],
    "/deep/s1/s2": [file("/deep/s1/s2/deep.srsj"), folder("/deep/s1/s2/s3")],
    "/deep/s1/s2/s3": [file("/deep/s1/s2/s3/toodeep.srsj")],
  };

  it("finds .srs/.srsj files in subfolders, labels them with relative paths, skips root files and non-targets", async () => {
    const provider = fakeProvider(nested);
    const outcome = await genericScanForSrs(provider, "", "auto", nested[""]);
    const paths = outcome.entries.map((entry) => entry.displayPath).sort();
    expect(paths).toEqual(["a/data.srs", "a/gov.srsj", "deep/s1/s2/deep.srsj"]);
    // The base filename is preserved so opening produces a clean handle name.
    expect(outcome.entries.every((entry) => !entry.name.includes("/"))).toBe(true);
    expect(outcome.status).toBe("complete");
  });

  it("never descends past SCAN_MAX_DEPTH", async () => {
    const provider = fakeProvider(nested);
    await genericScanForSrs(provider, "", "auto", nested[""]);
    expect(provider.list).not.toHaveBeenCalledWith("/deep/s1/s2/s3");
  });

  it("never lists inside SCAN_SKIP_DIRS", async () => {
    const tree: Record<string, StorageEntry[]> = {
      "": [folder("/node_modules"), folder("/.git"), folder("/ok")],
      "/ok": [file("/ok/x.srsj")],
    };
    const provider = fakeProvider(tree);
    const outcome = await genericScanForSrs(provider, "", "auto", tree[""]);
    expect(provider.list).not.toHaveBeenCalledWith("/node_modules");
    expect(provider.list).not.toHaveBeenCalledWith("/.git");
    expect(outcome.entries.map((entry) => entry.displayPath)).toEqual(["ok/x.srsj"]);
  });

  it("emits a repository entry for a marker folder when the provider can open trees", async () => {
    const tree: Record<string, StorageEntry[]> = {
      "": [folder("/repo")],
      "/repo": [folder("/repo/.srs"), file("/repo/manifest.json"), file("/repo/inner.srsj")],
    };
    const withTrees = fakeProvider(tree, true);
    const found = await genericScanForSrs(withTrees, "", "auto", tree[""]);
    expect(found.entries).toHaveLength(1);
    expect(found.entries[0]).toMatchObject({
      kind: "repository",
      name: "repo",
      path: "/repo",
      displayPath: "repo",
    });
    // Never collects files inside a detected repo, and never descends into it.
    expect(withTrees.list).not.toHaveBeenCalledWith("/repo/.srs");

    const withoutTrees = fakeProvider(tree, false);
    const hidden = await genericScanForSrs(withoutTrees, "", "auto", tree[""]);
    // No openTree → nothing surfaced that cannot be opened.
    expect(hidden.entries).toHaveLength(0);
  });

  it("auto mode skips a too-large root without any list calls", async () => {
    const bigRoot = Array.from({ length: AUTO_MAX_ROOT_ENTRIES + 1 }, (_, i) =>
      folder(`/f${i}`)
    );
    const provider = fakeProvider({ "": bigRoot });
    const outcome = await genericScanForSrs(provider, "", "auto", bigRoot);
    expect(outcome).toMatchObject({ status: "skipped", reason: "too-large" });
    expect(provider.list).not.toHaveBeenCalled();
  });

  it("stops at the auto budget and reports partial", async () => {
    const rootFolders = Array.from({ length: 30 }, (_, i) => folder(`/f${i}`));
    const provider = fakeProvider({ "": rootFolders });
    const outcome = await genericScanForSrs(provider, "", "auto", rootFolders);
    expect(outcome).toMatchObject({ status: "partial", reason: "budget-exhausted" });
    expect(provider.list).toHaveBeenCalledTimes(AUTO_MAX_LIST_REQUESTS);
  });

  it("charges extra budget units for huge listings", async () => {
    // First folder returns 450 entries → costs 3 units; 20-unit auto budget then
    // affords only 17 more single-unit listings: 18 list calls total, partial.
    const rootFolders = Array.from({ length: 26 }, (_, i) => folder(`/f${i}`));
    const tree: Record<string, StorageEntry[]> = { "": rootFolders };
    tree["/f0"] = Array.from({ length: 450 }, (_, i) => file(`/f0/noise${i}.md`));
    const provider = fakeProvider(tree);
    const outcome = await genericScanForSrs(provider, "", "auto", rootFolders);
    expect(outcome.status).toBe("partial");
    expect(provider.list).toHaveBeenCalledTimes(18);
  });
});

describe("GitHubProvider.scanForSrs", () => {
  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function makeProvider(): GitHubProvider {
    const provider = new GitHubProvider({ clientId: "c", redirectUri: "https://app.test/" });
    // biome-ignore lint/suspicious/noExplicitAny: test seam — skip the OAuth popup
    (provider as any).accessToken = "token";
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    (provider as any).expiresAt = Date.now() + 3_600_000;
    return provider;
  }

  it("scans a branch with exactly one tree request; finds nested repos and files, applies depth/skip/nesting rules", async () => {
    const provider = makeProvider();
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        sha: "t1",
        truncated: false,
        tree: [
          { path: "sub", mode: "040000", type: "tree", sha: "s1" },
          { path: "sub/manifest.json", mode: "100644", type: "blob", sha: "s2" },
          { path: "sub/records", mode: "040000", type: "tree", sha: "s3" },
          { path: "sub/records/x.srsj", mode: "100644", type: "blob", sha: "s4" },
          { path: "nested/repo2", mode: "040000", type: "tree", sha: "s5" },
          { path: "nested/repo2/.srs", mode: "040000", type: "tree", sha: "s6" },
          { path: "exports/export.srsj", mode: "100644", type: "blob", sha: "s7" },
          { path: "deep/a/b/toodeep.srsj", mode: "100644", type: "blob", sha: "s8" },
          { path: "node_modules/pkg/x.srsj", mode: "100644", type: "blob", sha: "s9" },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await provider.scanForSrs("octo/gov:main", "auto");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/git/trees/main?recursive=1");

    const repoPaths = outcome.entries
      .filter((entry) => entry.kind === "repository")
      .map((entry) => entry.displayPath)
      .sort();
    expect(repoPaths).toEqual(["nested/repo2", "sub"]);
    const filePaths = outcome.entries
      .filter((entry) => entry.kind === "file")
      .map((entry) => entry.displayPath);
    // x.srsj is inside a detected repo; toodeep.srsj exceeds depth; node_modules is skipped.
    expect(filePaths).toEqual(["exports/export.srsj"]);
    expect(outcome.status).toBe("complete");

    // Repository entries route through openTree via the standard path grammar,
    // and keep a clean base name for the handle.
    const sub = outcome.entries.find((entry) => entry.displayPath === "sub");
    expect(sub).toMatchObject({ path: "octo/gov:main:sub", id: "octo/gov:main:sub#repo", name: "sub" });
    const nested = outcome.entries.find((entry) => entry.displayPath === "nested/repo2");
    expect(nested).toMatchObject({ name: "repo2" });
  });

  it("when the scan root is itself a repo, emits only the root and suppresses nested content", async () => {
    const provider = makeProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          sha: "t1",
          truncated: false,
          tree: [
            { path: "manifest.json", mode: "100644", type: "blob", sha: "s1" },
            { path: "records", mode: "040000", type: "tree", sha: "s2" },
            { path: "records/a.srsj", mode: "100644", type: "blob", sha: "s3" },
            { path: "sub/manifest.json", mode: "100644", type: "blob", sha: "s4" },
          ],
        })
      )
    );
    const outcome = await provider.scanForSrs("octo/gov:main", "auto");
    // The root repo is surfaced once; the nested a.srsj and sub/ repo are inside it → suppressed.
    expect(outcome.entries).toHaveLength(1);
    expect(outcome.entries[0]).toMatchObject({
      kind: "repository",
      name: "gov",
      path: "octo/gov:main:",
      displayPath: "",
    });
  });

  it("reports a truncated tree as partial", async () => {
    const provider = makeProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ sha: "t1", truncated: true, tree: [] }))
    );
    const outcome = await provider.scanForSrs("octo/big:main", "explicit");
    expect(outcome).toMatchObject({ status: "partial", reason: "truncated" });
  });

  it("account scan: skips large accounts in auto mode without extra requests", async () => {
    const provider = makeProvider();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const seed = Array.from({ length: 30 }, (_, i) => folder(`o/r${i}`));
    const outcome = await provider.scanForSrs("", "auto", seed);
    expect(outcome).toMatchObject({ status: "skipped", reason: "too-large" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("account scan: fans out over recent repos and labels results with the repo name", async () => {
    const provider = makeProvider();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/user/repos")) {
        return json([
          { full_name: "octo/gov", name: "gov", default_branch: "main" },
          { full_name: "octo/misc", name: "misc", default_branch: "master" },
        ]);
      }
      if (url.includes("/repos/octo/gov/git/trees/main")) {
        return json({
          sha: "t1",
          truncated: false,
          tree: [{ path: "manifest.json", mode: "100644", type: "blob", sha: "s1" }],
        });
      }
      if (url.includes("/repos/octo/misc/git/trees/master")) {
        return json({
          sha: "t2",
          truncated: false,
          tree: [{ path: "notes/log.srsj", mode: "100644", type: "blob", sha: "s2" }],
        });
      }
      return json({ message: "unexpected" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const seed = [folder("octo/gov"), folder("octo/misc")];
    const outcome = await provider.scanForSrs("", "auto", seed);
    expect(outcome.status).toBe("complete");
    const byPath = Object.fromEntries(outcome.entries.map((entry) => [entry.displayPath, entry]));
    // Root-marker repo surfaces as the repo itself; file results carry the repo prefix.
    expect(byPath["octo/gov"]).toMatchObject({ kind: "repository", path: "octo/gov:main:" });
    expect(byPath["octo/misc/notes/log.srsj"]).toMatchObject({ kind: "file", name: "log.srsj" });
  });
});
