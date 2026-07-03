# Plan: RFC-009 UUID-chain join replaces containerType string matching (#97)

## Summary

`documentViewsForBlueprint()` in `src/lib/discovery.ts` pairs blueprint↔views by string-matching
`view.containerType === blueprint.name` (ADR-004). `GovernanceShell.svelte` discovers the
decision-log container via `listContainers(repo, { containerType: "decision-log" })`. Both rely
on a `containerType` string that RFC-009 marks as "hint only": the authoritative join is the UUID
chain `Container.rootInstanceIds → Record.typeId → DocumentView.rootTypeRefs`. This plan removes
both violations and fixes the `muSrs.srsj` fixture which is missing `rootTypeRefs` on the guide
document view. `sections.ts` was already clean (no `containerType` usage). No new WASM binding
required — `DocumentViewSummary.rootTypeRefs` and `ContainerListFilter.rootInstanceId` are
already in the WASM API.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Web App Worker |
| Web App Worker | Web App Worker |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | Blueprint schema drives the composite editor; document views drive rendered output | accepted |
| [ADR-004](../docs/adr/004-blueprint-view-convention-join.md) | String-convention join — superseded by this plan | superseded by ADR-008 |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | Dynamic section dispatch via typeId | accepted |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | Unified TYPE_REGISTRY | accepted |
| [ADR-008](../docs/adr/008-rfc009-uuid-chain-join.md) | UUID-chain join replaces containerType string matching | accepted |

---

## Contracts

### WASM API surface

**No new WASM methods required.** The existing WASM API already provides:
- `DocumentViewSummary.rootTypeRefs?: ExactTypeRef[]` — returned by `list_document_views`
- `ContainerListFilter.rootInstanceId?: string` — already in `listContainers()`

**`DocumentViewListFilter`** — no change needed. This plan uses the in-memory filter in
`documentViewsForBlueprint()` rather than WASM-level filtering by `rootTypeId` (see ADR-008
Alternatives Rejected).

### TypeScript types

No new TS types required. `ExactTypeRef` is already exported from `srs-client.ts`.

---

## Scope

**In scope:**
- `src/lib/discovery.ts`: change `documentViewsForBlueprint(blueprint, views)` to
  `documentViewsForBlueprint(rootTypeId: string, views)` using
  `view.rootTypeRefs?.some(r => r.typeId === rootTypeId) ?? false`.
- `src/lib/guides/GuidesShell.svelte`: move `blueprintSchema()` call before view discovery in
  the `onMount()` boot sequence; pass `rootId` from `rootTypeId(schema)` to
  `documentViewsForBlueprint()`; early-return with `schemaError` if `rootId` is null.
- `src/lib/governance/GovernanceShell.svelte`: replace
  `listContainers({ containerType: DECISION_LOG_CONTAINER_TYPE })` with an iteration over
  `sectionRecords[DECISION_TYPE_ID]` using `listContainers({ rootInstanceId })` to find the
  container whose root is a decision record (UUID-chain, no string matching).
- `e2e/fixtures/muSrs.srsj`: add `rootTypeRefs` to the guide document view entry
  (`package/document-views/guide-body-view-2aba4d85.json`).
- `tests/discovery.test.ts`: update all tests for the new `documentViewsForBlueprint` signature;
  update the `dv()` helper to accept `rootTypeRefs?: ExactTypeRef[]` instead of `containerType`.
- `docs/adr/004-blueprint-view-convention-join.md`: already updated (status: Superseded by ADR-008).
- `docs/adr/008-rfc009-uuid-chain-join.md`: already exists (status: Accepted).

**Out of scope:**
- Adding `rootTypeId?: string` to `DocumentViewListFilter` in `srs-client.ts` (unused; WASM
  already supports it, but this plan uses in-memory filtering — see ADR-008 Alternatives Rejected).
- Adding `rootTypes: ExactTypeRef[]` to `BlueprintSummary` (requires srs-rust change; deferred).
- Migrating `gallery.srsj` (all containers use `containerType: "document"`, no guide document views).
- Any change to `sections.ts` (already clean — no containerType usage).

---

## Phases

### Phase 1: Fix discovery.ts, GuidesShell.svelte, muSrs fixture, and tests

