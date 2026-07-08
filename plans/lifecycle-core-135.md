# Plan: Governance editor — drive lifecycle via core (srs-web#135)

## Summary

`GovernanceShell.svelte` currently uses a hardcoded TypeScript table (`LIFECYCLE_TRANSITIONS`) and
a manually-discovered status field UUID to drive lifecycle transitions by writing a raw field
value. This violates ADR-001 (SRS semantics in TypeScript) and diverges from the real lifecycle
definition in the governance package. The WASM binding `get_allowed_lifecycle_transitions` (srs-rust
build 98) returns the authoritative allowed transitions from the SRS engine. This plan replaces all
hardcoded lifecycle TS with calls to that binding and `set_lifecycle_state`, deletes
`lifecycle.ts`, and updates the gallery fixture and e2e tests to reflect the governance lifecycle
vocabulary (draft → proposed → ratified → closed/superseded).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude-sonnet-4-6 (this session) |
| Web App Worker | claude-sonnet-4-6 (this session) |
| Verification | claude-sonnet-4-6 (this session) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| srs-rust ADR-022 | Governance status = SRS lifecycle state; `get_allowed_lifecycle_transitions` is canonical | accepted (srs-rust) |

No new ADR required. This plan executes the migration path already mandated by ADR-001 (residual
debt item: "Hardcoded vocabularies — the lifecycle `STATUS_OPTIONS` list is hardcoded in TS").

---

## Contracts

### WASM API surface

No new WASM bindings required. `get_allowed_lifecycle_transitions(instance_id: string)` and
`set_lifecycle_state(instance_id: string, state: string)` are both present in srs-bindings build 98
(`src/lib/srs_bindings/srs_bindings.d.ts` line 103, and line ~40 of the SrsRepository interface).

**`get_allowed_lifecycle_transitions` WASM payload shape** (from srs-rust golden file):
```json
{
  "currentState": "string",
  "isImmutable": false,
  "transitions": [
    { "name": "propose", "to": "proposed", "toIsFinal": false }
  ]
}
```
Error: throws `LifecycleNotDefined` when the record type has no `lifecycleRef`
(must be caught → return null).

**Governance lifecycle** (from governance-seed):
- States: `draft` (initial), `proposed`, `ratified`, `closed` (final), `superseded` (final)
- Transitions: draft→proposed ("propose"), proposed→draft ("revise"),
  proposed→ratified ("ratify"), ratified→superseded ("supersede"), ratified→closed ("close")

### TypeScript types

New types in `src/lib/srs-client.ts`:
```typescript
export type AllowedTransitionEntry = {
  name: string;
  to: string;
  toIsFinal: boolean;
};

export type AllowedLifecycleTransitionsResult = {
  currentState: string;
  isImmutable: boolean;
  transitions: AllowedTransitionEntry[];
};
```

`get_allowed_lifecycle_transitions` must be added to the `SrsRepository` interface (currently
the method exists in the WASM .d.ts but is not reflected in the TS interface).

---

## Scope

- Add `AllowedTransitionEntry`, `AllowedLifecycleTransitionsResult` types and
  `getAllowedLifecycleTransitions` wrapper to `srs-client.ts`.
- Add `get_allowed_lifecycle_transitions` to the `SrsRepository` TS interface.
- Update `GovernanceShell.svelte`:
  - Remove `LIFECYCLE_TRANSITIONS`, `IMMUTABLE_STATES`, `statusFieldId` usage.
  - Add reactive `allowedTransitions` state driven by the WASM call.
  - Drive `handleEditRecord` immutability check from `allowedTransitions.isImmutable`.
  - Drive `handleLifecycleTransition` via `setLifecycleState` WASM call.
  - Drive `handleCreateSuccessor` without filtering/setting the status field.
  - Update template transition buttons to iterate `allowedTransitions.transitions`.
