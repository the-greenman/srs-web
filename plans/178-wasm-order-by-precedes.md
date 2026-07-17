# Plan: WASM-backed precedes ordering in GuidesShell (#178)

## Summary

`GuidesShell.svelte` implements `orderByPrecedes` (~line 177) in TypeScript — a graph
traversal over `precedes` relations that constitutes SRS semantics in a leaf client, violating
ADR-001. The binding `order_by_precedes(input_json)` ships in the current srs-rust release
(confirmed at `srs_bindings.d.ts` line 350, build 166, 2026-07-16).
This plan removes the TS implementation and replaces it with a single WASM call, deletes the dead
code, and cleans up ADR-001's residual-debt inventory.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Architecture Reviewer (srs-web) + Verification Agent (srs-web) in Stage 7 |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TS — `orderByPrecedes` TS graph traversal is a violation; the WASM binding replaces it | accepted |

**`rebuildPrecedesChain` is NOT a violation:** it only orchestrates existing `list_relations`,
`delete_relation`, and `create_relation` WASM calls — pure control flow over exposed bindings.
It stays unchanged. This was confirmed in srs-web#178 comment thread (runs 4–6, 2026-07-16).
No new ADR is needed for this determination; it is a scope clarification within ADR-001.

---

## Contracts

### WASM API surface

**No new WASM binding is required.** `order_by_precedes(input_json: string): any` is present in
the current `srs_bindings.d.ts` (line 350). The binding takes:

- **Input:** `{ "instanceIds": ["uuid1", "uuid2", ...] }` (JSON string)
- **Output:** `{ "orderedIds": [...] }` (camelCase, same IDs reordered by precedes chain;
  fallback sort is `created_at` ascending then `instanceId` ascending; handles cycles)

The `SrsRepository` interface in `srs-client.ts` must be extended to declare this method.

### TypeScript types

A new wrapper `orderByPrecedes(repo, instanceIds: string[]): string[]` is added to
`srs-client.ts`. This replaces the identically-named local function in `GuidesShell.svelte`.

---

## Scope

- Add `order_by_precedes` to the `SrsRepository` interface in `srs-client.ts` (after `scaffold_new_repository`).
- Add `orderByPrecedes(repo, instanceIds)` wrapper to `srs-client.ts` (after `deleteRelation`, before `createRecordSuccessor`).
- In `src/lib/guides/GuidesShell.svelte`:
  - Import `orderByPrecedes` from `$lib/srs-client.js`.
  - In `refreshSections()`, replace the local `orderedSections = orderByPrecedes(sectionRecords)` call with the WASM-backed version.
  - Delete the local `orderByPrecedes` function (lines 177–201).
- Update `docs/adr/001-thin-client.md`: remove `orderByPrecedes`/`rebuildPrecedesChain` from the residual-debt list; add resolved note.

