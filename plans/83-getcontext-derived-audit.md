# Plan: Fix getContext usage inside $derived (Issue #83)

## Summary

Five rendering components call `getContext` inside `$derived` re-evaluations via the
`$derived(getFieldMeta())` pattern. Svelte 5 documents `getContext` as init-only; calling it
inside a reactive computation is against spec and may throw in future Svelte versions. The fix
is to separate the `getContext` call (init-time) from the reactive `.meta` accessor (`$derived`),
by exporting a `getFieldMetaContext()` helper from `field-meta.ts` and updating all five call
sites. The four files listed in the original issue body (`ArticleView`, `RoleView`,
`ExerciseView`, `DecisionLogView`) do not contain the pattern in the current codebase — they
were removed or cleaned up before this issue was addressed.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude-sonnet-4-6 (this session) |
| Web App Worker | claude-sonnet-4-6 (this session) |
| Verification | Verification Agent (srs-web) — spawned in Stage 7 |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |

No new ADR is required: this change is a Svelte 5 correctness fix, not an architectural
decision. The pattern (call `getContext` at init, not in reactive expressions) is already
implied by the Svelte 5 docs. The `field-meta.ts` API remains unchanged except for adding
one new export.

---

## Contracts

### WASM API surface

No new or changed WASM methods. This plan touches only Svelte component patterns.

### TypeScript types

No changes to WASM payload types. The `FieldMetaContext` interface and `FieldFormDef` types
in `field-meta.ts` are unchanged.

---

## Scope

