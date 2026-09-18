# Plan: Document-mutation save-state gaps from PR #311 (#312)

> **Usage note:** The purpose of a plan file is to be reviewed and executed by agents. Write it with that reader in mind: unambiguous tasks, explicit file paths, named functions, checkable acceptance criteria. A plan that requires human interpretation at execution time is incomplete.

## Summary

PR #311 introduced `DocumentMutationTracker` and a `saving`-state UI guard, but left two gaps found by
a scheduled architecture-quality review (issue #312): (1) `handleDocumentMutation()` in `src/App.svelte`
discards the boolean result of `saveWorkingCopy()`, so `GovernanceShell.svelte`'s `persistWorkingCopy()`
unconditionally shows "Saved" even when the local recovery-copy write failed; (2) `disabled={saving}`
was added to only two buttons ("New {label}" in `GovernanceShell.svelte`, "+ New guide" in
`GuidesShell.svelte`), leaving Edit, Delete, lifecycle transitions, add-tag, relation create/delete
(`GovernanceShell.svelte`) and section reorder/removal (`GuidesShell.svelte`) able to mutate the
in-place WASM repository while a provider save is in flight. The e2e test that covered a mutation
during a pending save was also narrowed to only the "New" button in 630ca75. This is a UI-completeness
and message-accuracy fix — `DocumentMutationTracker.completeSave()` already compares epoch/revision on
every save regardless of UI path, so recovery/dirty state is never silently lost (proven by
`tests/document-mutations.test.ts`).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Web App Worker | — |
| Verification | — |

See [agents.md](agents.md) for role definitions. No new role needed — this is a same-repo Svelte/TS bug fix.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |

No new ADR: this fix only plumbs an existing boolean return value and adds `disabled={saving}` to
existing controls — the same pattern already established by 630ca75 for the "New" buttons. It does not
add, remove, or reinterpret an architectural constraint.

---

## Contracts

### WASM API surface

**No.** This is pure TypeScript/Svelte state plumbing over `localStorage` (`src/lib/browser-cache.ts`,
already correct and already returns `boolean`) and existing WASM-backed mutation handlers. No new or
changed WASM method is required.

### TypeScript types

`onDocumentMutation` changes from `() => void` to `() => boolean` in `GovernanceShell.svelte`'s props
(the shared handler in `App.svelte` already returns a value once fixed; `() => boolean` is
assignment-compatible with the current `() => void` prop type used elsewhere, e.g. `GuidesShell.svelte`,
so that file's prop type does not need to change — it simply ignores the return value, as it has no
local "saved" indicator to correct).

---

## Scope

**In scope:**

- `src/App.svelte`: `handleDocumentMutation()` returns the `boolean` result of `saveWorkingCopy()`.
- `src/lib/governance/GovernanceShell.svelte`:
  - `onDocumentMutation` prop type → `() => boolean` (default `() => true`).
  - `persistWorkingCopy()` reflects a failed local write: no false "Saved" indicator; a visible,
    distinct failure message instead.
  - `disabled={saving}` added to: Edit button, Delete button, each lifecycle-transition button,
    "Link to decision" button, delete-relation button, tag-input, tag-add button, and (same-class
    gap found while reading the code, not separately enumerated in #312 but the identical bug) the
    tag-chip remove (×) control.
- `src/lib/guides/GuidesShell.svelte`: `disabled={saving}` added to the section move-up, move-down,
  and remove buttons (in addition to their existing index-bounds `disabled` conditions).
- Tests: component tests (`tests/GovernanceShell.test.ts`, `tests/GuidesShell.test.ts`) covering the
  Bug 1 fix and every newly guarded control reachable without a decision-specific WASM fixture; e2e
  tests (`e2e/cloud-storage.spec.ts`) broadened for the pending-provider-save race, using `gallery.srsj`
  (already used by `decision-tags.spec.ts` / `decision-link.spec.ts`) for the tag/relation controls that
  are gated behind the real `DECISION_TYPE_ID` and are impractical to fake at the component-test layer.

**Out of scope:**

- The cosmetic branch-naming mismatch noted at the end of #312 ("not actioned here" per the issue itself).
- Any change to `DocumentMutationTracker` — it is already correct and already covered by
  `tests/document-mutations.test.ts`; this plan touches only the UI layer around it.
- Guarding the `SuccessorModal` / relational-transition confirm flow's own internal controls, or
  `RecordForm`'s submit button — consistent with the precedent set by 630ca75, only the entry-point
  controls that call `persistWorkingCopy()`/`onDocumentMutation()` *directly* (not via a sub-form with
  its own local `formSaving` guard) are in scope, matching what #312 enumerates.

---

## Phases

### Phase 1: Fix Bug 1 — swallowed local-save failure

**Goal:** A failed local recovery-copy write (`saveWorkingCopy` returning `false`) is reflected in the
Governance UI instead of silently showing "Saved".

**Agent:** Web App Worker

#### Tasks

- [x] `src/App.svelte`: change `handleDocumentMutation()` to return `boolean` — `false` when `!repo`,
      otherwise the return value of `saveWorkingCopy(repoName, exportSrsj(repo))`.
- [x] `src/lib/governance/GovernanceShell.svelte`: change the `onDocumentMutation` prop type to
      `() => boolean` (default `() => true`, so tests/callers that don't care can omit it safely).
- [x] `src/lib/governance/GovernanceShell.svelte`: extend `saveIndicator` from
      `"idle" | "saved"` to `"idle" | "saved" | "local-save-failed"`. In `persistWorkingCopy()`, only
      set `"saved"` (and start the auto-clear timer) when `onDocumentMutation()` returns `true`;
      otherwise set `"local-save-failed"` and log a `console.warn`.
- [x] Render a visible, `data-testid="local-save-failed"` message (reusing the existing
      `.topbar__save-message` style, with an error-colored modifier) when
      `saveIndicator === "local-save-failed"`.
- [x] `src/lib/guides/GuidesShell.svelte`: no change needed — it has no local "Saved" indicator to
      correct (it calls `onDocumentMutation()` directly); confirm this during implementation and note
      it explicitly rather than adding speculative UI.

#### Acceptance Criteria

- [x] `onDocumentMutation` returning `false` in `GovernanceShell` never sets `saveIndicator` to `"saved"`.
- [x] A component test renders `GovernanceShell` with `onDocumentMutation: () => false`, triggers a
      mutation (record create, reusing the existing "New" → submit pattern already in
      `tests/GovernanceShell.test.ts`), and asserts the "Saved" indicator text is not shown and the
      failure message is.
- [x] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update this plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#312)`).

---

### Phase 2: Fix Bug 2 — extend the `saving` guard to every mutation-triggering control

**Goal:** Every control that calls `persistWorkingCopy()` / `onDocumentMutation()` directly (not
through a sub-form with its own `formSaving` guard) is disabled while a provider save is pending, in
both `GovernanceShell.svelte` and `GuidesShell.svelte`.

**Agent:** Web App Worker

#### Tasks

- [x] `src/lib/governance/GovernanceShell.svelte`: add `disabled={saving}` to:
  - the Edit button (`.inspector__btn`, `onclick={handleEditRecord}`)
  - the Delete button (`.inspector__btn--danger`, `onclick={handleDeleteRecord}`)
  - each lifecycle-transition button inside the `{#each allowedTransitions.transitions as transition}` loop
  - the "Link to decision" button (`data-testid="add-relation-btn"`)
  - the delete-relation button (`data-testid="delete-relation-btn"`)
  - the tag-input (`data-testid="tag-input"`) and the tag-add button (`data-testid="tag-add-btn"`)
  - the tag-chip remove control: change `onRemove={() => handleUpdateTags(...)}` to
    `onRemove={saving ? undefined : () => handleUpdateTags(...)}` (same unguarded-mutation bug class,
    found while implementing this phase; `TagChip` already renders no remove button when `onRemove`
    is falsy, so this needs no change to `TagChip.svelte` itself).
- [x] `src/lib/guides/GuidesShell.svelte`: add `disabled={saving}` to the section move-up button
      (combine with the existing `disabled={index === 0}`), move-down button (combine with the existing
      `disabled={index === orderedSections.length - 1}`), and the section-remove button.

#### Acceptance Criteria

- [x] Component tests assert `disabled` is `true` on each of the above controls when the shell is
      rendered with `saving: true` and a record/section is selected, and `false` when `saving: false`.
- [x] No behavioural change when `saving` is `false` (default UI behaviour unchanged).
- [x] `npm run typecheck` and `npm run lint` pass.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update this plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#312)`).

---

### Phase 3: Restore and broaden e2e coverage for the pending-save race

**Goal:** The race between a control's mutation and a pending provider save is covered by e2e tests
across more than the single "New" button, restoring the intent of the test deleted in 630ca75.

**Agent:** Web App Worker (tests) / Verification

#### Tasks

- [x] `e2e/cloud-storage.spec.ts`: broaden `installFakeProviders()` to accept an optional content
      override (default `SAMPLE_TEXT`), so other fixtures (`gallery.srsj`) can be served through the
      same pending-write-controllable Dropbox mock.
- [x] Broaden the existing test `"provider save pauses UI mutation admission until the write
      completes"`: after opening `dropbox-sample.srsj`, create one record via the already-guarded "New"
      flow (SAMPLE_TEXT's `Decision Log` type has no required fields) so it is selected, *then* trigger
      the pending save, and additionally assert the Edit and Delete buttons are disabled while pending
      and re-enabled once the write resolves.
- [x] Add a new test using the `gallery.srsj` fixture (already used by `decision-tags.spec.ts` /
      `decision-link.spec.ts`) through the same pending-write Dropbox mock: select a decision, add a
      tag and create a relation to another decision (both allowed pre-save), then start a pending
      provider save and assert `add-relation-btn`, `delete-relation-btn`, `tag-input`, and
      `tag-add-btn` are all disabled while pending and re-enabled once resolved.
- [x] Component tests (`tests/GuidesShell.test.ts`) cover the Guides-side reorder/remove and
      "+ New guide" guard's attribute wiring directly (cheaper and more deterministic than wiring a
      cloud-pending e2e fixture for guide sections — see Assumptions).
- [x] **(Added in response to plan review round 1 — Plan Reviewer should-fix.)** Add one e2e test using
      the same extended `installFakeProviders()` content override with `muSrs.srsj` (already used by
      `e2e/guides-ordering.spec.ts`, which has a guide with multiple sections) through the pending-write
      Dropbox mock: open the guide in Guides mode, start a pending provider save, and assert the section
      move-up/move-down/remove controls (`guides-section-up`/`guides-section-down`/`guides-section-remove`)
      are disabled while pending and re-enabled once resolved — giving the Guides side real e2e race
      coverage alongside Governance's, not just the component-level attribute check.

#### Acceptance Criteria

- [x] `npm run e2e` passes, including the broadened and new tests.
- [x] The broadened test demonstrates the race is blocked for at least Edit and Delete in addition to
      New (Governance) and tag/relation controls (Decision Log), addressing #312's "restore/broaden ...
      across more than just that one button."
- [x] The Guides side also has e2e race coverage (section move/remove), not only Governance.

#### Testing

```bash
npm run e2e
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Update this plan file: mark completed task checkboxes `[x]`.
3. Commit with a message referencing the issue (`... (#312)`).

---

## Final Acceptance

- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run build` succeeds
- [x] WASM loads and all WASM API calls succeed against `gallery.srsj`
- [x] A failed local recovery-copy write is visibly distinguished from a successful one in
      `GovernanceShell`'s save indicator.
- [x] Edit, Delete, lifecycle transitions, add-tag, tag-remove, relation create/delete
      (`GovernanceShell`) and section reorder/removal (`GuidesShell`) are all disabled while
      `saving` is `true`.
- [x] e2e coverage for the pending-save race spans more than the single "New" button.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). This plan adds none.
- Verification Agent runs after each phase and before final sign-off.

## Assumptions

- The component-test layer cannot cheaply exercise `GovernanceShell`'s `DecisionLogView` /
  tag / relation UI (gated behind the real `DECISION_TYPE_ID` from
  `src/lib/governance/type-registry.ts`, which is a production UUID rather than something a minimal
  mock repo can stand in for without effectively re-implementing `resolveContainerView` /
  `DecisionLogView`'s internals). Those controls are covered by e2e against `gallery.srsj` instead,
  reusing selectors already proven by `decision-tags.spec.ts` / `decision-link.spec.ts`. Edit, Delete,
  and lifecycle-transition guards do not depend on `DECISION_TYPE_ID` and are covered by component
  tests, which are faster and more deterministic than the equivalent e2e.
- GuidesShell's section reorder/removal and "+ New guide" guards get **both** a component test (mock
  `resolve_container_view`/`list_containers`/`order_by_precedes`, for fast deterministic attribute-wiring
  coverage) **and** an e2e test (`muSrs.srsj` through the pending-write Dropbox mock) for the real race —
  added in response to plan review round 1 (Plan Reviewer should-fix), since #312 asks for restored e2e
  race coverage specifically, and Governance already gets both layers.
- No new GitHub issues are filed as deferred work: both bugs in #312 are fully addressed by this plan;
  the "also noted" branch-naming mismatch is explicitly out of scope per the issue itself and requires
  no follow-up (it's cosmetic, already merged, no code impact).