- Delete `src/lib/governance/lifecycle.ts`.
- Update `e2e/fixtures/gallery.srsj` to include the governance lifecycle definition and
  set `lifecycleState: "ratified"` on article records, with `lifecycleRef` on the article type.
- Update `e2e/lifecycle.spec.ts` to match the governance lifecycle vocabulary.
- Update unit test mock (`tests/srs-client.test.ts`) to include `get_allowed_lifecycle_transitions`.

**Out of scope:**

- Removing the status field from the governance package schema (field still exists; only the
  lifecycle transition mechanism changes).
- Migrating other callers of `getStringField` / `getFieldValue` (only GovernanceShell is affected
  by this plan; `DecisionSummaryCard.svelte` and `decision-export-utils.ts` retain their usage of
  `getStringField` for display purposes — tracked as ADR-001 residual debt).
- Adding `STATUS_OPTIONS` dropdown as a WASM-derived list (separate issue).
- Migrating relation-chain traversal in `GuidesShell.svelte` (separate issue).
- Any srs-rust changes.

---

## Phases

### Phase 1: WASM client wrapper

**Goal:** `getAllowedLifecycleTransitions` is exported from `srs-client.ts` with types, tested,
and the `SrsRepository` TS interface includes `get_allowed_lifecycle_transitions`.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/srs-client.ts`:
  - Add `AllowedTransitionEntry` type (fields: `name: string`, `to: string`, `toIsFinal: boolean`).
  - Add `AllowedLifecycleTransitionsResult` type (fields: `currentState: string`,
    `isImmutable: boolean`, `transitions: AllowedTransitionEntry[]`).
  - Add `get_allowed_lifecycle_transitions(instance_id: string): any;` to the `SrsRepository`
    interface (alongside the existing `set_lifecycle_state`).
  - Add `getAllowedLifecycleTransitions(repo: SrsRepository, instanceId: string):
    AllowedLifecycleTransitionsResult | null` — call `repo.get_allowed_lifecycle_transitions(instanceId)`,
    cast result to `AllowedLifecycleTransitionsResult`, catch **all errors** (any error is treated
    as LifecycleNotDefined, return null).
  - Export `getAllowedLifecycleTransitions` and the two new types.

- [ ] In `tests/srs-client.test.ts`:
  - Add `get_allowed_lifecycle_transitions: () => { throw new Error("LifecycleNotDefined"); }`
    to the `mockRepo()` function so the existing mock continues to satisfy the interface.
  - Add a test for `getAllowedLifecycleTransitions`:
    - Case A: mock returns a valid payload → returns `AllowedLifecycleTransitionsResult`.
    - Case B: mock throws → returns `null`.

#### Acceptance Criteria

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes (new unit tests green).
- [ ] `getAllowedLifecycleTransitions` exported and callable without TS errors.

#### Testing

```bash
npm run typecheck
npm run lint
npm test
```

#### Milestone gate

1. All acceptance criteria above are met.
2. Run `npm run typecheck` and `npm test` — both pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: add getAllowedLifecycleTransitions wrapper to srs-client (#135)`

---

### Phase 2: GovernanceShell — WASM-driven lifecycle

**Goal:** `GovernanceShell.svelte` uses `allowedTransitions` (from WASM) for all immutability
checks and transition button rendering; `handleLifecycleTransition` calls `setLifecycleState`;
`handleCreateSuccessor` no longer filters/sets the status field.

**Agent:** Web App Worker

#### Tasks

- [ ] Add import of `getAllowedLifecycleTransitions`, `AllowedLifecycleTransitionsResult`
  from `$lib/srs-client.js` in `GovernanceShell.svelte`.

- [ ] Add `let allowedTransitions = $state<AllowedLifecycleTransitionsResult | null>(null);`
  near the other inspector state variables (around line 159).

- [ ] Add a `$effect` that fires when `selectedRecord` changes:
  ```typescript
  $effect(() => {
    if (!selectedRecord) { allowedTransitions = null; return; }
    try {
      allowedTransitions = getAllowedLifecycleTransitions(repo, selectedRecord.instanceId);
    } catch {
      allowedTransitions = null;
    }
  });
  ```
  (The try/catch is defensive; `getAllowedLifecycleTransitions` itself swallows errors and returns
  null, but the effect should still guard.)

