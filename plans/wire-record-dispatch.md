# Plan: Wire RecordDispatch into governance rendering path

> **Issue:** [srs-web#70](https://github.com/the-greenman/srs-web/issues/70)

## Summary

`RecordDispatch.svelte` was rewritten in srs-web#54 to use a `VIEW_REGISTRY` keyed by typeId. ADR-006 explicitly acknowledges it "is currently dead code (not imported in App.svelte). Wiring it into the rendering path is tracked as a follow-up issue." This plan delivers that wiring: `RecordReading.svelte` delegates content rendering to `RecordDispatch`, and `App.svelte` relaxes the `activeSectionSchema` guard so unknown types also show a reading view via the `RecordView` fallback.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude (this pipeline) |
| Web App Worker | Phase 1 |
| Verification | Stage 7 |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | typeId-keyed VIEW_REGISTRY; RecordDispatch is the dispatch point for all record views | accepted |

No new ADR is required. ADR-006 defines this wiring as the intended outcome and names srs-web#70 as the follow-up.

---

## Contracts

### WASM API surface

No new or changed WASM methods. `SrsRecord.typeId` is already present on every record returned by `listRecords()`; `RecordDispatch` consumes it directly. No srs-rust dependency.

### TypeScript types

No changes to WASM output types. `RecordDispatch` accepts `{ record: SrsRecord }` — the same type already used by `RecordReading`.

---

## Scope

- Modify `src/lib/components/RecordReading.svelte`:
  - Remove the `schema: TypeFormDef` prop and the `labelMap` derived state.
  - Import `RecordDispatch` from `../../rendering/RecordDispatch.svelte`.
  - Replace the field-rendering `{#each record.fieldValues}` loop with `<RecordDispatch {record} />`.
  - Keep `data-testid="record-reading"`, the back button (`data-testid="record-reading-back"`), `.reading__card` wrapper, and all styles.
- Modify `src/App.svelte`:
  - Remove `schema={activeSectionSchema}` from the `<RecordReading>` call.
  - Relax the guard from `{:else if selectedRecord && formMode === null && activeSectionSchema}` to `{:else if selectedRecord && formMode === null}` so unknown types show the `RecordView` fallback instead of remaining invisible.

**Out of scope:**

- Consolidating `VIEW_REGISTRY` and `KNOWN_TYPE_CONFIG` (tracked in srs-web#71).
- Adding new type-specific views beyond the existing ArticleView / DecisionView / RoleView.
- Any WASM API change.
- Changes outside `src/lib/components/RecordReading.svelte` and `src/App.svelte`.

---

## Phases

### Phase 1: Wire RecordDispatch through RecordReading

**Goal:** `RecordDispatch` is imported and live in the rendering path; all existing gallery tests pass.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/components/RecordReading.svelte`:
  - Remove `import type { TypeFormDef } from "$lib/governance/types.js"`.
  - Remove `import CardField from "$lib/components/CardField.svelte"`.
  - Add `import RecordDispatch from "../../rendering/RecordDispatch.svelte"`.
  - Remove the `schema` field from the `$props()` destructure and its type annotation.
  - Remove `const labelMap = $derived(...)`.
  - Replace the `<div class="reading__card">` contents (the `{#each record.fieldValues}` block) with `<RecordDispatch {record} />`.
  - Keep `data-testid="record-reading"`, back button with `data-testid="record-reading-back"`, `.reading` wrapper, all existing styles.

- [ ] In `src/App.svelte`:
  - Remove `schema={activeSectionSchema}` from the `<RecordReading>` prop list.
  - Change the condition `{:else if selectedRecord && formMode === null && activeSectionSchema}` to `{:else if selectedRecord && formMode === null}`.
  - No other changes.

#### Acceptance Criteria

- [ ] `RecordDispatch` is imported and rendered inside `RecordReading.svelte`.
- [ ] `RecordReading.svelte` no longer has a `schema` prop or `labelMap` derived state.
- [ ] `App.svelte` does not pass `schema` to `RecordReading` and shows the reading view for records of any typeId (not just those with a loaded schema).
- [ ] Clicking an article card shows the reading view containing "Article Text" (from `ArticleView`).
- [ ] Clicking a decision card shows the reading view containing "Decision Statement" (from `DecisionView`).
- [ ] Clicking a role card shows the reading view containing "Role Holder" (from `RoleView`).
- [ ] A record of an unknown typeId renders via `RecordView` fallback without crashing.
- [ ] The back button (`data-testid="record-reading-back"`) still works.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

The existing `gallery.spec.ts` tests cover all reading-view scenarios (article, decision, role field labels; back button; record-reading testid). They must all pass.

#### Milestone gate

1. All acceptance criteria above checked.
2. `npm run typecheck`, `npm run lint`, `npm run build` all pass.
3. Mark task checkboxes `[x]`.
4. Commit: `feat(rendering): wire RecordDispatch into RecordReading (#70)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (unit tests)
- [ ] `npm run e2e` passes (all gallery.spec.ts tests)
- [ ] `RecordDispatch` is imported and used in `RecordReading.svelte`
- [ ] A record in an unknown section displays via `RecordView` fallback (no blank/crash)
- [ ] Existing gallery reading-view tests pass: article ("Article Text"), decision ("Decision Statement"), role ("Role Holder")

## Coordination Rules

- Web App Worker keeps to `src/lib/components/RecordReading.svelte` and `src/App.svelte` only.
- No SRS semantics in TypeScript (ADR-001).

## Assumptions

- `setFieldMetaContext` (called in App.svelte before rendering) is available to all descendant components including those rendered by RecordDispatch. This is confirmed: `setFieldMetaContext` sets a Svelte context and RecordView/ArticleView/DecisionView/RoleView all consume it via `getFieldMeta()`.
- The existing import path `../../rendering/RecordDispatch.svelte` is correct from `src/lib/components/RecordReading.svelte`.
