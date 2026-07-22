import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageConflictError, StorageFetchError } from "../src/lib/storage/errors.js";
import {
  type GitDataLocation,
  commitFiles,
  gitBlobSha,
  readBlob,
  readBlobs,
  readBranchBase,
} from "../src/lib/storage/git-data.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rootLocation: GitDataLocation = {
  apiBase: "https://api.github.com",
  owner: "octo",
  repo: "gov",
  branch: "main",
  dir: "",
};

const subdirLocation: GitDataLocation = { ...rootLocation, dir: "governance" };

const nestedLocation: GitDataLocation = { ...rootLocation, dir: "docs/governance/tree" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function refCommitTreeSequence(
  treeResponse: unknown,
  opts: { commitSha?: string; rootTreeSha?: string } = {}
): Response[] {
  const commitSha = opts.commitSha ?? "commit-1";
  const rootTreeSha = opts.rootTreeSha ?? "tree-root";
  return [
    jsonResponse({ object: { sha: commitSha } }),
    jsonResponse({ tree: { sha: rootTreeSha } }),
    jsonResponse(treeResponse),
  ];
}

describe("git-data: readBranchBase", () => {
  it('returns a dir-relative base map for the branch root (dir === "")', async () => {
    const fetchMock = vi.fn();
    for (const response of refCommitTreeSequence({
      sha: "tree-root",
      tree: [
        { path: "manifest.json", mode: "100644", type: "blob", sha: "sha-manifest" },
        { path: "package", mode: "040000", type: "tree", sha: "sha-package-dir" },
        { path: "package/types.json", mode: "100644", type: "blob", sha: "sha-types" },
        { path: "submodule", mode: "160000", type: "commit", sha: "sha-submodule" },
        { path: "link", mode: "120000", type: "blob", sha: "sha-link" },
      ],
    })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal("fetch", fetchMock);

    const base = await readBranchBase(rootLocation, "token");
    expect(base.commitSha).toBe("commit-1");
    expect(base.rootTreeSha).toBe("tree-root");
    expect(base.subtreeSha).toBe("tree-root");
    expect(base.entries).toEqual({
      "manifest.json": { mode: "100644", sha: "sha-manifest" },
      "package/types.json": { mode: "100644", sha: "sha-types" },
    });
  });

  it("scopes to a single-segment subdirectory, stripping the dir/ prefix", async () => {
    const fetchMock = vi.fn();
    for (const response of refCommitTreeSequence({
      sha: "tree-root",
      tree: [
        { path: "README.md", mode: "100644", type: "blob", sha: "sha-readme" },
        { path: "governance", mode: "040000", type: "tree", sha: "sha-governance" },
        { path: "governance/manifest.json", mode: "100644", type: "blob", sha: "sha-manifest" },
        { path: "governance/package", mode: "040000", type: "tree", sha: "sha-package" },
        {
          path: "governance/package/types.json",
          mode: "100644",
          type: "blob",
          sha: "sha-types",
        },
      ],
    })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal("fetch", fetchMock);

    const base = await readBranchBase(subdirLocation, "token");
    expect(base.subtreeSha).toBe("sha-governance");
    expect(base.entries).toEqual({
      "manifest.json": { mode: "100644", sha: "sha-manifest" },
      "package/types.json": { mode: "100644", sha: "sha-types" },
    });
    // Nothing from outside the dir leaks in.
    expect(base.entries["README.md"]).toBeUndefined();
  });

  it("scopes to a multi-level nested subdirectory", async () => {
    const fetchMock = vi.fn();
    for (const response of refCommitTreeSequence({
      sha: "tree-root",
      tree: [
        { path: "README.md", mode: "100644", type: "blob", sha: "sha-readme" },
        { path: "docs", mode: "040000", type: "tree", sha: "sha-docs" },
        { path: "docs/governance", mode: "040000", type: "tree", sha: "sha-docs-governance" },
        {
          path: "docs/governance/tree",
          mode: "040000",
          type: "tree",
          sha: "sha-nested-subtree",
        },
        {
          path: "docs/governance/tree/manifest.json",
          mode: "100644",
          type: "blob",
          sha: "sha-manifest",
        },
        {
          path: "docs/governance/tree/package/types.json",
          mode: "100644",
          type: "blob",
          sha: "sha-types",
        },
      ],
    })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal("fetch", fetchMock);

    const base = await readBranchBase(nestedLocation, "token");
    expect(base.subtreeSha).toBe("sha-nested-subtree");
    expect(base.entries).toEqual({
      "manifest.json": { mode: "100644", sha: "sha-manifest" },
      "package/types.json": { mode: "100644", sha: "sha-types" },
    });
  });

  it("throws when the dir no longer exists on the branch", async () => {
    const fetchMock = vi.fn();
    for (const response of refCommitTreeSequence({
      sha: "tree-root",
      tree: [{ path: "README.md", mode: "100644", type: "blob", sha: "sha-readme" }],
    })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal("fetch", fetchMock);
    await expect(readBranchBase(subdirLocation, "token")).rejects.toBeInstanceOf(StorageFetchError);
  });

  it("fails loud on a truncated tree response instead of returning a partial tree", async () => {
    const fetchMock = vi.fn();
    for (const response of refCommitTreeSequence({
      sha: "tree-root",
      tree: [],
      truncated: true,
    })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal("fetch", fetchMock);
    await expect(readBranchBase(rootLocation, "token")).rejects.toBeInstanceOf(StorageFetchError);
  });
});

describe("git-data: readBlob / readBlobs", () => {
  it("decodes a base64 blob to raw bytes", async () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: btoa(binary), encoding: "base64" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await readBlob(rootLocation, "token", "sha-1");
    expect(Array.from(result)).toEqual(Array.from(bytes));
  });

  it("reads many blobs with bounded concurrency and returns all of them", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          content: btoa("x"),
          encoding: "base64",
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const shas = Array.from({ length: 10 }, (_, i) => `sha-${i}`);
    const result = await readBlobs(rootLocation, "token", shas, 3);
    expect(result.size).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

describe("git-data: gitBlobSha", () => {
  it("matches git's known blob hash for an empty file", async () => {
    const sha = await gitBlobSha(new Uint8Array(0));
    expect(sha).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });

  it("matches git's known blob hash for a short text file", async () => {
    // `printf 'hello world' | git hash-object --stdin` => 95d09f2b10159347eece71399a7e2e907ea3df4f
    const sha = await gitBlobSha(new TextEncoder().encode("hello world"));
    expect(sha).toBe("95d09f2b10159347eece71399a7e2e907ea3df4f");
  });
});

describe("git-data: commitFiles", () => {
  const baseParams = {
    baseCommitSha: "commit-1",
    baseRootTreeSha: "tree-root",
    baseSubtreeSha: "tree-root",
    baseEntries: {
      "manifest.json": { mode: "100644", sha: "sha-manifest" },
    },
    message: "update",
  };

  it("makes zero fetch calls and returns null on an empty diff", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await commitFiles(rootLocation, "token", { ...baseParams, files: {} });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("silently drops a deletion for a path not in baseEntries", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-subtree" })); // POST git/trees (subtree)
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-commit" })); // POST git/commits
    fetchMock.mockResolvedValueOnce(jsonResponse({})); // PATCH git/refs (ok)
    vi.stubGlobal("fetch", fetchMock);

    await commitFiles(rootLocation, "token", {
      ...baseParams,
      files: { "never-existed.json": null, "manifest.json": new TextEncoder().encode("{}") },
    });

    const subtreeCall = fetchMock.mock.calls[0];
    const body = JSON.parse((subtreeCall[1] as RequestInit).body as string) as {
      tree: Array<{ path: string }>;
    };
    expect(body.tree.map((e) => e.path)).toEqual(["manifest.json"]);
  });

  it("emits content for UTF-8 bytes and preserves the base mode on update", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-subtree" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-commit" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await commitFiles(rootLocation, "token", {
      ...baseParams,
      baseEntries: { "manifest.json": { mode: "100755", sha: "sha-manifest" } },
      files: { "manifest.json": new TextEncoder().encode('{"a":1}') },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      tree: Array<{ path: string; mode: string; content?: string }>;
    };
    expect(body.tree[0]).toMatchObject({
      path: "manifest.json",
      mode: "100755",
      content: '{"a":1}',
    });
  });

  it("defaults to mode 100644 and posts a separate blob for non-UTF-8 bytes", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-blob" })); // POST git/blobs
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-subtree" })); // POST git/trees
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-commit" })); // POST git/commits
    fetchMock.mockResolvedValueOnce(jsonResponse({})); // PATCH git/refs
    vi.stubGlobal("fetch", fetchMock);

    const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
    await commitFiles(rootLocation, "token", {
      ...baseParams,
      baseEntries: {},
      files: { "logo.png": invalidUtf8 },
    });

    const treeBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string) as {
      tree: Array<{ path: string; mode: string; sha?: string }>;
    };
    expect(treeBody.tree[0]).toEqual({
      path: "logo.png",
      mode: "100644",
      type: "blob",
      sha: "new-blob",
    });
  });

  it('splices the subtree into the root tree only when dir !== ""', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-subtree" })); // subtree
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-root" })); // root splice
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-commit" })); // commit
    fetchMock.mockResolvedValueOnce(jsonResponse({})); // ref patch
    vi.stubGlobal("fetch", fetchMock);

    const result = await commitFiles(subdirLocation, "token", {
      ...baseParams,
      baseRootTreeSha: "tree-root",
      baseSubtreeSha: "sha-governance",
      files: { "manifest.json": new TextEncoder().encode("{}") },
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const rootSpliceBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string
    ) as { base_tree: string; tree: Array<Record<string, unknown>> };
    expect(rootSpliceBody.base_tree).toBe("tree-root");
    expect(rootSpliceBody.tree).toEqual([
      { path: "governance", mode: "040000", type: "tree", sha: "new-subtree" },
    ]);
    expect(result).toEqual({
      commitSha: "new-commit",
      rootTreeSha: "new-root",
      subtreeSha: "new-subtree",
    });
  });

  it("splices correctly for a multi-level nested dir (docs/governance/tree)", async () => {
    // Fixes Architecture Reviewer round-2 (Stage 7) finding 2: the single-entry
    // base_tree override technique is well-documented for blob entries at a
    // multi-segment path, but this plan relies on the same automatic
    // intermediate-tree-creation behavior for a tree-type override entry — assert
    // the request we actually send targets the full nested path, not just one segment.
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-nested-subtree" })); // subtree
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-root" })); // root splice
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-commit" })); // commit
    fetchMock.mockResolvedValueOnce(jsonResponse({})); // ref patch
    vi.stubGlobal("fetch", fetchMock);

    const result = await commitFiles(nestedLocation, "token", {
      ...baseParams,
      baseRootTreeSha: "tree-root",
      baseSubtreeSha: "sha-nested-subtree",
      files: { "manifest.json": new TextEncoder().encode("{}") },
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const subtreeBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      base_tree: string;
    };
    expect(subtreeBody.base_tree).toBe("sha-nested-subtree");
    const rootSpliceBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string
    ) as { base_tree: string; tree: Array<Record<string, unknown>> };
    expect(rootSpliceBody.base_tree).toBe("tree-root");
    expect(rootSpliceBody.tree).toEqual([
      { path: "docs/governance/tree", mode: "040000", type: "tree", sha: "new-nested-subtree" },
    ]);
    expect(result).toEqual({
      commitSha: "new-commit",
      rootTreeSha: "new-root",
      subtreeSha: "new-nested-subtree",
    });
  });

  it('does not splice when dir === "" — the new subtree IS the new root tree', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-root" })); // subtree === root
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-commit" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const result = await commitFiles(rootLocation, "token", {
      ...baseParams,
      files: { "manifest.json": new TextEncoder().encode("{}") },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      commitSha: "new-commit",
      rootTreeSha: "new-root",
      subtreeSha: "new-root",
    });
  });

  it.each([409, 422])(
    "does not misclassify a non-fast-forward-unrelated %i on the ref PATCH as a conflict",
    async (status) => {
      const fetchMock = vi.fn();
      fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-subtree" }));
      fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-commit" }));
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Invalid request" }), {
          status,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        commitFiles(rootLocation, "token", {
          ...baseParams,
          files: { "manifest.json": new TextEncoder().encode("{}") },
        })
      ).rejects.toBeInstanceOf(StorageFetchError);
    }
  );

  it("maps a 422 'not a fast forward' ref PATCH failure to StorageConflictError", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-subtree" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: "new-commit" }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Update is not a fast forward" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      commitFiles(rootLocation, "token", {
        ...baseParams,
        files: { "manifest.json": new TextEncoder().encode("{}") },
      })
    ).rejects.toBeInstanceOf(StorageConflictError);
  });

  it("explains a 403 write as a missing Contents write permission", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Resource not accessible by integration" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      commitFiles(rootLocation, "token", {
        ...baseParams,
        files: { "manifest.json": new TextEncoder().encode("{}") },
      })
    ).rejects.toThrow(/Read & write/);
  });
});