- [ ] Update `handleEditRecord` (currently ~line 553–567):
  - Replace the check:
    ```typescript
    if (statusFieldId !== undefined) {
      const status = selectedRecord.fieldValues.find(fv => fv.fieldId === statusFieldId)?.value as string | undefined;
      if (status && IMMUTABLE_STATES.has(status)) { showSuccessorModal = true; return; }
    }
    ```
    with:
    ```typescript
    if (allowedTransitions?.isImmutable) { showSuccessorModal = true; return; }
    ```

- [ ] Update `handleLifecycleTransition` (currently ~line 579–595):
  - Replace the entire body with:
    ```typescript
    function handleLifecycleTransition(toState: string) {
      if (!selectedRecord) return;
      try {
        setLifecycleState(repo, selectedRecord.instanceId, toState);
        allowedTransitions = getAllowedLifecycleTransitions(repo, selectedRecord.instanceId);
        loadContainerNav();
        persistWorkingCopy();
      } catch (e: unknown) {
        // errors surface via validate()
      }
    }
    ```

- [ ] Update `handleCreateSuccessor` (currently ~line 597–625):
  - Remove the guard `if (statusFieldId === undefined) return;`.
  - Remove the status field filtering: replace `selectedRecord.fieldValues.filter(fv => fv.fieldId !== statusFieldId)`
    with simply `selectedRecord.fieldValues`.
  - Remove the manual status→"draft" field value: the Rust `createRecordSuccessor` starts the
    successor in the initial lifecycle state (draft) automatically.
  - Pass `fieldValues: selectedRecord.fieldValues` (all field values as-is).

- [ ] Update the template lifecycle transition section (currently ~lines 914–924):
  - Remove: `{@const currentStatus = getStringField(selectedRecord, "status", fieldMetaMap) ?? ""}`
  - Remove: `{@const transitions = LIFECYCLE_TRANSITIONS[currentStatus] ?? []}`
  - Replace the `{#if transitions.length > 0}` block with:
    ```svelte
    {#if allowedTransitions && allowedTransitions.transitions.length > 0}
      <div class="inspector__transitions">
        {#each allowedTransitions.transitions as transition}
          <button
            class="inspector__btn inspector__btn--transition"
            onclick={() => handleLifecycleTransition(transition.to)}
          >
            → {transition.name}
          </button>
        {/each}
      </div>
    {/if}
    ```
  Note: button text changes from `→ {toState}` to `→ {transition.name}` (e.g. "→ propose",
  "→ ratify") which is more meaningful than the raw target state name.

- [ ] Remove `import { LIFECYCLE_TRANSITIONS, IMMUTABLE_STATES } from "$lib/governance/lifecycle.js";`
  (once no longer referenced — do this after replacing all usages above).

- [ ] Remove `import { getStringField, findFieldId } from "$lib/governance/field-utils.js";`
  from GovernanceShell.svelte **only if** neither function has any remaining usage in the file.
  (Search the file for `getStringField` and `findFieldId` before removing.)

- [ ] Remove `const statusFieldId = $derived(findFieldId("status", fieldMetaMap));` (line 143).

#### Acceptance Criteria

- [ ] `npm run typecheck` passes with no errors.
- [ ] `npm run build` succeeds.
- [ ] No import of `LIFECYCLE_TRANSITIONS`, `IMMUTABLE_STATES`, or `statusFieldId` remains in
  `GovernanceShell.svelte`.
