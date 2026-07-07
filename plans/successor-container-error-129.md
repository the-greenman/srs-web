# Plan: Surface handleCreateSuccessor addContainerMember failures (#129)

## Summary

`handleCreateSuccessor` in `GovernanceShell.svelte` silently swallows `addContainerMember` failures: if container registration fails after a successor is successfully created, the user sees nothing — they lose the container registration silently. This is the parallel gap to the bug fixed in #113 (create path). The fix surfaces the error to the user via `formError`, displayed in the inspector's record-actions section, using the existing `.inspector__export-error` CSS class and `role="alert"` pattern already established by the export-error display.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Web App Worker | — |
| Verification | — |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS — this fix is UI state only | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) decision note | Two-call `createRecordSuccessor` + `addContainerMember` is the accepted pattern; this fix stays within it | accepted |

No new ADR is required: this fix does not establish a new architectural constraint, it extends existing error-surfacing behaviour to cover a gap.

---

## Contracts

### WASM API surface

No new or changed WASM methods are required. The fix is entirely in the UI error-surfacing layer.

### TypeScript types

No new TypeScript types. `formError: string | null` already exists in `GovernanceShell.svelte`.

---

## Scope

- Set `formError` after `addContainerMember` fails in `handleCreateSuccessor`
- Add an inline error display for `formError` in the inspector record-actions section (`{#if selectedRecord && formMode === null}`) using the existing `.inspector__export-error` CSS class

**Out of scope:**

- Retry affordance (noted as a future concern in the issue)
- Migration to an atomic `create_decision` binding (tracked in srs-rust#315)
- Any changes to the create path or edit path (covered by #113)
- Toast/notification system (no such system exists; inline inspector error is consistent with the export-error pattern)
- Surfacing `createRecordSuccessor` failures (the outer catch at line ~563 still logs only; tracked separately — see filed follow-up issue)

---

## Phases

### Phase 1: Surface the error

**Goal:** After `handleCreateSuccessor` runs and `addContainerMember` fails, the user sees a visible error message in the inspector.

**Agent:** Web App Worker

**File:** `srs-web/src/lib/governance/GovernanceShell.svelte`

#### Tasks

- [ ] In `handleCreateSuccessor`, add `formError = null;` immediately after `showSuccessorModal = false;` (line 546) to clear any stale error from a prior failed attempt — mirrors `handleFormSave` line 433:
  ```typescript
  function handleCreateSuccessor() {
    if (!selectedRecord) return;
    if (statusFieldId === undefined) return;
    showSuccessorModal = false;
    formError = null;   // ← add this
    try {
  ```

- [ ] In the same function (line ~554), change the `addContainerMember` catch block to set `formError` with a human-readable message:
  ```typescript
  } catch (e: unknown) {
    console.error("addContainerMember failed for successor:", e);
    formError = e instanceof Error
      ? `Successor created, but container registration failed: ${e.message}`
      : "Successor created, but could not register in container.";
  }
  ```
  Keep the existing `loadContainerNav()`, `selectedId = result.record.instanceId`, and `persistWorkingCopy()` calls that follow — they must still run so the successor is visible.

- [ ] In the inspector template, inside the `{#if selectedRecord && formMode === null}` block (the first `InspectorSection`), add the error display **after the lifecycle transitions block** (after the `{/if}` that closes the `{#if transitions.length > 0}` block, around line 847) and **before** `</InspectorSection>`:
  ```svelte
  {#if formError}
    <p class="inspector__export-error" role="alert">{formError}</p>
  {/if}
  ```
  Placement after transitions (not between actions and transitions) keeps the layout coherent: actions → transitions → error. Use the existing `.inspector__export-error` CSS class (already defined at line ~1214). No new CSS needed.

- [ ] In `handleEditRecord` (line ~500), add `formError = null;` before `formMode = "edit"` to prevent a stale successor-failure error from appearing inside a fresh, unrelated edit form. Without this, a user who sees the successor error and then clicks Edit will see "Successor created, but container registration failed" as the RecordForm's `saveError` — a misleading message in a new context:
  ```typescript
  function handleEditRecord() {
    if (!selectedRecord) return;
    // ... immutable check / showSuccessorModal ...
    editingRecord = selectedRecord;
    formError = null;    // ← add this
    formMode = "edit";
  }
  ```

- [ ] Confirm `formError` is cleared at all appropriate points:
  - On nav click (line 697): `formError = null` ✓
  - On `handleFormCancel` (line 496): `formError = null` ✓
  - At start of `handleFormSave` (line 433): `formError = null` ✓
  - In `handleEditRecord` before `formMode = "edit"` ← **add this** (Architecture Reviewer finding #1)

#### Acceptance Criteria

- [ ] When `addContainerMember` throws inside `handleCreateSuccessor`, `formError` is set to a non-null message
- [ ] The error message is visible to the user in the inspector (not just in console)
- [ ] The successor record is still created and selected (error is non-blocking for the record itself)
- [ ] `formError` clears when the user navigates to another container
- [ ] Clicking Edit after a successor container failure does NOT show the stale error in the RecordForm (`handleEditRecord` clears it)
- [ ] `npm run typecheck` passes with no new errors
- [ ] `npm run build` succeeds
- [ ] No regression in the create-path error handling (#113)

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

Verify successor error path specifically:
- Run governance shell tests: `npm test -- --grep "successor"` (or equivalent)
- Manual: open a decision container, trigger successor creation with a mock `addContainerMember` failure (or via a unit test spy), confirm the inspector shows the error message and the successor record is still visible
- Confirm no stale error: trigger a failed successor, then trigger a successful successor — old error must not appear after the success

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `fix: surface addContainerMember failure in handleCreateSuccessor (#129)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] After a simulated `addContainerMember` failure in `handleCreateSuccessor`, the inspector shows the error message
- [ ] No regression in create-path error handling (the `formError` display inside the RecordForm still works when `formMode !== null`)
- [ ] Clicking Edit after a successor container failure does NOT show the stale error in the RecordForm

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001).

## Assumptions

- The existing `.inspector__export-error` CSS class (already used for decision export errors at line ~1214 and ~923) is the correct pattern for inline inspector errors.
- No new CSS variables or classes need to be introduced.
- `formError` is the correct shared state for this error (consistent clearing already in place).