**Out of scope:**
- Changing `rebuildPrecedesChain` — it is control flow, not an ADR-001 violation.
- The other ADR-001 residual-debt items (hardcoded vocabularies, `list_relation_types`, etc.).
- Any srs-rust or srs changes.
- Adding new e2e tests beyond what already covers the guides editor (tracked as srs-web#219 if gap found).

---

## Phases

### Phase 1: Add WASM wrapper + replace TS graph traversal

**Goal:** `GuidesShell.svelte` calls the WASM `order_by_precedes` binding for section ordering;
the local TS `orderByPrecedes` function is deleted; ADR-001 residual debt updated.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/srs-client.ts`, add to `SrsRepository` interface (after `scaffold_new_repository` line 81):
  ```ts
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in orderByPrecedes()
  order_by_precedes(input_json: string): any;
  ```
- [ ] In `src/lib/srs-client.ts`, add public wrapper after `export function deleteRelation(...)` (lines 498–500), before `createRecordSuccessor`:
  ```ts
  export function orderByPrecedes(repo: SrsRepository, instanceIds: string[]): string[] {
    // biome-ignore lint/suspicious/noExplicitAny: WASM boundary
    // order_by_precedes throws a JS error on failure (no error-string return path per .d.ts)
    const raw: any = repo.order_by_precedes(JSON.stringify({ instanceIds }));
    return raw.orderedIds as string[];
  }
  ```
- [ ] In `src/lib/guides/GuidesShell.svelte`, add `orderByPrecedes` to the import from `$lib/srs-client.js`.
- [ ] In `src/lib/guides/GuidesShell.svelte`, in `refreshSections()`, replace:
  ```ts
  orderedSections = orderByPrecedes(sectionRecords);
  ```
  with:
  ```ts
  const ids = sectionRecords.map((s) => s.instanceId);
  const orderedIds = orderByPrecedes(repo, ids);
  const byId = new Map(sectionRecords.map((s) => [s.instanceId, s]));
  orderedSections = orderedIds.map((id) => byId.get(id)).filter((r): r is SrsRecord => r !== undefined);
  ```
- [ ] In `src/lib/guides/GuidesShell.svelte`, delete the local `orderByPrecedes` function (lines 177–201).
- [ ] In `docs/adr/001-thin-client.md`, update the residual-debt section:
  - Split the combined `orderByPrecedes` / `rebuildPrecedesChain` bullet into two entries:
    1. Add resolved note for `orderByPrecedes`: "`orderByPrecedes` resolved (srs-web#178): replaced by WASM `order_by_precedes` binding (srs-rust build 166)."
    2. Keep `rebuildPrecedesChain` as a separate remaining-debt bullet: "**`rebuildPrecedesChain`** in `GuidesShell.svelte` orchestrates WASM mutation calls (`list_relations`, `delete_relation`, `create_relation`) to rebuild a linear precedes chain. This encodes domain knowledge about precedes-chain structure (a sequence of n-1 directed edges) and is a candidate for a future `rebuild_precedes_chain` WASM binding. Lower priority than `orderByPrecedes` was — tracked separately."
  - Note: the arch reviewer confirmed `rebuildPrecedesChain` encodes semantic knowledge (not pure presentation) and should remain in the debt list.

#### Acceptance Criteria

- [ ] `npm run typecheck` passes with no errors.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run build` succeeds.
- [ ] `npm test` passes (all unit tests green).
- [ ] The local `orderByPrecedes` function is absent from `GuidesShell.svelte`.
- [ ] `listRelations` import in `GuidesShell.svelte` is retained (still used by `rebuildPrecedesChain`).
- [ ] The `SrsRepository` interface in `srs-client.ts` declares `order_by_precedes`.
- [ ] ADR-001 residual-debt `orderByPrecedes` bullet is resolved; `rebuildPrecedesChain` remains as a separate debt item.
- [ ] Sections with no `precedes` edges render in a stable, deterministic order (WASM fallback: `created_at` asc, `instanceId` asc).

#### Milestone gate

1. All acceptance criteria above are met.
2. `npm run typecheck` and `npm run build` both pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `fix(guides): replace TS orderByPrecedes with WASM binding (#178)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes (GuidesShell e2e tests, if any)
- [ ] `orderByPrecedes` TS function absent from `GuidesShell.svelte`
- [ ] `order_by_precedes` declared in `SrsRepository` interface in `srs-client.ts`
- [ ] ADR-001 `orderByPrecedes` bullet resolved; `rebuildPrecedesChain` kept as separate debt item

## Pre-verified facts

- `order_by_precedes(input_json: string): any` is present in `srs_bindings.d.ts` (line 350) and `srs_bindings.js` (confirmed, build 166, 2026-07-16).
- `orderByPrecedes` in `GuidesShell.svelte` has exactly one call site: line 221. Confirmed by grep.
- `repo` is in scope in `refreshSections()`: calls `listContainers(repo, ...)` (line 208) and `resolveContainerView(repo, ...)` (line 211).

## Assumptions

- `order_by_precedes` returns `{ orderedIds: string[] }` (camelCase) as per `.d.ts` JSDoc.
- IDs not reachable through any precedes chain are included in the output. The WASM binding's
  fallback sort is `created_at` ascending then `instanceId` ascending, differing from prior TS
  behaviour (arrival order with unreachable items appended). This is acceptable — the new fallback
  is more deterministic.
- If no e2e test covers section ordering, that gap is tracked separately — not a blocker for this PR.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). `rebuildPrecedesChain` is control flow — no change needed.