- [ ] `handleLifecycleTransition` calls `setLifecycleState` — not `updateRecord`.
- [ ] `handleEditRecord` checks `allowedTransitions?.isImmutable` — not `IMMUTABLE_STATES.has`.
- [ ] `handleCreateSuccessor` does not reference `statusFieldId`.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria above are met.
2. `npm run typecheck` and `npm run build` both pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: drive GovernanceShell lifecycle via WASM (set_lifecycle_state, get_allowed_lifecycle_transitions) (#135)`

---

### Phase 3: Delete lifecycle.ts

**Goal:** `src/lib/governance/lifecycle.ts` is deleted and no file imports from it.

**Agent:** Web App Worker

#### Tasks

- [ ] Grep for any remaining import of `lifecycle.js` or `lifecycle.ts` across `src/`:
  ```bash
  grep -r "governance/lifecycle" src/
  ```
  Expected: zero results after Phase 2.

- [ ] Delete `src/lib/governance/lifecycle.ts`.

- [ ] Run `npm run typecheck` and `npm run build` to confirm no broken imports.

#### Acceptance Criteria

- [ ] `src/lib/governance/lifecycle.ts` does not exist.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds.

#### Testing

```bash
npm run typecheck
npm run build
```

#### Milestone gate

1. File deleted, all checks pass.
2. Commit: `chore: delete lifecycle.ts — LIFECYCLE_TRANSITIONS removed (#135)`

---

### Phase 4: Gallery fixture and e2e tests

**Goal:** `e2e/fixtures/gallery.srsj` supports lifecycle (governance lifecycle definition added,
article type has `lifecycleRef`, article records have `lifecycleState: "ratified"`); e2e lifecycle
tests pass under the governance vocabulary.

**Agent:** Web App Worker

#### Tasks

**4a. Update `e2e/fixtures/gallery.srsj`:**

The fixture uses article records. Article type (`package/types/article-a1142ac3.json`) currently
has no `lifecycleRef`. Add lifecycle support:

- [ ] Add `"lifecycleRef": "3c504040-7920-43aa-8fbd-eda21dc7c07b"` to
  `package/types/article-a1142ac3.json` within the gallery.srsj file (the fixture is a single
  JSON file; edit the nested type object).

- [ ] Add the governance lifecycle definition as
  `package/lifecycles/governancelifecycle-3c504040.json` within gallery.srsj. Use the definition
  from the governance-seed (see Assumptions). The lifecycle object must have:
  ```json
  {
    "lifecycleId": "3c504040-7920-43aa-8fbd-eda21dc7c07b",
    "name": "Governance Lifecycle",
    "states": [
      { "name": "draft", "isInitial": true, "isFinal": false },
      { "name": "proposed", "isInitial": false, "isFinal": false },
      { "name": "ratified", "isInitial": false, "isFinal": false },
      { "name": "closed", "isInitial": false, "isFinal": true },
      { "name": "superseded", "isInitial": false, "isFinal": true }
    ],
    "transitions": [
      { "name": "propose", "from": "draft", "to": "proposed" },
      { "name": "revise", "from": "proposed", "to": "draft" },
      { "name": "ratify", "from": "proposed", "to": "ratified" },
      { "name": "supersede", "from": "ratified", "to": "superseded" },
      { "name": "close", "from": "ratified", "to": "closed" }
    ]
  }
  ```
  Match the exact structure used in other gallery fixture lifecycle entries if any exist;
  otherwise use this structure.

- [ ] Add `"lifecycleState": "ratified"` to each article record in gallery.srsj (these are the
  records under `records/`). Ratified is the governance equivalent of the old "active" state, and
  the fixture should have records in a non-draft state so immutability and transition tests work.

- [ ] Verify the fixture is valid JSON after edits.

**4b. Update `e2e/lifecycle.spec.ts`:**

- [ ] **Test: "draft record transitions"** (currently expects 3 buttons: "→ proposed", "→ active",
  "→ deferred"): Update to expect exactly 1 button: "→ propose" (the only transition from
  `draft` in the governance lifecycle). The button text is now the transition name, not target
  state: `→ propose`.

- [ ] **Test: "clicking transition changes status"** (currently checks card contains "proposed"):
  The card does not necessarily show the lifecycle state as text anymore. Update to verify the
  transition worked by checking the available buttons changed: after clicking "→ propose", the
  page should show "→ revise" and "→ ratify" buttons (proposed state transitions), not "→ propose".

- [ ] **Test: "terminal state no transition buttons"** (currently does 1 transition to reach
  terminal): Update to multi-step through the governance lifecycle:
  1. Create a new record (starts in `draft`).
  2. Click "→ propose" (now in `proposed`).
  3. Click "→ ratify" (now in `ratified`).
  4. Click "→ close" (now in `closed`, which is final — no more transition buttons).
  Verify that the transitions section is absent or empty after step 4.

- [ ] **Test: "ratified record shows successor modal"** (currently "active record shows successor
  modal"): Gallery records are now `ratified` (isImmutable). Update test description and any
  status-specific assertions to use the ratified vocabulary.

- [ ] Leave passing tests unchanged (do not refactor tests that pass without changes).

#### Acceptance Criteria

- [ ] `gallery.srsj` is valid JSON and contains the governance lifecycle definition.
- [ ] Article type in `gallery.srsj` has `lifecycleRef` pointing to the lifecycle.
- [ ] Article records in `gallery.srsj` have `lifecycleState: "ratified"`.
- [ ] `npm run e2e` passes (all lifecycle tests green).
- [ ] `npm run build` still succeeds.

#### Testing

```bash
npm run build
npm run e2e
```

If e2e runner requires the dev server, start it first:
```bash
npm run dev &
sleep 3
npm run e2e
```

#### Milestone gate

1. All acceptance criteria above are met.
2. `npm run e2e` green.
3. Mark completed task checkboxes `[x]`.
4. Commit: `test: update gallery fixture and e2e lifecycle tests for WASM lifecycle (#135)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (unit tests)
- [ ] `npm run e2e` passes (e2e tests)
- [ ] `src/lib/governance/lifecycle.ts` does not exist
- [ ] No import of `LIFECYCLE_TRANSITIONS` or `IMMUTABLE_STATES` anywhere in `src/`
- [ ] No reference to `statusFieldId` in `GovernanceShell.svelte`
- [ ] `GovernanceShell.svelte` imports `getAllowedLifecycleTransitions` and `setLifecycleState`
  from `$lib/srs-client.js`
- [ ] WASM loads and `getAllowedLifecycleTransitions` returns valid result for a gallery record
- [ ] Lifecycle transitions visible and functional in the browser (dogfooding)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The lifecycle graph is owned by the Rust engine.
- `npm run typecheck` must pass after every phase.
- Do not add fallback logic that re-implements transition rules in TS if WASM returns null —
  returning null means "no lifecycle defined", and the correct UX is "no transition buttons shown".

## Assumptions

- `get_allowed_lifecycle_transitions` is available in srs-bindings build 98 (confirmed from
  `src/lib/srs_bindings/srs_bindings.d.ts` line 103).
- `set_lifecycle_state` is available (confirmed from srs-bindings and existing wrapper in srs-client.ts).
- `createRecordSuccessor` in Rust creates the successor with `lifecycleState` set to the
  initial state (draft) automatically — the TS caller does not need to pass it explicitly.
  If this assumption is wrong, `handleCreateSuccessor` will need a follow-up to explicitly
  set the initial lifecycle state after creation.
- The gallery fixture `gallery.srsj` structure allows adding `lifecycleRef` to type entries
  and `lifecycleState` to record entries as top-level fields (following the SRS schema 2.0
  format already used by the fixture's relations and groups).
- E2e tests use Playwright against a running dev server. `npm run e2e` starts the server or
  expects one already running on the configured port.
- `getStringField` and `findFieldId` from `field-utils.ts` are used by other components
  (`DecisionSummaryCard.svelte`, `decision-export-utils.ts`) — only the import in
  `GovernanceShell.svelte` is removed. The `field-utils.ts` file itself is not deleted.
