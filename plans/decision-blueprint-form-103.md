# Plan: Decision create form (blueprint-driven) — srs-web#103

## Summary

`DecisionFlow.svelte` implements a bespoke Quick Capture / Full Deliberation two-mode wizard
for decision creation. It hard-codes field name comparisons (`f.name === "title"`, `"status"`,
`"decision_statement"`, `"rationale"`) and omits `addContainerMember` after `createRecord`,
so new decisions are never registered in the `decision_log` container. This plan removes
`DecisionFlow.svelte` and wires decisions through the generic `RecordForm.svelte` path — the
same path used by articles and roles — with `addContainerMember` called on creation. Design
decision from issue thread: **proceed with generic `RecordForm`; Quick Capture and Full
Deliberation modes are removed permanently.**

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | (orchestrating agent) |
| Web App Worker | (implementing agent) |
| Verification | Verification Agent (srs-web) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TypeScript. All field definitions come from WASM. | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | typeId comparisons (`activeSection_?.typeId === DECISION_TYPE_ID`) are structural metadata, not SRS semantics — permitted under ADR-001. | accepted |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | TYPE_REGISTRY in `type-registry.ts` is the canonical location for type constants; `DECISION_LOG_CONTAINER_TYPE = "decision-log"` follows this pattern. | accepted |

No new ADR required: using `RecordForm` for decisions follows ADR-001 (generic, WASM-driven); ADR-006 and ADR-007 explicitly permit the `typeId` guard and the container type constant used here. ADR-003 (blueprint-driven guides) is not relevant — `GovernanceShell` uses `typeSchema()`, not `blueprintSchema()`.

---

## Contracts

### WASM API surface

**No new WASM bindings required.** All needed methods are already exposed in `srs-client.ts`:

| Method | Wrapper | Purpose |
|---|---|---|
| `create_record` | `createRecord` | Create the decision record |
| `add_container_member` | `addContainerMember` | Register decision in decision_log container |
| `list_containers` | `listContainers` | Discover decision_log container at boot |
| `type_schema` | `typeSchema` | Already used — provides TypeFormDef fields |

### TypeScript types

No new types required. `TypeFormDef`, `CreateRecordInput`, `ContainerSummary` — all already present in `srs-client.ts`.

---

## Scope

**In scope:**

- Remove `DecisionFlow.svelte` from active use (kept as dead file for one cycle, then deletion is a separate tidy-up issue)
- Remove `decisionFlowMode`, `decisionFlowSaving`, `decisionFlowError` state from `GovernanceShell.svelte`
- Remove `isDecisionSection` derived state from `GovernanceShell.svelte`
- Remove the `DecisionFlow` import and the `{#if decisionFlowMode}` branch
- Wire the "New Decision Log" button to the generic `formMode = 'create'` path used by all other sections
- Add `DECISION_LOG_CONTAINER_TYPE = "decision-log"` constant to `src/lib/governance/type-registry.ts`
- Discover the decision_log container at boot (`listContainers(repo, { containerType: DECISION_LOG_CONTAINER_TYPE })`) and store its ID in `GovernanceShell`
- Call `addContainerMember` in `handleFormSave` after creating a record in the decision section
- Update `e2e/decision-flow.spec.ts`: remove tests for Quick Capture / Full Deliberation; add tests for generic RecordForm create flow

**Out of scope:**

- Deleting `DecisionFlow.svelte` file (a separate clean-up issue will track this)
- Changing the `RecordForm.svelte` component itself
- Any UX improvements to the generic form (separate issue if desired)
- Re-introducing Quick Capture / Full Deliberation as generic blueprint features
- Any new WASM bindings

---

## Phases

### Phase 1: Governance shell — swap DecisionFlow for RecordForm + container registration

**Goal:** `GovernanceShell.svelte` uses `RecordForm` for decisions and calls `addContainerMember` on save; `DecisionFlow` is unused.

**Agent:** Web App Worker

#### Tasks