**Goal:** `documentViewsForBlueprint` uses UUID-chain join; GuidesShell boots via `blueprintSchema()`
first; fixture has `rootTypeRefs`; all tests pass.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/discovery.ts`:
  - Remove `BlueprintSummary` import.
  - Change function signature: `documentViewsForBlueprint(blueprint: BlueprintSummary, views: DocumentViewSummary[])` → `documentViewsForBlueprint(rootTypeId: string, views: DocumentViewSummary[])`.
  - Change filter body: `v.namespace === blueprint.namespace && v.containerType === blueprint.name` → `v.rootTypeRefs?.some((r) => r.typeId === rootTypeId) ?? false`.
  - Update JSDoc: reference ADR-008 UUID-chain join instead of ADR-004 string-convention join.

- [ ] In `src/lib/guides/GuidesShell.svelte`, in the `onMount()` boot sequence (around line 281),
  reorder as follows:
  1. Call `listBlueprints()` and `findBlueprint()` as before to get `blueprint`.
  2. Early-return with `schemaError` if `!blueprint`.
  3. Immediately call `blueprintSchema(repo, blueprint.id)` (moved up from its current position
     after view discovery at line 301).
  4. If `result.diagnostics.length > 0`, set `schemaError` and return.
  5. Derive `const rootId = rootTypeId(schema)` from the schema result.
  6. If `!rootId`, set `schemaError = "Blueprint schema has no root type"` and return.
  7. Load views: `const allViews = listDocumentViews(repo)`.
  8. Call `const views = documentViewsForBlueprint(rootId, allViews).sort((a, b) => a.name.localeCompare(b.name))`.
  9. Continue with the rest of the mount logic (sectionTypeList, guideTypeId, fields, etc.)
     exactly as before — note that `rootId` is already derived, so the existing `const rootId = rootTypeId(schema)` line (originally at line 307) is removed (it was already computed in step 5).

  **Invariant:** do NOT pass `rootId ?? ""` — if `rootId` is null, return early (step 6 above).

- [ ] In `e2e/fixtures/muSrs.srsj`, locate the key
  `package/document-views/guide-body-view-2aba4d85.json` and add `rootTypeRefs`:
  ```json
  "rootTypeRefs": [
    { "typeId": "8f138dd6-11d2-42a5-99ec-3d6e23bed54f", "typeVersion": 1 }
  ]
  ```
  The guide type UUID `8f138dd6-11d2-42a5-99ec-3d6e23bed54f` (version 1, namespace
  `com.mudemocracy`) is confirmed from the muSrs.srsj types section.

- [ ] In `tests/discovery.test.ts`:
  - Update the `dv()` helper (around line 28-43): replace the `containerType?: string` parameter
    with `rootTypeRefs?: ExactTypeRef[]` and update the returned object accordingly. Import
    `ExactTypeRef` from `$lib/srs-client.js` if not already imported.
  - Update all `dv()` call sites: replace `containerType: "..."` arguments with
    `rootTypeRefs: [{ typeId: "...", typeVersion: 1 }]`.
  - Update all calls to `documentViewsForBlueprint(blueprint, views)` to
    `documentViewsForBlueprint(rootTypeId, views)` where `rootTypeId` is a string UUID.
  - Ensure these test cases are covered:
    - A view with `rootTypeRefs: [{ typeId: TARGET_UUID, typeVersion: 1 }]` IS returned.
    - A view with `rootTypeRefs: []` (empty) is NOT returned.
    - A view with `rootTypeRefs: [{ typeId: OTHER_UUID, typeVersion: 1 }]` is NOT returned.
    - A view with no `rootTypeRefs` field (`undefined`) is NOT returned.

#### Acceptance Criteria

- [ ] `documentViewsForBlueprint("8f138dd6-11d2-42a5-99ec-3d6e23bed54f", [{ id: "v1", namespace: "com.mudemocracy", name: "guide-body-view", version: 1, description: "", rootTypeRefs: [{ typeId: "8f138dd6-11d2-42a5-99ec-3d6e23bed54f", typeVersion: 1 }] }])` returns that view.
- [ ] `documentViewsForBlueprint("8f138dd6-11d2-42a5-99ec-3d6e23bed54f", [{ id: "v2", namespace: "com.mudemocracy", name: "other-view", version: 1, description: "" }])` returns empty array (no `rootTypeRefs`).
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] Lead Integrator confirms the GuidesShell boot sequence: `blueprintSchema()` is called before view discovery; `rootId === null` returns early with `schemaError`; the existing "no views found" schemaError branch (lines 297-299 pre-edit) remains reachable when `rootId` is valid but no matching views exist.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met, including the Lead Integrator boot-sequence sign-off.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit with message `fix: UUID-chain join in documentViewsForBlueprint (#97)`.

Do not start Phase 2 until the milestone gate passes.

---

### Phase 2: GovernanceShell containerType fix

**Goal:** GovernanceShell resolves the decision-log container via the UUID chain through
`sectionRecords[DECISION_TYPE_ID]` and `listContainers({ rootInstanceId })`, eliminating the
`containerType: "decision-log"` string join.

**Agent:** Web App Worker

**Key insight from fixture analysis:** the decision-log container's root record is a `decision`
type record (`typeId === DECISION_TYPE_ID`), confirmed in gallery.srsj container
`138e2fac-6a8a-4a06-9511-5aefd99ceae9`. Therefore `DECISION_TYPE_ID` is the correct key for
`sectionRecords` — no new constant needed, consistent with ADR-006 typeId-keyed dispatch.

#### Tasks

- [ ] In `src/lib/governance/GovernanceShell.svelte`:
  - Remove `DECISION_LOG_CONTAINER_TYPE` from the import on line 49.
  - Replace lines 217-223 (the `listContainers({ containerType: ... })` block) with:
    ```ts
    try {
      const dlRecords = sectionRecords[DECISION_TYPE_ID] ?? [];
      for (const record of dlRecords) {
        const containers = listContainers(repo, { rootInstanceId: record.instanceId });
        if (containers.length > 0) {
          decisionLogContainerId = containers[0].containerId;
          break;
        }
      }
    } catch (e: unknown) {
      console.error("decision-log container discovery failed:", e);
      decisionLogContainerId = null;
    }
    ```
  - `DECISION_TYPE_ID` is already imported from `type-registry.js` (line 49). No import change
    needed for it.
  - This code runs after `loadSectionRecords()` has synchronously populated `sectionRecords`.
    If no decision record is a container root, `decisionLogContainerId` remains `null` (correct
    for repos without a decision-log container, e.g. gallery).

- [ ] In `src/lib/governance/type-registry.ts`:
  - Remove the `DECISION_LOG_CONTAINER_TYPE` export if it is no longer referenced by any callers
    after the GovernanceShell import is removed. Check with `grep -r DECISION_LOG_CONTAINER_TYPE src/`.
  - If still referenced elsewhere, leave it in place.

- [ ] Add a unit test or note its coverage: the `sectionRecords[DECISION_TYPE_ID]` → `rootInstanceId`
  path is exercised by any e2e test that loads gallery.srsj and performs a decision-log lookup.
  Verify by checking `e2e/decision-flow.spec.ts` or equivalent. If no such test touches this
  path explicitly, add a comment in GovernanceShell: `// tested via e2e/decision-flow.spec.ts`.

#### Acceptance Criteria

- [ ] No TypeScript error on import or usage.
- [ ] `DECISION_LOG_CONTAINER_TYPE` either removed (if unused) or kept (if still referenced).
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.

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
4. Commit with message `fix: resolve decision-log container via UUID chain (#97)`.

Do not start Phase 3 until the milestone gate passes.

---

### Phase 3: Verify ADR state and final commit

**Goal:** ADR-004 is confirmed superseded; ADR-008 is confirmed present and accepted; any doc
updates are committed.

**Note:** ADR-008 was authored and ADR-004 was updated during Stage 2 of the pipeline and are
already committed. This phase verifies correctness and commits any remaining doc updates.

**Agent:** Web App Worker

#### Tasks

- [ ] Verify `docs/adr/004-blueprint-view-convention-join.md` status reads "Superseded by ADR-008".
- [ ] Verify `docs/adr/008-rfc009-uuid-chain-join.md` exists with status "Accepted".
- [ ] If any prose in ADR-008 is now incorrect after Phase 1/2 changes (e.g. the GovernanceShell
  approach description), update it.
- [ ] Run `npm run typecheck` as a final gate.

#### Acceptance Criteria

- [ ] ADR-004 status field reads "Superseded by ADR-008".
- [ ] ADR-008 file exists with status "Accepted".
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Commit any ADR prose updates: `docs: verify ADR state for RFC-009 UUID-chain fix (#97)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes (GuidesShell guide-body-view discovered via rootTypeRefs in muSrs fixture)
- [ ] `documentViewsForBlueprint` signature uses `rootTypeId: string` (not `BlueprintSummary`)
- [ ] No `containerType` string used for join logic in `discovery.ts` or `GovernanceShell.svelte`
- [ ] ADR-008 exists (status: Accepted); ADR-004 is marked superseded

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The UUID join is presentation-layer filtering of
  WASM-returned metadata, not semantic logic.
- GuidesShell boot-sequence reorder: `blueprintSchema()` is moved before view discovery.
  The "no views found" schemaError branch must remain reachable when `rootId` is valid.
  Lead Integrator sign-off required in Phase 1 milestone gate.

## Assumptions

- The guide type UUID `8f138dd6-11d2-42a5-99ec-3d6e23bed54f` (version 1) is correct per
  the muSrs.srsj types section.
- The decision-log container's root record has `typeId === DECISION_TYPE_ID` (`1fcad6a2-...`),
  confirmed from gallery.srsj container `138e2fac-6a8a-4a06-9511-5aefd99ceae9`.
- `sectionRecords` and `dynamicSections` are synchronously populated by `loadSectionRecords()`
  before the container-discovery block runs in `onMount()`.
- The gallery.srsj e2e fixture needs no changes: containers use `containerType: "document"`,
  no guide document views are present.
- Phase 3 is a verification pass: ADR-008 and ADR-004 updates were committed in Stage 2.
