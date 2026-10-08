# Plan: Dropbox openTree — open and save exploded SRS repositories (#262)

## Summary

The discovery scan (ADR-018) detects `.srs/`/`manifest.json` folders on Dropbox but could not
surface them because Dropbox had no `openTree()`. This adds a Dropbox tree handle so exploded
repos on Dropbox are listed, discovered and opened like GitHub's (ADR-016 pattern, different
transport). Parent story: muDemocracy.org#131.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Verification Agent (srs-web) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Byte-level provider plumbing only; tree assembly stays behind `load_tree`/`export_tree` WASM. | accepted |
| [ADR-016](../docs/adr/016-exploded-repo-tree-storage.md) | Reuse `kind:"tree"` + `RepoTreeAware`. Dropbox is not `GitBranchAware`, so saves take `App.svelte`'s existing non-git `saveDirect` tree branch (as the local-folder handle, #248). | accepted |
| [ADR-018](../docs/adr/018-picker-srs-discovery.md) | Generic scan already surfaces marker folders when `provider.openTree` exists; the Dropbox consequence note is updated. | accepted |

No new ADR: no new constraint or rejected alternative — Dropbox fills an existing seam.
Per-file concurrency guard (revision `mode:update`, `parent_rev` on delete) is the Dropbox
analogue of the per-file blob SHA / ref fast-forward guard; Dropbox has no atomic multi-file commit.

## Contracts

### WASM API surface
No change. `load_tree`/`export_tree` are already wired (`loadRepoFromTree`/`exportTree`).

### TypeScript types
No change to shared types. New `DropboxTreeHandle` (`DocumentHandle & RepoTreeAware`),
`DropboxProvider.openTree`, shared helpers extracted to `storage/tree-utils.ts`.

## Scope

1. `dropbox.ts`: `list()` adds the synthetic "Open as SRS repository" entry (hides `manifest.json`);
   `openTree()` (recursive `list_folder`, bounded-concurrency downloads, `.git`/`node_modules`
   skipped, repo-marker assertion); `DropboxTreeHandle.commitTree` (changed paths only, update-mode
   revisions, delete with `parent_rev`, partial-failure rebase, 409 → `StorageConflictError`);
   non-ASCII-safe `Dropbox-API-Arg`.
2. `tree-utils.ts`: move `TREE_SKIP_DIRS`/`assertRepoTree`/`sameBytes` out of `local.ts`.
3. ADR-018 consequence note.
4. Tests: `tests/dropbox-tree.test.ts`.

**Out of scope:** atomic multi-file commit (not offered by Dropbox); files > 150 MB (single-request
upload limit); live e2e against Dropbox (needs real credentials).

## Final Acceptance
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass
- [x] Negative case: non-SRS folder rejected; 409 maps to conflict; partial failure retries only the remainder
