/**
 * Git Data API primitives for exploded-repo (multi-file, git-diffable) trees.
 *
 * `git-contents.ts` is the single-file Contents API layer (`GET`/`PUT contents/{path}`);
 * this module is its sibling for the Git Data API (`git/refs`, `git/commits`, `git/trees`,
 * `git/blobs`), which reads/writes a whole directory subtree in one commit instead of one
 * file at a time. The two target different GitHub REST surfaces with different response
 * shapes and different conflict signals (non-fast-forward ref update here, vs. a stale blob
 * SHA there), so they stay separate rather than sharing a combinatorial branch-on-mode.
 *
 * Every tree is scoped to a `dir` within the repo (the folder containing `manifest.json`,
 * which may be the branch root or a subdirectory). All paths this module hands back or
 * accepts in `entries`/`files` are **dir-relative** — never full-repo-relative — so a diff
 * against a retained base map can never see, and therefore can never infer a deletion for,
 * a path outside `dir` (ADR-016 §5).
 */
import { StorageConflictError, StorageFetchError } from "./errors.js";

export interface GitDataLocation {
  apiBase: string;
  owner: string;
  repo: string;
  branch: string;
  /** Repo-relative directory the SRS tree is mounted at; "" for the branch root. */
  dir: string;
}

export interface TreeEntry {
  mode: string;
  sha: string;
}

export interface RepoTreeBase {
  commitSha: string;
  /** SHA of the whole branch's root tree (the commit's tree). */
  rootTreeSha: string;
  /** SHA of the tree AT `dir` — equals rootTreeSha when dir === "". */
  subtreeSha: string;
  /** path -> {mode, sha}, blobs only, dir-relative (stripped of the `dir/` prefix). */
  entries: Record<string, TreeEntry>;
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
}

interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated?: boolean;
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message ?? text;
  } catch {
    return text || response.statusText;
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function repoBase(location: Pick<GitDataLocation, "apiBase" | "owner" | "repo">): string {
  return `${location.apiBase}/repos/${location.owner}/${location.repo}`;
}

/** Decode a base64 string (with GitHub's inserted newlines tolerated) to raw bytes. */
function decodeBase64Bytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Encode raw bytes to base64. */
function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Fetch a full recursive tree listing in one request, without interpreting
 * truncation. `treeIsh` may be a tree SHA, a commit SHA, or a branch/tag name
 * (the API resolves refs) — which is what lets a discovery scan (ADR-018)
 * enumerate a whole branch in a single request. Callers that require a
 * complete tree (readBranchBase) throw on `truncated`; callers that can
 * degrade (scans) report partial results instead.
 */
export async function fetchRecursiveTree(
  location: Pick<GitDataLocation, "apiBase" | "owner" | "repo">,
  token: string,
  treeIsh: string
): Promise<{ sha: string; tree: GitHubTreeEntry[]; truncated: boolean }> {
  const treeRes = await fetch(
    `${repoBase(location)}/git/trees/${encodeURIComponent(treeIsh)}?recursive=1`,
    { headers: authHeaders(token) }
  );
  if (!treeRes.ok) {
    throw new StorageFetchError(`Could not read tree "${treeIsh}": ${await parseError(treeRes)}`);
  }
  const tree = (await treeRes.json()) as GitHubTreeResponse;
  return { sha: tree.sha, tree: tree.tree, truncated: tree.truncated === true };
}

/**
 * Read a branch's base state, scoped to `location.dir`: the commit/root-tree/subtree SHAs
 * and a dir-relative map of every blob under `dir` (submodules and symlinks excluded).
 */
export async function readBranchBase(
  location: GitDataLocation,
  token: string
): Promise<RepoTreeBase> {
  const base = repoBase(location);

  const refRes = await fetch(`${base}/git/ref/heads/${encodeURIComponent(location.branch)}`, {
    headers: authHeaders(token),
  });
  if (!refRes.ok) {
    throw new StorageFetchError(
      `Could not read branch "${location.branch}": ${await parseError(refRes)}`
    );
  }
  const ref = (await refRes.json()) as { object?: { sha?: string } };
  const commitSha = ref.object?.sha;
  if (!commitSha) throw new StorageFetchError(`Branch "${location.branch}" has no head commit.`);

  const commitRes = await fetch(`${base}/git/commits/${commitSha}`, {
    headers: authHeaders(token),
  });
  if (!commitRes.ok) {
    throw new StorageFetchError(
      `Could not read commit "${commitSha}": ${await parseError(commitRes)}`
    );
  }
  const commit = (await commitRes.json()) as { tree?: { sha?: string } };
  const rootTreeSha = commit.tree?.sha;
  if (!rootTreeSha) throw new StorageFetchError(`Commit "${commitSha}" has no tree.`);

  const tree = await fetchRecursiveTree(location, token, rootTreeSha);
  if (tree.truncated) {
    throw new StorageFetchError(
      `Branch "${location.branch}" has too many files for a single tree read (GitHub truncated the response). Chunked/paginated reads are not yet supported.`
    );
  }

  const dir = location.dir;
  let subtreeSha = rootTreeSha;
  if (dir !== "") {
    const subtreeEntry = tree.tree.find((entry) => entry.type === "tree" && entry.path === dir);
    if (!subtreeEntry) {
      throw new StorageFetchError(
        `Directory "${dir}" no longer exists on branch "${location.branch}".`
      );
    }
    subtreeSha = subtreeEntry.sha;
  }

  const prefix = dir === "" ? "" : `${dir}/`;
  const entries: Record<string, TreeEntry> = {};
  for (const entry of tree.tree) {
    if (entry.type !== "blob") continue; // skip dir markers
    if (entry.mode === "160000" || entry.mode === "120000") continue; // submodules, symlinks
    if (!entry.path.startsWith(prefix)) continue;
    const relativePath = entry.path.slice(prefix.length);
    entries[relativePath] = { mode: entry.mode, sha: entry.sha };
  }

  return { commitSha, rootTreeSha, subtreeSha, entries };
}

/** Read a single blob's raw bytes by SHA. */
export async function readBlob(
  location: Pick<GitDataLocation, "apiBase" | "owner" | "repo">,
  token: string,
  sha: string
): Promise<Uint8Array> {
  const response = await fetch(`${repoBase(location)}/git/blobs/${sha}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new StorageFetchError(`Could not read blob "${sha}": ${await parseError(response)}`);
  }
  const data = (await response.json()) as { content?: string; encoding?: string };
  if (data.encoding !== "base64" || data.content == null) {
    throw new StorageFetchError("Git host did not return a base64 blob.");
  }
  return decodeBase64Bytes(data.content);
}

/** Read many blobs by SHA with a small bounded concurrency pool. */
export async function readBlobs(
  location: Pick<GitDataLocation, "apiBase" | "owner" | "repo">,
  token: string,
  shas: string[],
  concurrency = 6
): Promise<Map<string, Uint8Array>> {
  const results = new Map<string, Uint8Array>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < shas.length) {
      const index = next++;
      const sha = shas[index];
      results.set(sha, await readBlob(location, token, sha));
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, shas.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Compute a git blob object's SHA-1 hash (`blob {len}\0{content}`), lowercase hex. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const object = new Uint8Array(header.byteLength + bytes.byteLength);
  object.set(header, 0);
  object.set(bytes, header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", object);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface CommitFilesParams {
  baseCommitSha: string;
  baseRootTreeSha: string;
  baseSubtreeSha: string;
  /** Dir-relative, as returned by readBranchBase. */
  baseEntries: Record<string, TreeEntry>;
  /** Dir-relative paths; null = delete. Already diffed by the caller — sparse, not the full tree. */
  files: Record<string, Uint8Array | null>;
  message: string;
}

export interface CommitFilesResult {
  commitSha: string;
  rootTreeSha: string;
  subtreeSha: string;
}

interface NewTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha?: string | null;
  content?: string;
}

/**
 * Commit a sparse set of changed/deleted dir-relative paths as one commit, scoped to
 * `location.dir` via a subtree-then-splice: build a new subtree from `baseSubtreeSha` with
 * only the changed entries, then (if `dir !== ""`) splice it into the root tree with a
 * single override entry — every other path in the branch is inherited from `base_tree`
 * unchanged. Returns `null` (no API calls at all) when `params.files` is empty.
 */
export async function commitFiles(
  location: GitDataLocation,
  token: string,
  params: CommitFilesParams
): Promise<CommitFilesResult | null> {
  const paths = Object.keys(params.files);
  if (paths.length === 0) return null;

  const base = repoBase(location);
  const entries: NewTreeEntry[] = [];
  for (const path of paths) {
    const value = params.files[path];
    const baseEntry = params.baseEntries[path];
    if (value === null) {
      if (!baseEntry) continue; // deleting a path that was never there is a no-op
      // GitHub's create-tree API deletes an entry when `sha` is explicitly null.
      entries.push({ path, mode: baseEntry.mode, type: "blob", sha: null });
      continue;
    }
    const mode = baseEntry?.mode ?? "100644";
    let decoded: string | null = null;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
    } catch {
      decoded = null;
    }
    if (decoded !== null) {
      entries.push({ path, mode, type: "blob", content: decoded });
    } else {
      const blobRes = await fetch(`${base}/git/blobs`, {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ content: encodeBase64Bytes(value), encoding: "base64" }),
      });
      if (blobRes.status === 403) {
        throw new StorageFetchError(
          `Write denied (403: ${await parseError(blobRes)}). The connected GitHub App has read but not write access here — set its Contents permission to Read & write, approve the update on the installation, then sign out and back in.`
        );
      }
      if (!blobRes.ok) {
        throw new StorageFetchError(
          `Could not create blob for "${path}": ${await parseError(blobRes)}`
        );
      }
      const blob = (await blobRes.json()) as { sha?: string };
      if (!blob.sha)
        throw new StorageFetchError(`Git host did not return a SHA for blob "${path}".`);
      entries.push({ path, mode, type: "blob", sha: blob.sha });
    }
  }

  const subtreeRes = await fetch(`${base}/git/trees`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: params.baseSubtreeSha, tree: entries }),
  });
  if (subtreeRes.status === 403) {
    throw new StorageFetchError(
      `Write denied (403: ${await parseError(subtreeRes)}). The connected GitHub App has read but not write access here — set its Contents permission to Read & write, approve the update on the installation, then sign out and back in.`
    );
  }
  if (!subtreeRes.ok) {
    throw new StorageFetchError(`Could not build subtree: ${await parseError(subtreeRes)}`);
  }
  const subtree = (await subtreeRes.json()) as { sha?: string };
  if (!subtree.sha) throw new StorageFetchError("Git host did not return the new subtree SHA.");
  const newSubtreeSha = subtree.sha;

  let newRootTreeSha = newSubtreeSha;
  if (location.dir !== "") {
    const rootRes = await fetch(`${base}/git/trees`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: params.baseRootTreeSha,
        tree: [{ path: location.dir, mode: "040000", type: "tree", sha: newSubtreeSha }],
      }),
    });
    if (!rootRes.ok) {
      throw new StorageFetchError(
        `Could not splice subtree into root tree: ${await parseError(rootRes)}`
      );
    }
    const root = (await rootRes.json()) as { sha?: string };
    if (!root.sha) throw new StorageFetchError("Git host did not return the new root tree SHA.");
    newRootTreeSha = root.sha;
  }

  const commitRes = await fetch(`${base}/git/commits`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      tree: newRootTreeSha,
      parents: [params.baseCommitSha],
    }),
  });
  if (!commitRes.ok) {
    throw new StorageFetchError(`Could not create commit: ${await parseError(commitRes)}`);
  }
  const newCommit = (await commitRes.json()) as { sha?: string };
  if (!newCommit.sha) throw new StorageFetchError("Git host did not return the new commit SHA.");

  const refRes = await fetch(`${base}/git/refs/heads/${encodeURIComponent(location.branch)}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });
  if (!refRes.ok) {
    const detail = await parseError(refRes);
    if (refRes.status === 422 && /not a fast.?forward/i.test(detail)) {
      throw new StorageConflictError();
    }
    if (refRes.status === 403) {
      throw new StorageFetchError(
        `Write denied (403: ${detail}). The connected GitHub App has read but not write access here — set its Contents permission to Read & write, approve the update on the installation, then sign out and back in.`
      );
    }
    throw new StorageFetchError(`Could not update branch "${location.branch}": ${detail}`);
  }

  return { commitSha: newCommit.sha, rootTreeSha: newRootTreeSha, subtreeSha: newSubtreeSha };
}
