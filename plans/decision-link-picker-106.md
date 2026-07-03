# Plan: Decision Link Picker (#106)

> **Usage note:** The purpose of a plan file is to be reviewed and executed by agents. Write it with that reader in mind: unambiguous tasks, explicit file paths, named functions, checkable acceptance criteria. A plan that requires human interpretation at execution time is incomplete.

## Summary

Add a **decision link picker** to the governance editor. When a decision record is selected, the inspector's new "Decision Links" section shows any existing relations and a "Link to decision" button. Clicking the button opens a `DecisionLinkPicker.svelte` modal where the user picks a relation type (`supersedes`, `depends-on`, `precedes`) and selects another decision from a searchable list. On confirm, `createRelation()` is called and the relations section refreshes. No new WASM bindings are required — `createRelation`, `listRelations`, and `listRecords` already exist in `srs-client.ts`.

This is part of decision-log release 1 (muDemocracy.org#48).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | primary session agent |
| Web App Worker | primary session agent |
| Verification | primary session agent |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | All relation mutations go through WASM (`createRelation`, `listRelations`); no SRS semantics in TS | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | Two sequential `listRelations` calls (source + target) are presentation-layer reads; no business logic between them | accepted |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | "Decision Links" inspector section is gated on `DECISION_TYPE_ID` from `type-registry.ts` — the canonical source for type-keyed presentation concerns | accepted |

**Relation type constants:** `supersedes`, `depends-on`, `precedes` are hardcoded in TS as presentation-layer constants (the available set to show the user). They are opaque strings passed directly to WASM — analogous to `LIFECYCLE_TRANSITIONS` in `lifecycle.ts`. This does not violate ADR-001.

---

## Contracts

### WASM API surface

No new WASM methods are required. The following existing methods are used:

- `createRelation(repo, CreateRelationInput) → SrsRelation` — creates a relation
- `listRelations(repo, RelationListFilter) → SrsRelation[]` — lists relations (called twice: source filter + target filter)
- `listRecords(repo, {}) → SrsRecord[]` — already called in `loadSectionRecords()`; decisions reused from `activeRecords`

### TypeScript types

All required TS types (`CreateRelationInput`, `SrsRelation`, `RelationListFilter`, `SrsRecord`) are already declared in `src/lib/srs-client.ts`. No new types needed.

---

## Scope

- New `src/lib/components/DecisionLinkPicker.svelte` modal component
- Update `src/lib/governance/GovernanceShell.svelte`:
  - Add `decisionRelations` state, `loadDecisionRelations()`, `handleAddRelation()`
  - Reactive load of relations when selected decision changes
  - New "Decision Links" inspector section (decision-only)
- New unit tests for `createRelation`, `listRelations`, `deleteRelation` in `tests/srs-client.test.ts`
- New e2e tests in `e2e/decision-link.spec.ts`

**Out of scope:**

- Deleting relations via the UI (tracked as a future enhancement)
- Showing relation details beyond type + peer label
- Relations for non-decision record types
- Validating against existing duplicate relations (WASM handles validity)

---

## Phases

### Phase 1: DecisionLinkPicker modal component

**Goal:** `DecisionLinkPicker.svelte` exists and renders correctly in isolation (typecheck + build pass).

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/DecisionLinkPicker.svelte` with the following props:
  ```ts
  interface Props {
    sourceInstanceId: string;
    sourceLabel: string;
    decisions: SrsRecord[];          // excludes the source record
    onLink: (relationType: string, targetInstanceId: string) => void;
    onCancel: () => void;
  }
  ```
- [ ] Internal state: `selectedRelationType = $state<string>("supersedes")`, `searchQuery = $state<string>("")`, `selectedTargetId = $state<string | null>(null)`
- [ ] Relation type options (presentation constants):
  ```ts
  const LINK_RELATION_TYPES = [
    { value: "supersedes",  label: "Supersedes (this replaces)" },
    { value: "depends-on",  label: "Depends on (this requires)" },
    { value: "precedes",    label: "Precedes (this comes before)" },
  ] as const;
  ```
- [ ] `filteredDecisions` derived: filter `decisions` by `searchQuery` (case-insensitive match on `record.displayLabel ?? record.instanceId`)
- [ ] Render structure:
  - Modal overlay (same pattern as `SuccessorModal.svelte`)
  - `<h2>` title: "Link to another decision"
  - `<p>` subtitle: "From: {sourceLabel}"
  - `<select>` or `<fieldset>` for relation type (data-testid="link-relation-type")
  - `<input type="search">` for search (data-testid="link-search")
  - Scrollable `<ul>` of `filteredDecisions` — each item a `<button>` with `class:selected={selectedTargetId === record.instanceId}` (data-testid="link-decision-item")
  - Empty state: "No other decisions found" when `filteredDecisions.length === 0`
  - Footer: Cancel button + "Add link" button (disabled unless `selectedTargetId !== null`, data-testid="link-confirm")
- [ ] On "Add link" click: call `onLink(selectedRelationType, selectedTargetId)` if `selectedTargetId !== null`
- [ ] Export from `src/lib/components/index.ts` (add to barrel)

#### Acceptance Criteria

- [ ] `DecisionLinkPicker.svelte` renders: title, relation type selector, search input, decision list, action buttons
- [ ] Selecting a decision from the list sets `selectedTargetId`; "Add link" button enables
- [ ] Searching filters the list case-insensitively by `displayLabel` (or `instanceId` when `displayLabel` is absent)
- [ ] `onLink` is called with the chosen `relationType` and `targetInstanceId`
- [ ] `onCancel` is called on Cancel click
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
```

#### Milestone gate

1. Verify acceptance criteria above.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: add DecisionLinkPicker modal component (#106)`

---

### Phase 2: GovernanceShell integration

**Goal:** "Decision Links" section appears in the inspector for selected decisions; the link picker opens, creates a relation, and the section refreshes.

**Agent:** Web App Worker

#### Tasks

- [ ] In `GovernanceShell.svelte`, add imports:
  ```ts
  import { listRelations, createRelation } from "$lib/srs-client.js";
  import type { SrsRelation } from "$lib/srs-client.js";
  import DecisionLinkPicker from "$lib/components/DecisionLinkPicker.svelte";
  ```
  (`DECISION_TYPE_ID` is already imported from `$lib/governance/type-registry.js` in `GovernanceShell.svelte` — no new import needed for it.)
- [ ] Add state:
  ```ts
  let showLinkPicker = $state(false);
  let decisionRelations = $state<SrsRelation[]>([]);
  ```
- [ ] Add `loadDecisionRelations(instanceId: string): void` helper:
  ```ts
  function loadDecisionRelations(instanceId: string): void {
    try {
      const asSource = listRelations(repo, { source: instanceId });
      const asTarget = listRelations(repo, { target: instanceId });
      decisionRelations = [...asSource, ...asTarget];
    } catch (e) {
      console.error("loadDecisionRelations failed:", e);
      decisionRelations = [];
    }
  }
  ```
- [ ] Add `$effect` to reload relations when selected decision changes:
  ```ts
  $effect(() => {
    if (selectedRecord && activeSection_?.typeId === DECISION_TYPE_ID) {
      loadDecisionRelations(selectedRecord.instanceId);
    } else {
      decisionRelations = [];
    }
  });
  ```
- [ ] Add `handleAddRelation(relationType: string, targetInstanceId: string): void`:
  ```ts
  function handleAddRelation(relationType: string, targetInstanceId: string): void {
    if (!selectedRecord) return;
    try {
      createRelation(repo, {
        relationType,
        sourceInstanceId: selectedRecord.instanceId,
        targetInstanceId,
      });
      showLinkPicker = false;
      loadDecisionRelations(selectedRecord.instanceId);
      refreshValidation();
    } catch (e) {
      console.error("createRelation failed:", e);
    }
  }
  ```
- [ ] In the inspector `{#if selectedRecord && formMode === null}` block, add a "Decision Links" `<InspectorSection>` **after** the existing record-actions section and **only when** `activeSection_?.typeId === DECISION_TYPE_ID`:
  ```svelte
  {#if activeSection_?.typeId === DECISION_TYPE_ID}
    <InspectorSection title="Decision Links" aside={decisionRelations.length === 0 ? "" : String(decisionRelations.length)}>
      {#if decisionRelations.length === 0}
        <p class="inspector__empty">No links yet.</p>
      {:else}
        <ul class="inspector__relations" data-testid="decision-relations-list">
          {#each decisionRelations as rel (rel.relationId)}
            {@const peerId = rel.sourceInstanceId === selectedRecord.instanceId ? rel.targetInstanceId : rel.sourceInstanceId}
            {@const peerLabel = activeRecords.find(r => r.instanceId === peerId)?.displayLabel ?? peerId.slice(0, 8) + "…"}
            {@const direction = rel.sourceInstanceId === selectedRecord.instanceId ? "→" : "←"}
            <li class="inspector__relation-item" data-testid="relation-item">
              <span class="inspector__relation-type">{rel.relationType}</span>
              <span class="inspector__relation-dir">{direction}</span>
              <span class="inspector__relation-peer">{peerLabel}</span>
            </li>
          {/each}
        </ul>
      {/if}
      <button
        class="inspector__btn"
        data-testid="add-relation-btn"
        onclick={() => { showLinkPicker = true; }}
      >Link to decision</button>
    </InspectorSection>
  {/if}
  ```
- [ ] Mount `DecisionLinkPicker` modal at end of template (alongside SuccessorModal):
  ```svelte
  {#if showLinkPicker && selectedRecord && activeSection_?.typeId === DECISION_TYPE_ID}
    <DecisionLinkPicker
      sourceInstanceId={selectedRecord.instanceId}
      sourceLabel={selectedRecord.displayLabel ?? selectedRecord.instanceId.slice(0, 8)}
      decisions={activeRecords.filter(r => r.instanceId !== selectedRecord.instanceId)}
      onLink={handleAddRelation}
      onCancel={() => { showLinkPicker = false; }}
    />
  {/if}
  ```
- [ ] Add CSS for `.inspector__empty`, `.inspector__relations`, `.inspector__relation-item`, `.inspector__relation-type`, `.inspector__relation-dir`, `.inspector__relation-peer` to GovernanceShell `<style>` block

#### Acceptance Criteria

- [ ] When a decision is selected, inspector shows "Decision Links" section with "Link to decision" button
- [ ] "Decision Links" section is NOT shown for non-decision record types
- [ ] Clicking "Link to decision" opens the DecisionLinkPicker modal
- [ ] After creating a relation, the picker closes and the relations list updates
- [ ] No regression: existing Edit/Delete/lifecycle transition buttons still work
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify acceptance criteria above.
2. Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` — all must pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: wire DecisionLinkPicker into GovernanceShell inspector (#106)`

---

### Phase 3: Unit tests for relation WASM wrappers

**Goal:** `createRelation`, `listRelations`, `deleteRelation` are covered in `tests/srs-client.test.ts`.

**Agent:** Web App Worker

#### Tasks

- [ ] Add to `tests/srs-client.test.ts`:
  - `describe("listRelations")`: verify `list_relations` is called with the correct JSON filter; camelCase field normalisation is applied
  - `describe("createRelation")`: verify `create_relation` is called with the correct JSON input; returned relation is normalised
  - `describe("deleteRelation")`: verify `delete_relation` is called with the relation ID (the TS wrapper exists in `srs-client.ts` even though the UI delete feature is deferred — testing the wrapper is in scope to ensure the binding is correct)
- [ ] Use the existing `mockRepo` helper from the same file

#### Acceptance Criteria

- [ ] 3 new `describe` blocks added, each with at least 2 `it` cases
- [ ] `npm test` passes with no failures

#### Testing

```bash
npm test
```

#### Milestone gate

1. All tests pass.
2. Commit: `test: unit tests for relation WASM wrappers (#106)`

---

### Phase 4: E2E tests

**Goal:** `e2e/decision-link.spec.ts` covers the happy path of creating a decision link.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `e2e/decision-link.spec.ts`:
  - Setup: navigate to `/`, choose governance mode, load `gallery.srsj` (same pattern as `lifecycle.spec.ts`)
  - Navigate to Decisions section, click the first decision in the list
  - Test 1: "Decision Links inspector section appears for a selected decision"
    - Assert `data-testid="add-relation-btn"` is visible
  - Test 2: "Link picker opens and shows decisions"
    - Click "Link to decision" button
    - Assert modal title "Link to another decision" is visible
    - Assert `data-testid="link-search"` is visible
    - Assert at least one `data-testid="link-decision-item"` is visible (other decisions)
    - Assert `data-testid="link-confirm"` button is disabled initially
  - Test 3: "Creating a relation persists in the relations list"
    - Open picker, click a different decision, click "Add link"
    - Assert modal closes
    - Assert `data-testid="decision-relations-list"` is visible with at least one `data-testid="relation-item"`

#### Acceptance Criteria

- [ ] All 3 tests pass when run against the dev server
- [ ] Tests follow the pattern in `lifecycle.spec.ts` (same beforeEach setup)

#### Testing

```bash
npm run e2e
```

(Note: e2e is not in CI — typecheck and lint gate Phase 4; run e2e manually or in dogfooding stage.)

#### Milestone gate

1. Tests are written and `npm run typecheck` passes.
2. Commit: `test(e2e): decision link picker (#106)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] WASM loads against gallery.srsj without JS errors
- [ ] Selecting a decision shows "Decision Links" section in inspector
- [ ] "Link to decision" opens the picker modal
- [ ] Picking a decision + relation type and clicking "Add link" creates the relation and closes the modal
- [ ] Relations list in inspector reflects the newly created relation
- [ ] No regression in decision creation, editing, lifecycle transitions, or validation

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). All mutations go through `createRelation()`.
- Relation type strings (`supersedes`, `depends-on`, `precedes`) are presentation-layer constants; they are passed as-is to WASM.

## Assumptions

- The gallery.srsj fixture has ≥ 2 decision records (9 confirmed), so the link picker will always have decisions to show.
- `record.displayLabel` is always populated by the WASM normalizer (confirmed: lands from srs-rust#293/srs-web#91 which is already merged).
- `listRelations` with a `source` filter returns only relations where the given id is the source (confirmed from srs-client.ts).
