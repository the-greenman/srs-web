# Plan: GitHub exploded-repo mode — open a whole SRS tree, edit, write back as one commit (#246)

## Summary

srs-web today opens/saves a single `.srsj`/`.srs` blob from GitHub via the Contents API. Epic 10
Phase 2 ([muDemocracy.org#101](https://github.com/the-greenman/muDemocracy.org/issues/101)) adds
**exploded-repo mode**: open a whole git-diffable SRS tree (many files under a `manifest.json`
root), edit it in the same governance/guides UI, and write every changed file back as **one**
commit via the GitHub Git Data API (tree/blob/commit/ref endpoints — not the single-file Contents
API). This depends on srs-rust#684 (tree bindings, ADR-037/038), which has shipped: the
`v0.1.0-build.226` release (published 2026-07-22T13:10:37Z, after #684 merged) exposes
`SrsRepository.load_tree(files)` (static) and `.export_tree()` (instance) in
`srs_bindings.d.ts` — confirmed by downloading `srs-bindings-web.tar.gz` and grepping the
generated `.d.ts`. The dependency gate is clear; this plan proceeds straight to implementation.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions. No new role is needed — Web App Worker,
Architecture Reviewer (srs-web), and Verification Agent (srs-web) cover this plan's surface.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS. All tree assembly/diffing of *SRS record content* stays behind WASM (`load_tree`/`export_tree`); TS only does byte-level git plumbing (which paths changed, git blob SHAs, tree/commit construction) — that is VCS mechanics, not SRS semantics, same boundary ADR-001 already draws around `git-contents.ts`. | accepted |
| [ADR-011](../docs/adr/011-oauth-proxy-worker.md) | GitHub auth already flows through the same-origin Worker token exchange; tree mode reuses the existing `GitHubProvider` token/session, no auth changes. | accepted |
| [ADR-015](../docs/adr/015-binary-storage-interface.md) | Precedent for extending `DocumentHandle` with optional/discriminated capabilities rather than widening `read`/`write`. This plan follows the same shape (add a `kind` discriminant) rather than ADR-015's `readBytes?`/`writeBytes?` pattern, because dispatch here is 3-way (text/bytes/tree), not a single optional capability. | accepted |
| **ADR-016 (new)** | `DocumentHandle` gains a required `kind: "text" \| "bytes" \| "tree"` discriminant, replacing `.srs`-suffix name-sniffing in `App.svelte` as the load/save dispatch key. A new `RepoTreeAware` interface (`readTree()`/`commitTree()`) is added alongside `GitBranchAware` for tree-mode handles. Git blob-SHA diffing (computed client-side via `crypto.subtle.digest("SHA-1", ...)` over the git blob object format) replaces byte-for-byte comparison so `commitTree` only uploads genuinely changed paths. | proposed |

---

## Contracts

### WASM API surface

**Confirmed available, no further srs-rust work needed.** From `srs_bindings.d.ts` (build 226):

```ts
interface SrsRepository {
  /** Export the session as an exploded file tree (ADR-038): a JS object of
   *  `{ path: Uint8Array }`. Untouched files are byte-identical to what was loaded. */
  export_tree(): any; // actually Record<string, Uint8Array>

  /** Load a repository from an exploded file tree (ADR-038). `files` is a JS object
   *  mapping repo-relative forward-slash paths to `Uint8Array` contents. */
  static load_tree(files: any): SrsRepository;
}
```

`srs-client.ts` currently mirrors only `load`/`load_archive` (static) and `export_srsj`/
`export_archive` (instance) — `load_tree`/`export_tree` are genuinely unwired on the TS side
(confirmed: no occurrence of either name anywhere under `src/`). This plan adds the TS mirrors
in Phase 3. **State: bindings exist; TS facade does not yet — this plan adds it.**

### TypeScript types

- `DocumentHandle` (types.ts) gains `readonly kind: "text" | "bytes" | "tree"`.
- New `RepoTreeAware` interface (types.ts):
  ```ts
  export interface RepoTreeAware {
    readTree(): Promise<Record<string, Uint8Array>>;
    commitTree(
      files: Record<string, Uint8Array>,
      opts: { branch: string; createFromCurrent?: boolean; message?: string }
    ): Promise<WriteResult>;
  }
  ```
- `StorageEntry.kind` gains a `"repository"` variant for the synthetic "Open as SRS repository"
  entry (distinct from `"file"`/`"folder"`) — `SourceChooser.chooseEntry` branches on it to call
  a new optional `StorageProvider.openTree?(entry): Promise<DocumentHandle & RepoTreeAware>`
  instead of `open(entry)`.

No payload-schema-derived types change (`export_tree`'s `Record<string, Uint8Array>` is a raw
byte-map, not an SRS payload shape).

---

## Scope

In scope (mirrors the issue body's four numbered items):

1. **`src/lib/storage/git-data.ts`** (sibling of `git-contents.ts`) — Git Data API primitives:
   `readBranchBase`, `readBlob`/bounded-concurrency blob fetch, `gitBlobSha` (client-side git
   blob SHA1), `commitFiles`.
2. **`src/lib/storage/github.ts`** — `GitHubRepoTreeHandle` (`DocumentHandle` + `GitBranchAware`
   + `RepoTreeAware`); `GitHubProvider.openTree()`; `listContents` synthetic
   "Open as SRS repository" entry when a directory contains `manifest.json`; `.gitkeep` write
   for a missing `.srs/` marker.
3. **`src/lib/storage/types.ts`** — `kind` discriminant, `RepoTreeAware`, `StorageEntry` repo
   variant, `StorageProvider.openTree?`.
4. **`src/lib/srs-client.ts`** — `loadRepoFromTree(files)` / `exportTree(repo)` facade functions
   mirroring the existing `loadRepo`/`exportSrsj` pattern.
5. **`src/App.svelte`** — `loadDocument`/`confirmGitSave`/`saveDirect` branch on `handle.kind`
   instead of `/\.srs$/i` name-sniffing (2 genuine dispatch sites: `loadDocument` line 107,
   `saveDirect` line 242; `confirmGitSave` at lines 272–301 gains a kind branch where it had none
   before — see Phase 4. Line 177, inside `loadArchiveDocument`, is a display-name suffix strip on
   an already-known-archive path, not a dispatch decision, and is out of scope for this change);
   tree-mode git save reuses `GitSaveModal` → routes to `commitTree` instead of
   `saveToBranch(exportSrsj(...))`.
6. **`src/lib/components/SourceChooser.svelte`** — synthetic "Open as SRS repository" entry
   rendering + `chooseEntry` branch calling `provider.openTree?.(entry)`.
7. **Fix in passing:** guard `confirmGitSave` so it dispatches on `activeDocument.kind` — today
   it unconditionally calls `exportSrsj(repo)` before `saveToBranch`, which would silently
   corrupt a `kind: "tree"` (or any future `kind: "bytes"`) handle routed through the git-save
   modal. This PR is what first makes a non-`"text"`, `GitBranchAware` handle reachable, so the
   guard ships in the same PR that introduces the risk.
8. **Tests:** `tests/git-data.test.ts` (new, mirrors `tests/storage.test.ts`'s GitHub section:
   `it.each` conflict-status mapping, `Response`-mocked `fetch`, `(provider as any).accessToken`
   seam); additions to `tests/storage.test.ts` for `GitHubRepoTreeHandle`/`openTree`;
   `SourceChooser` synthetic-entry unit test; `e2e/cloud-storage.spec.ts` extension with an
   exploded-repo fixture under `e2e/fixtures/`.

**Out of scope** (filed as follow-up issues in Stage 3, linked under Epic 10 —
muDemocracy.org#101):

- Codeberg/Forgejo Git Data API support — `git-data.ts` primitives are written against the
  GitHub REST shape only; a Codeberg sibling is a separate story (mirrors how `git-contents.ts`
  itself started GitHub-only).
- Local (on-device) exploded-tree open/save — this plan is GitHub-only, per the issue title.
- Editing which files are unknown-passthrough vs SRS-managed — `export_tree()`'s "untouched
  files ride along verbatim" behaviour is entirely a WASM/srs-rust concern (ADR-038); srs-web
  treats the returned file map opaquely.
- Deleting/renaming top-level repo structure (e.g. moving `.srs/` itself) — `commitFiles`
  supports per-path add/update/delete only, not repo-level restructuring UX.
- Very large repos that trip GitHub's recursive-tree `truncated: true` limit — this plan fails
  loud (throws) rather than paginating/chunking; chunked tree reads are follow-up work if it
  turns out to matter in practice.
- Merge/rebase UX when a tree commit's non-fast-forward PATCH conflicts — this plan surfaces
  `StorageConflictError` (reload-and-retry, same UX as the existing single-file conflict path),
  not a 3-way merge.

---

## Phases

### Phase 1: Git Data API primitives (`git-data.ts`)

**Goal:** Read a full branch tree (base commit/tree SHA + path→{mode,sha} map) and every blob's
bytes, and commit a sparse set of changed/deleted paths back as one commit with non-force
ref-update conflict detection — entirely WASM-independent, fully unit-testable now.

**Agent:** Web App Worker

#### Tasks

- [ ] `src/lib/storage/git-data.ts`:
  ```ts
  export interface GitDataLocation { apiBase: string; owner: string; repo: string; branch: string; dir: string; }
  export interface TreeEntry { mode: string; sha: string; }
  export interface RepoTreeBase {
    commitSha: string;
    rootTreeSha: string;     // sha of the whole branch's root tree (the commit's tree)
    subtreeSha: string;      // sha of the tree AT `dir` — equals rootTreeSha when dir === ""
    entries: Record<string, TreeEntry>; // path -> {mode, sha}, blobs only, DIR-RELATIVE (stripped of the `dir/` prefix)
  }

  export async function readBranchBase(location: GitDataLocation, token: string): Promise<RepoTreeBase>
  export async function readBlob(location: Pick<GitDataLocation, "apiBase"|"owner"|"repo">, token: string, sha: string): Promise<Uint8Array>
  export async function readBlobs(location: Pick<GitDataLocation, "apiBase"|"owner"|"repo">, token: string, shas: string[], concurrency?: number): Promise<Map<string, Uint8Array>>
  export async function gitBlobSha(bytes: Uint8Array): Promise<string>

  export interface CommitFilesParams {
    branch: string;
    dir: string;
    baseCommitSha: string;
    baseRootTreeSha: string;
    baseSubtreeSha: string;
    baseEntries: Record<string, TreeEntry>;   // dir-relative, as returned by readBranchBase
    files: Record<string, Uint8Array | null>; // dir-relative paths; null = delete; already diffed by the caller
    message: string;
  }
  export async function commitFiles(location: GitDataLocation, token: string, params: CommitFilesParams): Promise<{ commitSha: string; rootTreeSha: string; subtreeSha: string } | null> // null = empty diff, no-op
  ```
  **Directory scoping (fixes Architecture Reviewer finding 1 — Stage 3 review):** every tree-mode
  open is anchored at a `dir` within the repo (the folder containing `manifest.json`, which may be
  the branch root or a subdirectory — the existing single-file browse UX already allows opening
  from any depth, so tree mode must too). All of `RepoTreeBase.entries`, `commitTree`'s file map,
  and `commitFiles`'s `files`/`baseEntries` are **dir-relative** paths — never full-repo-relative —
  so a diff against `baseEntries` can *only* ever see paths inside `dir`. This is what makes the
  "paths in base but absent from the new file map become deletions" rule safe: nothing outside
  `dir` is ever in `baseEntries` to begin with, so nothing outside `dir` can ever be inferred as a
  deletion. `git-data.ts` does the repo-relative ⇄ dir-relative path translation at its boundary
  (prefixing on the way to the GitHub API, stripping on the way back); every other module
  (`github.ts`, `srs-client.ts`, `App.svelte`) only ever sees dir-relative paths, matching what
  `load_tree`/`export_tree` expect (their `files` map is scoped to the SRS-tree root, not the git
  repo root).
- [ ] `readBranchBase`: `GET /repos/{o}/{r}/git/refs/heads/{branch}` → commit SHA → `GET
      /repos/{o}/{r}/git/commits/{sha}` → root tree SHA → **one** `GET
      /repos/{o}/{r}/git/trees/{rootTreeSha}?recursive=1` call (recursive listings include
      intermediate directory entries, so this single call yields everything needed). From that
      response:
      - If `location.dir === ""`, `subtreeSha = rootTreeSha`.
      - Else, find the `type === "tree"` entry whose `path === location.dir` → `subtreeSha`. If no
        such entry exists, throw `StorageFetchError` (the directory the synthetic entry pointed at
        no longer exists — stale listing).
      - Build `entries` from every `type === "blob"` entry whose `path` starts with `` `${dir}/` ``
        (or, when `dir === ""`, every blob entry), **stripping the `dir/` prefix** to produce
        dir-relative keys. Skip `mode === "160000"` submodules and `mode === "120000"` symlinks
        (dir-scoped, same filter as before, just applied within the subtree).
      - If the response has `truncated: true`, throw `StorageFetchError` naming the branch and
        pointing at GitHub's recursive-tree size limit — fail loud, do not silently return a
        partial tree.
- [ ] `readBlob`: `GET /repos/{o}/{r}/git/blobs/{sha}` (the **Git Data API** blob endpoint — not
      the Contents API's `/contents/{path}`, which has a different response shape and no raw-sha
      lookup) → base64-decode `content` (reuse `decodeBase64` from `git-contents.ts`, extended for
      arbitrary bytes not just UTF-8 text — note `git-contents.ts`'s `decodeBase64` returns a
      `string`; `git-data.ts` needs a bytes-returning variant, e.g. `atob` + `Uint8Array.from`).
      `readBlobs` runs `readBlob` with a small concurrency pool (default 6) via a local
      `pLimit`-style helper — no new dependency, hand-roll a `Promise` pool.
- [ ] `gitBlobSha(bytes)`: compute the git blob object hash — SHA-1 over
      `` `blob ${bytes.byteLength}\0` `` (as UTF-8 bytes) concatenated with `bytes`, via
      `crypto.subtle.digest("SHA-1", ...)`, formatted as lowercase hex. This lets callers
      (Phase 2's `commitTree`) detect "unchanged" paths without a network round-trip, by
      comparing against `baseEntries[path].sha`.
- [ ] `commitFiles`: build tree entries only for keys in `params.files` (already sparse/diffed —
      this function does no diffing itself):
      - Deletion (`files[path] === null`): only emit `{ path, mode: baseEntries[path].mode,
        sha: null }` if `path in baseEntries`; silently skip otherwise (deleting a path that was
        never there is a no-op, not an error).
      - Add/update: if the bytes decode losslessly as UTF-8 (round-trip
        `new TextDecoder("utf-8", { fatal: true }).decode(bytes)` without throwing), use
        `{ path, mode, content: <decoded string> }`; otherwise `POST /git/blobs` with
        `{ content: base64, encoding: "base64" }` first, then reference `{ path, mode, sha }`.
        `mode` = `baseEntries[path]?.mode ?? "100644"` (preserve mode on update; default
        non-executable on create).
      - If `params.files` is empty after the caller's diffing, return `null` immediately —
        **no API calls at all** (empty diff → no-op; no direct precedent in `git-contents.ts` to
        cite here — this is a new short-circuit specific to sparse tree diffing, justified on its
        own: an empty change set has nothing to commit).
      - **Subtree-then-splice** (two `POST /git/trees` calls when `dir !== ""`, one when
        `dir === ""`): first `POST /repos/{o}/{r}/git/trees` with
        `{ base_tree: baseSubtreeSha, tree: entries }` (entries built with dir-relative paths as
        described above) → `newSubtreeSha`. If `dir === ""`, that *is* the new root tree — skip
        straight to the commit step below using `newSubtreeSha` as the tree. Otherwise, splice it
        back into the root: a second `POST /repos/{o}/{r}/git/trees` with
        `{ base_tree: baseRootTreeSha, tree: [{ path: dir, mode: "040000", type: "tree",
        sha: newSubtreeSha }] }` → `newRootTreeSha` (GitHub's create-tree API replaces exactly the
        one path given when `base_tree` is set — this updates only the `dir` subtree link, leaving
        every other path in the branch byte-identical, which is what makes this safe for
        non-root-mounted trees). `POST /repos/{o}/{r}/git/commits` with
        `{ message, tree: newRootTreeSha (or newSubtreeSha when dir === ""), parents: [baseCommitSha] }`
        → new commit SHA. `PATCH /repos/{o}/{r}/git/refs/heads/{branch}` with
        `{ sha: newCommitSha, force: false }`.
      - Map the ref-PATCH failure: `422` whose body matches `/not a fast.?forward/i` →
        `StorageConflictError`; any other non-2xx on any of the three POST/PATCH calls →
        `StorageFetchError` (reuse/extract the `parseError(response)` pattern from
        `git-contents.ts`, currently private there — copy it locally in `git-data.ts` rather than
        exporting it cross-file, to keep `git-contents.ts`'s public surface unchanged).
      - 403 on any write call gets the same actionable "check the GitHub App's Contents
        permission" message `git-contents.ts` already uses for single-file writes.

#### Acceptance Criteria

- [ ] `readBranchBase` returns the correct dir-relative base map for a fixture tree response, for
      both `dir === ""` and a subdirectory-mounted fixture; submodules and symlinks are excluded
      from `entries`; a `dir` that doesn't exist in the tree throws `StorageFetchError`.
- [ ] `commitFiles` on a subdirectory-mounted tree (`dir !== ""`) leaves every path outside `dir`
      byte-identical in the resulting commit (assert via the fixture's untouched-paths' blob SHAs
      unchanged) — this is the regression test for Architecture Reviewer finding 1.
- [ ] `truncated: true` throws `StorageFetchError`, not a silent partial result.
- [ ] `gitBlobSha` matches real git's blob hashing for a known fixture (e.g. hash of empty file
      is the well-known `e69de29b...`).
- [ ] `commitFiles` with an empty `files` map makes zero fetch calls and returns `null`.
- [ ] `commitFiles` emits `content` for UTF-8-decodable bytes and a separate blob POST for
      non-UTF-8 bytes; preserves the base mode on update; defaults to `100644` on create.
- [ ] A deletion for a path not in `baseEntries` is silently dropped, not sent to the API.
- [ ] `422` with "not a fast forward" in the body → `StorageConflictError`; any other `422`/non-2xx
      → `StorageFetchError`, not misclassified as a conflict.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm run build && npm test
```
New file: `tests/git-data.test.ts`, mirroring `tests/storage.test.ts`'s GitHub section structure
(`vi.stubGlobal("fetch", ...)`, `it.each` for conflict-status mapping, multi-call sequence
assertions via `fetchMock.mock.calls[N]`).

#### Milestone gate

Run the four commands above; mark checkboxes `[x]`; commit
`feat: Git Data API primitives for exploded-repo trees (#246)`.

---

### Phase 2: `GitHubRepoTreeHandle` + types + synthetic entry (`github.ts`, `types.ts`)

**Goal:** A `GitHubRepoTreeHandle` can read a whole branch's file tree into memory and commit a
changed subset back as one commit; `listContents` surfaces an "Open as SRS repository" entry for
any folder containing `manifest.json`. Still WASM-independent (works with raw byte maps) — the
WASM plumbing is Phase 3.

**Agent:** Web App Worker

#### Tasks

- [ ] `src/lib/storage/types.ts`:
  - Add `readonly kind: "text" | "bytes" | "tree"` to `DocumentHandle`.
  - Add `RepoTreeAware` interface (see Contracts above).
  - `StorageEntry.kind` becomes `"file" | "folder" | "repository"`.
  - `StorageProvider` gains `openTree?(entry: StorageEntry): Promise<DocumentHandle & RepoTreeAware>`.
- [ ] Give every **existing** handle a `kind`. This is new logic, not a consolidation of an
      existing check — today the `.srs`-vs-not decision lives solely in `App.svelte`
      (`loadDocument`/`saveDirect`), not inside any provider/handle. Each handle constructor sets
      `kind` once from the same test `App.svelte` currently applies:
      `GitHubDocumentHandle`, `DropboxDocumentHandle`, `GoogleDriveDocumentHandle`,
      `LocalDocumentHandle` → `kind: /\.srs$/i.test(name) ? "bytes" : "text"`. (For
      `GitHubDocumentHandle` specifically this is always `"text"` in practice today, since
      `listContents`'s existing filter never surfaces `.srs` files — but the field is still set
      generically, not hardcoded, so it stays correct if that filter ever widens.)
  - **Also update `e2e/cloud-storage.spec.ts`'s `documentHandle()` helper (~line 14) and its
    GitHub `open()` override (~line 90-101), and `e2e/create-document.spec.ts`'s
    `writableHandle()` helper (~line 117) — add `kind: "text"` to every literal these helpers
    return.** (Fixes Architecture Reviewer finding 2 — Stage 3 review.) `e2e/**` is excluded from
    `tsconfig.json`'s `include`, so `npm run typecheck` cannot catch a missing `kind` here; without
    this fix, `App.svelte`'s `switch (handle.kind)` (Phase 4) would silently match no case for
    every one of these fixtures — `kind: undefined` — breaking every existing test in both files
    without any milestone gate noticing until `npm run e2e` runs in Phase 5. Fixing it here, in the
    same phase that introduces the required field, closes that four-phase blind spot immediately;
    do a one-off `npm run e2e` run at the end of this phase (in addition to the normal
    typecheck/lint/build/test gate) specifically to confirm these fixtures still pass, even though
    full tree-mode e2e coverage isn't added until Phase 5.
- [ ] `src/lib/storage/github.ts`:
  ```ts
  export class GitHubRepoTreeHandle implements DocumentHandle, GitBranchAware, RepoTreeAware {
    readonly provider = "github" as const;
    readonly kind = "tree" as const;
    readonly capabilities = { read: true, write: true } as const;
    constructor(readonly id: string, readonly name: string, location: GitDataLocation, private readonly token: () => string)
    get revision(): string | null   // last-read/committed commit SHA, or null before first read
    get branch(): string
    get repoLabel(): string
    async readTree(): Promise<Record<string, Uint8Array>>   // readBranchBase + readBlobs; retains {commitSha, rootTreeSha, subtreeSha, entries} for commitTree's diff base
    async commitTree(files: Record<string, Uint8Array>, opts: { branch: string; createFromCurrent?: boolean; message?: string }): Promise<WriteResult>
    // saveToBranch satisfies GitBranchAware — an alias/thin-wrapper over commitTree with the
    // same {branch, createFromCurrent, message} opts shape, so isGitBranchAware()'s runtime
    // duck-type check (storage/index.ts) finds it and the existing GitSaveModal call site in
    // App.svelte opens for tree handles without modification. (Fixes Architecture Reviewer
    // finding 3 — Stage 3 review: the earlier sketch omitted this method entirely, which would
    // have made GitSaveModal never open for tree handles despite the plan's ADR-016 claiming it
    // "reuses GitSaveModal unmodified.")
    async saveToBranch(): Promise<WriteResult> // throws — present only so isGitBranchAware() finds it; App.svelte's kind-based branch calls commitTree() directly, never this
    async read(): Promise<string>     // throws — tree handles are not single-document; use readTree()
    async write(): Promise<WriteResult> // throws — use commitTree()
  }
  ```
      `App.svelte`'s `confirmGitSave` (Phase 4) calls `commitTree` directly rather than through
      `saveToBranch`, since `saveToBranch`'s `content: string` parameter shape doesn't fit a tree's
      `Record<string, Uint8Array>` — `saveToBranch` exists on this class purely so
      `isGitBranchAware()`'s structural check passes and `GitSaveModal` opens; it is not the path
      `confirmGitSave` actually calls for a `kind: "tree"` handle (see Phase 4 below).

      `commitTree` diffs `files` against the retained base map using `gitBlobSha` (Phase 1) —
      unchanged paths (matching `sha`) are dropped before calling `commitFiles`; paths present in
      the base map but absent from `files` become deletions. On `createFromCurrent`, first
      `createBranch` (already exported, reusable as-is per the research) from the current branch,
      then commit against the new branch's base (mirrors `saveToBranch`'s existing 3-scenario
      logic — same-branch / new-branch-from-current / existing-target-branch — for the tree case).
      After a successful commit, update the retained base map from the returned tree so a
      subsequent `commitTree` call in the same session diffs against the new state (no
      re-`readTree()` needed).
  - **`.srs/.gitkeep` trigger (fixes Plan Reviewer finding 2 — Stage 3 review), specified
    precisely:** this check runs **only inside `commitTree`, only on a commit that is actually
    happening** (i.e. after the caller's diff against the base map is non-empty — never on a
    `readTree()`-only session, and never adding a commit purely to create the keep-file). Right
    before calling `commitFiles`, `commitTree` checks whether any dir-relative path in the
    (already-diffed) `files` map starts with `.srs/`, or any path in the retained base `entries`
    starts with `.srs/`; if neither holds (the `.srs/` directory is entirely absent from both old
    and new state), add `.srs/.gitkeep: new Uint8Array(0)` to the `files` map being committed. This
    responsibility is entirely local to `GitHubRepoTreeHandle.commitTree` — `git-data.ts` has no
    knowledge of the `.srs/` convention (ADR-001: that convention belongs to srs-rust's ADR-038
    layout, not to git plumbing).
  - `GitHubProvider.openTree(entry): Promise<GitHubRepoTreeHandle>` — parses the entry's
    `owner/repo:branch:dir` path (reuse `parseGitHubPath`), constructs a `GitDataLocation`
    (including `dir`), and a `GitHubRepoTreeHandle`. Does **not** eagerly call `readTree()` — that
    happens once `loadDocument` (Phase 4) calls it, consistent with `open()` not eagerly reading
    file content today.
  - `listContents`: before filtering/mapping (the `GitHubContentItem[]` from the existing
    Contents-API directory call already has every filename in scope — no extra request), check
    whether any item is named `manifest.json`. If so:
    - Prepend one synthetic entry: `{ id: `${owner}/${repo}:${branch}:${dir}#repo`, name: "Open as
      SRS repository", kind: "repository", path: `${owner}/${repo}:${branch}:${dir}`,
      revision: null }` (the `#repo` id suffix disambiguates it from the folder entry at the same
      path, since choosing this entry calls `openTree`, not a recursive `list`).
    - **Exclude the raw `manifest.json` item from the regular file listing** (fixes Architecture
      Reviewer finding 5 — Stage 3 review): opening `manifest.json` alone via the existing
      single-file path (`open()` → `loadRepo(text)`) is never a valid operation — it isn't a
      `.srsj` payload — so once the synthetic entry exists, the plain file entry for
      `manifest.json` would only ever produce a confusing load error. Filtering it out of the
      mapped/returned list (while still using its presence to trigger the synthetic entry above)
      removes that dead-end without touching the `.srsj`/`.json`/folder filter's behaviour for
      every other file.

#### Acceptance Criteria

- [ ] `readTree()` round-trips a fixture branch's tree into a `Record<path, Uint8Array>` matching
      the fixture's blob content exactly.
- [ ] `commitTree()` with no actual changes vs. the retained base is a no-op (zero fetch calls
      beyond what `gitBlobSha` needs, which is none — it's local compute).
- [ ] `commitTree()` correctly identifies added, changed, and deleted paths against the retained
      base and only sends those to `commitFiles`.
- [ ] `listContents` emits the synthetic "Open as SRS repository" entry only for directories
      containing `manifest.json`; the raw `manifest.json` file entry itself is excluded from the
      returned list; existing `.srsj`/`.json`/folder listing behaviour is otherwise unaffected.
- [ ] `GitHubDocumentHandle.kind === "text"` for `.srsj`; existing single-file tests unaffected.
- [ ] `isGitBranchAware(treeHandle)` returns `true` for a `GitHubRepoTreeHandle` instance (proves
      `saveToBranch`'s presence actually satisfies the duck-type check used at the `GitSaveModal`
      call site).
- [ ] `e2e/cloud-storage.spec.ts` and `e2e/create-document.spec.ts` still pass with `kind` added to
      their fixtures (`npm run e2e`, this phase only — not full tree-mode e2e coverage yet).
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm run build && npm test && npm run e2e
```
Additions to `tests/storage.test.ts`'s GitHub section (not a new file — this is the same
`GitHubProvider`/handle surface already tested there): `openTree`/`readTree`/`commitTree` cases
mirroring the existing `open`/`read`/`write`/`saveToBranch` cases, including a subdirectory-mounted
(`dir !== ""`) case; a `listContents` synthetic-entry case that also asserts `manifest.json` is
excluded from the plain file list; a `kind` assertion added to each existing handle-construction
test. Plus the `e2e` fixture updates described above (no new e2e *scenarios* yet — that's Phase 5
— just keeping the existing ones passing).

#### Milestone gate

Run the four commands above; mark checkboxes `[x]`; commit
`feat: GitHubRepoTreeHandle + synthetic repo-open entry (#246)`.

---

### Phase 3: WASM tree facade (`srs-client.ts`)

**Goal:** `loadRepoFromTree(files)` and `exportTree(repo)` exist in `srs-client.ts`, mirroring
`loadRepo`/`exportSrsj`, wired to the now-confirmed `load_tree`/`export_tree` WASM bindings.

**Agent:** Web App Worker

#### Tasks

- [ ] `src/lib/srs-client.ts`:
  ```ts
  export interface SrsRepositoryConstructor {
    load(srsj: string): SrsRepository;
    load_archive(bytes: Uint8Array): SrsRepository;
    load_tree(files: Record<string, Uint8Array>): SrsRepository;
  }
  // on the SrsRepository instance interface:
  export_tree(): Record<string, Uint8Array>;
  ```
- [ ] `export function loadRepoFromTree(files: Record<string, Uint8Array>): SrsRepository` —
      `requireWasm().load_tree(files)`, placed beside `loadRepoFromArchive` (same shape/pattern).
- [ ] `export function exportTree(repo: SrsRepository): Record<string, Uint8Array>` —
      `repo.export_tree()`, placed beside `exportArchive`.
- [ ] Run `npm run fetch-bindings` and check its output log names `srs-rust` release
      `v0.1.0-build.226` or later (it fetches `srs-bindings-web.tar.gz` from the latest srs-rust
      release via `scripts/ensure-bindings.mjs`, unchanged). No source changes are expected in
      that script — this is a verification step, not an implementation task — but it must be run
      (not merely inspected) so the local `src/lib/srs_bindings/` output is confirmed current
      before this phase's build.

#### Acceptance Criteria

- [ ] `loadRepoFromTree(files)` on a fixture tree produces a repo whose `list_records()` matches
      the same fixture loaded via `loadRepo(srsj)` (cross-format equivalence).
- [ ] `exportTree(loadRepoFromTree(files))` returns files byte-identical to the input for every
      untouched path (the "clean-git-diff guarantee" the WASM doc comment promises) —
      round-trip test.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` pass with the real fetched
      bindings (not a stub).

#### Testing

```bash
npm run fetch-bindings && npm run typecheck && npm run lint && npm run build && npm test
```

#### Milestone gate

Run the commands above; mark checkboxes `[x]`; commit
`feat: wire load_tree/export_tree WASM bindings into srs-client (#246)`.

---

### Phase 4: App integration (`App.svelte`, `SourceChooser.svelte`)

**Goal:** A user can choose "Open as SRS repository" from the GitHub browser, edit records in
the normal governance UI, and save via the existing git-save modal — which now commits every
changed file as one commit. Existing `.srsj`/`.srs` single-file flows are unaffected (verified by
the `kind` dispatch replacing name-sniffing, not adding a parallel path).

**Agent:** Web App Worker

#### Tasks

- [ ] `App.svelte` `loadDocument(handle)`: replace the `/\.srs$/i.test(handle.name)` dispatch
      (line 107) with a `switch (handle.kind)`:
      - `"text"` → existing `handle.read()` + `loadRepo(text)` path, unchanged.
      - `"bytes"` → existing `handle.readBytes()` + `loadRepoFromArchive(bytes)` path, unchanged.
      - `"tree"` → new: `(handle as RepoTreeAware).readTree()` + `loadRepoFromTree(files)`.
- [ ] `App.svelte` `saveDirect()`: replace the line-242 `.srs` check with
      `activeDocument.kind === "bytes" && activeDocument.writeBytes` — same behaviour, sourced
      from the discriminant instead of a regex re-test of a name that's already known.
- [ ] `App.svelte` `confirmGitSave(opts)` (defined at lines 272–301; the `saveToBranch` call to
      replace is at line 285): branch on `activeDocument.kind` before deciding what to export/send:
      - `"text"` → unchanged: `handle.saveToBranch(exportSrsj(repo), opts)`.
      - `"tree"` → new: `(handle as RepoTreeAware).commitTree(exportTree(repo), opts)`.
      - `"bytes"` → this combination isn't reachable today (no `kind: "bytes"` handle is also
        `GitBranchAware` — `GitHubDocumentHandle` is `kind: "text"` only per ADR-015), but guard
        it explicitly (throw a clear "git save is not supported for binary documents yet" error)
        rather than silently falling through to the text path — this is the fix-in-passing for
        the latent corruption risk described in the issue.
- [ ] `GitSaveModal` usage (lines 460-473 today) needs no prop changes — it's already
      content-format-agnostic (confirmed: no `.srsj`/tree-specific props). The `isGitBranchAware`
      guard at that call site continues to work unmodified since `GitHubRepoTreeHandle`
      structurally satisfies `GitBranchAware` too.
- [ ] `SourceChooser.svelte` `chooseEntry(entry)`: add a branch for `entry.kind === "repository"`
      that calls `provider.openTree?.(entry)` then `onOpen(handle)` (same `onOpen` callback
      single-file entries already use — `App.svelte`'s `loadDocument` now handles `kind: "tree"`
      internally, so no new prop is needed on `SourceChooser`).
  - Entry-kind badge rendering (line 226 today, folder/SRS/SRSJ) gains a fourth case:
    `entry.kind === "repository" ? "Repo"` — this is the last string-based badge left after the
    `kind`-field work in Phase 2; leave the badge computation as-is otherwise (it's a display
    label, not a dispatch decision, and touching it further is out of this plan's scope).

#### Acceptance Criteria

- [ ] Existing single-file `.srsj`/`.srs`/Dropbox/Drive/local open+save flows behave identically
      to before this change (no regression) — verified by the existing `tests/storage.test.ts`
      and `e2e/cloud-storage.spec.ts` suites passing unmodified in their pre-existing cases.
- [ ] Choosing "Open as SRS repository" loads every file into the WASM repo and the governance UI
      renders records from it.
- [ ] Editing a record and saving via the git-save modal produces exactly one commit containing
      only the changed files.
- [ ] A stale-branch tree save (branch moved since read) surfaces `StorageConflictError` through
      the same reload-and-retry UX the single-file path already has.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm run build && npm test
```

#### Milestone gate

Run the commands above; mark checkboxes `[x]`; commit
`feat: exploded-repo open/edit/commit in App + SourceChooser (#246)`.

---

### Phase 5: Fixture + e2e coverage

**Goal:** An end-to-end test opens a fake exploded GitHub repo, edits a record, saves, and asserts
a single commit containing only the changed file(s) was made — proving the whole stack (browser →
Git Data API primitives → WASM tree load/export → git-save modal → commit) works together.

**Agent:** Web App Worker

#### Tasks

- [ ] `e2e/fixtures/exploded/` — generated with the real `srs` CLI (verified during this plan's
      review — fixes Plan Reviewer finding 3, Stage 3 review): download
      `srs-x86_64-unknown-linux-gnu.tar.gz` from the srs-rust `v0.1.0-build.226` release (same
      release as the bindings), then, with the release's bundled `governance-seed.srsj`:
      ```bash
      ./srs repo copy --from governance-seed.srsj --from-store json \
        --to e2e/fixtures/exploded --to-store file --pretty
      ```
      Verified this run: produces 41 files (~204KB) including `manifest.json` at the fixture root
      and an **empty** `.srs/` directory (git cannot track an empty dir — this is exactly the
      "`.srs/.gitkeep` missing" case Phase 2's commit logic must handle, so keeping the fixture's
      `.srs/` dir empty as generated, rather than hand-adding a keep-file, is deliberate — it
      exercises that code path). If 41 files is more than needed for a readable e2e fixture, trim
      down non-essential `package/**` definition files after generation (the WASM loader only
      requires internal consistency, not the full seed's breadth) — but do not hand-author the
      fixture from scratch; always start from this generated tree so its shape matches what
      `load_tree`/`export_tree` actually produce.
- [ ] `e2e/cloud-storage.spec.ts`: extend the injected fake GitHub provider
      (`window.__SRS_STORAGE_PROVIDERS__`) with `list()` returning a folder containing
      `manifest.json` (triggering the synthetic entry) and an `openTree`/`readTree`/`commitTree`
      implementation backed by the new fixture's in-memory file map. Add tests: synthetic entry
      appears only when `manifest.json` is present; choosing it loads records into the record
      list; editing + git-save-modal-confirm results in exactly one `commitTree` call whose
      `files` argument contains only the edited path; a `commitTree` rejection (simulated
      `StorageConflictError`) surfaces via the same `git-save-error` testid the single-file
      conflict test already asserts on.
- [ ] `tests/storage.test.ts` or the new `git-data.test.ts` (whichever already houses the
      `SourceChooser`-adjacent expectations) — confirm the plan's Phase 2 "synthetic-entry test"
      commitment from the issue's item 4 is covered (may already be satisfied by Phase 2's
      `listContents` test; if so, this task is a no-op check, not new code).

#### Acceptance Criteria

- [ ] `npm run e2e` passes including the new exploded-repo scenarios.
- [ ] The new e2e test asserts commit granularity (only changed paths sent), not just "a save
      happened" — this is the behaviour the whole feature exists to deliver.

#### Testing

```bash
npm run typecheck && npm run lint && npm run build && npm test && npm run e2e
```

#### Milestone gate

Run the commands above; mark checkboxes `[x]`; commit
`test: e2e coverage for exploded-repo open/edit/commit (#246)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes
- [ ] WASM loads and `load_tree`/`export_tree` round-trip against a real fixture
- [ ] Existing single-file GitHub/Dropbox/Drive/local flows show no regression
- [ ] A tree-mode save produces exactly one commit containing only genuinely changed paths
- [ ] Stale-branch tree saves surface `StorageConflictError` via the existing reload-and-retry UX

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001) — `git-data.ts`/`github.ts` do byte-level git plumbing
  only; all record/tree *content* interpretation goes through `load_tree`/`export_tree`.
- Lead Integrator freezes the `kind` discriminant and `RepoTreeAware` shape (this plan) before
  Phase 4 consumes them.
- Verification Agent runs after Phase 4 and again before final sign-off.

## Assumptions

- Resolved during Stage 3 review: the exploded-repo fixture (Phase 5) is generated with the real
  `srs` CLI's `repo copy --to-store file` (verified working against the release's own
  `governance-seed.srsj`, see Phase 5) — no hand-authoring or CLI-availability fallback is needed.
- `crypto.subtle` (Web Crypto) is available in every target browser environment srs-web already
  supports (it is — this is the same API Dropbox's PKCE flow already relies on via `github.ts`'s
  sibling `dropbox.ts`), so `gitBlobSha`'s SHA-1 computation needs no polyfill.
- GitHub's recursive-tree endpoint's `truncated` limit (~100k entries / ~7MB response) is
  unlikely to be hit by realistic SRS governance repos; if it is hit in practice, the fail-loud
  error is the correct interim behaviour (chunked/paginated tree reads are explicitly out of
  scope, see Scope above).