- [x] **Preflight:** confirm `gallery.srsj` fixture contains a container with `containerType === "decision-log"` (grep or open the fixture) — if absent, add one before proceeding
- [x] Add `DECISION_LOG_CONTAINER_TYPE = "decision-log"` to `src/lib/governance/type-registry.ts`
- [x] Add `addContainerMember`, `listContainers` imports to `GovernanceShell.svelte` (from `srs-client.js`)
- [x] Add `decisionLogContainerId = $state<string | null>(null)` to `GovernanceShell.svelte`
- [x] In `onMount`, after `buildSectionSchemas()`, call `listContainers(repo, { containerType: DECISION_LOG_CONTAINER_TYPE })` and store `containers.find(c => c.containerType === DECISION_LOG_CONTAINER_TYPE)?.containerId ?? null` as `decisionLogContainerId`
- [x] In `handleFormSave` create branch, after `createRecord` succeeds, if `decisionLogContainerId` is set and `activeSection_?.typeId === DECISION_TYPE_ID` (already imported from `type-registry.ts`), call `addContainerMember(repo, decisionLogContainerId, created.instanceId)` wrapped in try/catch — errors are logged but do not abort the create flow
- [x] Remove `decisionFlowMode`, `decisionFlowSaving`, `decisionFlowError` state variables
- [x] Remove `isDecisionSection` derived state
- [x] Remove `DecisionFlow` import from `GovernanceShell.svelte`
- [x] In the topbar snippet: remove `{#if isDecisionSection} ... {:else if activeSectionSchema} ...` — replace with a single `{#if activeSectionSchema}` guard showing "New {activeSectionSchema.label}" for all sections
- [x] Remove the `{#if decisionFlowMode} ... {/if}` branch from the Workspace snippet (the RecordForm branch already handles create for all sections)
- [x] Remove the nav-item onclick that sets `decisionFlowMode = false`
- [x] Add unit tests in `tests/srs-client.test.ts` for `addContainerMember` and `listContainers` wrappers, asserting correct WASM method invocations with containerId/instanceId arguments (GovernanceShell integration verified by e2e)

#### Acceptance Criteria

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] `GovernanceShell.svelte` contains zero references to `DecisionFlow` or `decisionFlowMode`
- [ ] `GovernanceShell.svelte` imports `addContainerMember` and `listContainers` from `srs-client.js`
- [ ] `DecisionFlow.svelte` is not imported anywhere (verify with `grep -r DecisionFlow src/`)
- [ ] `npm test` includes a unit test asserting that `handleFormSave` calls `addContainerMember` when `decisionLogContainerId` is set and `activeSection_?.typeId === DECISION_TYPE_ID`

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
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit: `feat: replace DecisionFlow with generic RecordForm + container registration (#103)`.

---

### Phase 2: Update e2e tests

**Goal:** `decision-flow.spec.ts` tests the generic `RecordForm` create flow for decisions; all Quick Capture / Full Deliberation test cases are replaced.

**Agent:** Web App Worker

#### Tasks

- [x] Rewrite `e2e/decision-flow.spec.ts`:
  - Remove all tests referencing `Quick Capture`, `Full Deliberation`, `.decision-flow__progress-label`, `#del-stage-field`, `.decision-summary`
  - Rename describe block to `"Decision create (generic RecordForm, srs-web#103)"`
  - **Add test 1:** "New button opens generic RecordForm" — click `button.topbar__new`, assert `page.getByTestId("record-form")` is visible
  - **Add test 2:** "RecordForm create saves decision and shows it in the list" — fill the Title field via `page.locator('[data-testid="record-form"] .field').filter({ hasText: 'Title' }).locator('input')`, submit `button[type=submit]`, assert `page.getByTestId("record-reading")` contains the title, click back, assert `page.getByTestId("decision-log-view")` contains the title
  - **Add test 3:** "Cancel from RecordForm returns to decision log list" — click `button.topbar__new`, then `page.getByRole("button", { name: "Cancel" })`, assert `page.getByTestId("decision-log-view")` is visible
  - No fixture changes needed — `gallery.srsj` already contains the decision_log container

#### Acceptance Criteria

- [ ] `npm run e2e -- --grep "Decision create"` passes (or all e2e pass)
- [ ] No test references `Quick Capture`, `Full Deliberation`, `decision-flow__progress-label`, or `decision-summary`

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run e2e
```

#### Milestone gate

1. All e2e tests pass.
2. Commit: `test(e2e): replace DecisionFlow tests with generic RecordForm create tests (#103)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (including new unit test asserting `addContainerMember` is called)
- [ ] `npm run e2e` passes (including new Decision create e2e tests)
- [ ] `GovernanceShell.svelte` has zero references to `DecisionFlow`, `decisionFlowMode`, `decisionFlowSaving`, `decisionFlowError`, or `isDecisionSection`
- [ ] Creating a decision via the generic RecordForm calls `addContainerMember` (verified in e2e: decision appears in list)
- [ ] No regression in guides editor or article/role create flows (verified by existing e2e suite passing)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). Container type `"decision-log"` is a config constant — not an SRS semantic.
- No changes to `RecordForm.svelte` or `GovernanceShell`'s existing handlers for edit/delete/lifecycle transitions.

## Assumptions

- The `decision_log` container already exists in the test fixture (`gallery.srsj`) — no fixture changes are needed.
- `listContainers(repo, { containerType: "decision-log" })` returns exactly one container in a governance repo. If it returns zero (e.g. a newly-created repo without the decision_log container), `addContainerMember` is silently skipped and the decision is still created.
- `DecisionFlow.svelte` becomes dead code; a separate "tidy-up" issue should track its deletion after this merges.
