# ADR-016: Exploded-repo git tree storage via the GitHub Git Data API

- **Status:** proposed
- **Date:** 2026-07-22
- **Issue:** [srs-web#246](https://github.com/the-greenman/srs-web/issues/246)
- **Supersedes:** —
- **Superseded by:** —

## Context

srs-web#246 (Epic 10 Phase 2, [muDemocracy.org#101](https://github.com/the-greenman/muDemocracy.org/issues/101))
adds the ability to open a whole exploded (multi-file, git-diffable) SRS repository from GitHub,
edit it in the normal governance UI, and write every changed file back as **one commit**. This
depends on srs-rust#684 (ADR-037/038), which ships `SrsRepository.load_tree(files)` and
`.export_tree()` — confirmed present in `srs-bindings-web.tar.gz` from srs-rust release
`v0.1.0-build.226`.

Two things the existing storage layer does not yet support:

1. **Multi-file, tree-level git operations.** `git-contents.ts` and `GitHubDocumentHandle` only
   know the single-file Contents API (`GET`/`PUT contents/{path}`). Reading a whole branch tree
   and committing a sparse set of changed files needs the Git Data API instead (`git/refs`,
   `git/commits`, `git/trees`, `git/blobs`) — a different request shape and a different conflict
   signal (non-fast-forward ref update, not a per-file blob SHA mismatch).
2. **Three-way document-shape dispatch.** `App.svelte` currently decides text-vs-binary handling
   by regex-testing `handle.name` against `/\.srs$/i` at three call sites (`loadDocument`,
   `saveDirect`, and implicitly `confirmGitSave`, which never checked at all). Adding a third
   shape — a tree of many files, not one blob — makes a fourth ad-hoc name-based branch
   unworkable; `confirmGitSave` in particular would silently corrupt a tree-mode document by
   calling `exportSrsj()` on it if not guarded.

## Decision

**1. `DocumentHandle` gets a required `kind` discriminant**, replacing name-sniffing as the
dispatch key everywhere a caller needs to know how to read/write a document:

```typescript
interface DocumentHandle {
  readonly kind: "text" | "bytes" | "tree";
  // ... existing members unchanged
}
```

Every existing handle sets `kind` once, at construction/open time, from the same extension check
each provider already performs when opening a file (`/\.srs$/i.test(name) ? "bytes" : "text"`) —
centralizing a check that was previously repeated at each call site into a single
construction-time decision. `GitHubRepoTreeHandle` (new) is always `kind: "tree"`.

This differs from ADR-015's approach (optional `readBytes?`/`writeBytes?` capability methods) —
ADR-015's problem was binary-vs-text with a two-way choice best expressed as an *optional*
extension. Here the choice is three-way and every caller must actively branch on it (there is no
sensible "ignore it if absent" default for a tree), so a required discriminant fits better than
another pair of optional methods.

**2. A new `RepoTreeAware` interface** parallels the existing `GitBranchAware`, for handles that
support tree-level read/commit instead of single-document read/write:

```typescript
interface RepoTreeAware {
  readTree(): Promise<Record<string, Uint8Array>>;
  commitTree(
    files: Record<string, Uint8Array>,
    opts: { branch: string; createFromCurrent?: boolean; message?: string }
  ): Promise<WriteResult>;
}
```

`GitHubRepoTreeHandle implements DocumentHandle, GitBranchAware, RepoTreeAware` — it structurally
satisfies `GitBranchAware` too, so it reuses the existing `GitSaveModal` / `isGitBranchAware()`
guard in `App.svelte` unmodified. `App.svelte`'s `confirmGitSave` branches on `handle.kind` to
choose `saveToBranch(exportSrsj(repo), ...)` (text) vs `commitTree(exportTree(repo), ...)` (tree),
and explicitly rejects the `"bytes"` case rather than falling through — this is the fix for the
latent corruption risk described above, shipped in the same change that first makes a non-text
`GitBranchAware` handle reachable.

**3. Git Data API primitives live in a new sibling module, `git-data.ts`**, not inside
`git-contents.ts` — the two modules target different GitHub REST surfaces (Contents API vs Git
Data API) with different request/response shapes and different conflict signals, so keeping them
separate avoids a combinatorial branch-on-mode inside one file. `git-data.ts` follows
`git-contents.ts`'s existing conventions: free functions (not a class), revision = a SHA (commit
SHA here, blob SHA there), a locally-scoped `parseError(response)` helper (not shared across
files — `git-contents.ts`'s stays private), and the same 403-write actionable-error-message
pattern.

**4. Change detection is a client-side git blob SHA-1 comparison, not a byte-for-byte diff.**
`commitTree` computes each candidate path's git blob object hash
(`crypto.subtle.digest("SHA-1", "blob {len}\0{bytes}")`) and compares it to the retained base
tree's recorded blob SHA for that path. This lets an unchanged path (including one `srs-rust`'s
`export_tree()` re-serializes byte-identically, per its "clean-git-diff guarantee") be dropped
before any network call, with no extra GitHub API round-trips — the comparison is entirely local
compute against data already fetched by `readTree()`.

**5. Conflict mapping:** a tree commit's conflict signal is the ref-update PATCH returning `422`
with a "not a fast forward" message — mapped to the same `StorageConflictError` the single-file
path already throws on a stale blob SHA, so `App.svelte`'s existing reload-and-retry UX
(`saveErrorMessage`'s generic `e.code === "conflict"` check) needs no changes to handle it.

## Consequences

**Positive:**

- `App.svelte`'s three `.srs`-regex dispatch sites collapse to one discriminant check each,
  removing a class of bugs where a new code path forgets to update the regex.
- `git-data.ts` is independent of the WASM bindings and of `App.svelte` — fully unit-testable in
  isolation, and buildable/testable before the srs-rust dependency (already resolved as of this
  ADR, but the modularity was worth keeping for the same reason it mattered during design).
- Reusing `GitSaveModal`/`isGitBranchAware()` unmodified means the tree-mode save UX is visually
  and behaviourally consistent with the existing single-file git save, at zero new UI surface.
- The blob-SHA diff means `commitTree` never re-uploads unchanged files, keeping tree-mode commits
  as small and diff-friendly as the "exploded repo" premise requires.

**Negative / trade-offs:**

- `DocumentHandle.kind` is a **required**, not optional, field — every existing handle
  constructor needed a one-line addition. This is a larger mechanical diff than ADR-015's
  optional-method extension, accepted because a required 3-way discriminant is safer than an
  implicit "absence means text" default that a future 4th kind could silently break.
- `git-data.ts` duplicates `git-contents.ts`'s small `parseError`/403-message helpers rather than
  sharing them, in exchange for keeping each module's public surface independently stable. If a
  third Git Data API-consuming module appears later, this should be revisited.
- Codeberg/Forgejo support for tree mode is not delivered by this ADR — `git-data.ts` is written
  against GitHub's specific Git Data API response shapes; a Forgejo variant is deferred (mirrors
  how `git-contents.ts` itself started GitHub-only before generalizing).

**Neutral:**

- `StorageEntry.kind` gains a `"repository"` variant purely for the synthetic "Open as SRS
  repository" browse-list entry; it is not a `DocumentHandle.kind` value and the two enums are
  intentionally not unified (a `StorageEntry` describes something the user can choose to open; a
  `DocumentHandle` describes something already open).