- Audit and confirm which files have the unsafe pattern (done: 5 files, listed below).
- Add `getFieldMetaContext(): FieldMetaContext` to `src/lib/governance/field-meta.ts`.
- Update all 5 call sites from `$derived(getFieldMeta())` to the safe two-liner.
- Keep the existing `getFieldMeta()` function for forward-compatibility (it's retained as a convenience wrapper; after this fix it will have no production callers, but removing it is a separate cleanup tracked in a follow-up issue).

**Affected files (5 call sites):**
1. `src/rendering/DecisionView.svelte`
2. `src/rendering/DecisionSummaryCard.svelte`
3. `src/rendering/RecordView.svelte`
4. `src/lib/components/DecisionSummaryCard.svelte`
5. `src/lib/components/SuccessorModal.svelte`

**Out of scope:**

- Any refactor of `field-meta.ts` beyond adding the new export.
- Removing `getFieldMeta()` — it may still be called at init time elsewhere.
- `DecisionLogView`, `ArticleView`, `RoleView`, `ExerciseView` — not present in current codebase.

---

## Phases

### Phase 1: Extend field-meta.ts API

**Goal:** `getFieldMetaContext()` is exported and callers can use it safely at init time.

**Agent:** Web App Worker

#### Tasks

- [x] Audit: confirm exactly 5 components use `$derived(getFieldMeta())` (done in planning)
  - Confirmed files (from `grep -rn '\$derived(getFieldMeta' src/`):
    1. `src/rendering/DecisionView.svelte:18`
    2. `src/rendering/DecisionSummaryCard.svelte:17`
    3. `src/rendering/RecordView.svelte:21`
    4. `src/lib/components/DecisionSummaryCard.svelte:24`
    5. `src/lib/components/SuccessorModal.svelte:23`
  - `ArticleView.svelte`, `RoleView.svelte`, `ExerciseView.svelte`, `DecisionLogView.svelte`
    listed in the original issue body are NOT present — removed before this issue was worked.
- [x] Confirm Svelte version in `package.json` is 5.28 or later (confirmed: `"svelte": "^5.28.0"`)
- [x] In `src/lib/governance/field-meta.ts`, add:
  ```ts
  /**
   * Call once during component init to obtain the reactive field-meta context.
   * Then access `.meta` inside $derived to track reactive map changes.
   *
   * Do NOT call getFieldMeta() inside $derived — getContext is init-only in Svelte 5.
   */
  export function getFieldMetaContext(): FieldMetaContext {
    return getContext<FieldMetaContext>(FIELD_META_KEY);
  }
  ```
- [ ] Run `npm run typecheck` — must pass.

#### Acceptance Criteria

- [ ] `getFieldMetaContext` is exported from `field-meta.ts`
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
```

#### Milestone gate

1. `npm run typecheck` passes.
2. Mark task checkboxes `[x]`.
3. Commit: `fix(field-meta): export getFieldMetaContext for safe init-time getContext call (#83)`

---

### Phase 2: Update all 5 call sites

**Goal:** No component calls `getContext` inside `$derived`; all 5 sites use the two-liner pattern.

**Agent:** Web App Worker

The two-liner pattern for each site:
```svelte
const _fieldMetaCtx = getFieldMetaContext();
const fieldMeta = $derived(_fieldMetaCtx.meta);
```
Also update the import to include `getFieldMetaContext` alongside any existing imports from `field-meta.js`.

#### Tasks

- [x] For each of the 5 files: change import line to include `getFieldMetaContext` (all 5 already import from `'$lib/governance/field-meta.js'` — just add `getFieldMetaContext` to the named imports). Replace `const fieldMeta = $derived(getFieldMeta());` with the two-liner. Specific changes:
  - `src/rendering/DecisionView.svelte` line 14: add `getFieldMetaContext`; line 18: apply two-liner.
  - `src/rendering/DecisionSummaryCard.svelte` line 13: add `getFieldMetaContext`; line 17: apply two-liner.
  - `src/rendering/RecordView.svelte` line 15: add `getFieldMetaContext`; line 21: apply two-liner.
  - `src/lib/components/DecisionSummaryCard.svelte` line 10: add `getFieldMetaContext`; line 24: apply two-liner.
  - `src/lib/components/SuccessorModal.svelte` line 13: add `getFieldMetaContext`; line 23: apply two-liner.
- [x] Confirm no other file uses the pattern. Run a broad search (catches both plain and `.by()` variants):
  ```bash
  grep -rn 'getFieldMeta' src/
  ```
  After the fix, the only remaining hit must be the function definition in `field-meta.ts` and the `getFieldMetaContext` reference. Zero `$derived(getFieldMeta())` or `$derived.by(() => getFieldMeta())` patterns must remain.
- [x] Confirm `getFieldMeta` (old function) is still exported and compiles (no callers removed it).
- [x] `npm run typecheck && npm run lint && npm run build` — all must pass.

#### Acceptance Criteria

- [ ] Zero `$derived(getFieldMeta())` patterns remain in `src/`
- [ ] All 5 components use `getFieldMetaContext()` at init and `$derived(_fieldMetaCtx.meta)` for reactivity
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria met.
2. Mark task checkboxes `[x]`.
3. Commit: `fix(components): use getFieldMetaContext at init, not inside $derived (#83)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] Zero `$derived(getFieldMeta())` patterns remain in `src/`
- [ ] All 5 components use the two-liner `getFieldMetaContext()` + `$derived(_fieldMetaCtx.meta)` pattern
- [ ] `getFieldMeta()` function still compiles and is still exported (backward compat)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). This change is presentation-layer only.
- No new WASM bindings required.

## Assumptions

- Svelte 5.28 `getContext` is init-only per docs; calling it in `$derived` re-evaluations is
  unsafe (may work now but is against the documented contract and could break on Svelte upgrades).
- `ArticleView.svelte`, `RoleView.svelte`, `ExerciseView.svelte`, `DecisionLogView.svelte`
  (listed in the original issue) do not use the pattern in the current codebase.
- The `.meta` getter on `FieldMetaContext` correctly propagates reactivity: it calls
  `getMeta()` which reads `fieldMetaMap` (a `$derived` signal in GovernanceShell),
  so calling `$derived(_fieldMetaCtx.meta)` after the init-time `getFieldMetaContext()` is sufficient
  for full reactivity.
- `getFieldMeta()` will have no production callers after this fix. It is retained for
  forward-compatibility and to avoid a spurious API break; a separate follow-up issue tracks
  its eventual removal.
