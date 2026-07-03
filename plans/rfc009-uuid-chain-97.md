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
| [ADR-004](../docs/adr/004-blueprint-view-convention-join.md) | String-convention join — superseded by this plan | superseded by ADR-008 |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | Dynamic section dispatch via typeId | accepted |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | Unified TYPE_REGISTRY | accepted |
| ADR-008 (new) | UUID-chain join replaces containerType string matching | proposed |

---

## Contracts

### WASM API surface

**No new WASM methods required.** The existing WASM API already provides:
- `DocumentViewSummary.rootTypeRefs?: ExactTypeRef[]` — returned by `list_document_views`
- `ContainerListFilter.rootInstanceId?: string` — already in `listContainers()`
- `DocumentViewListFilter` — will have `rootTypeId?: string` added to the TS wrapper only (no
  new WASM binding — the WASM `list_document_views` already accepts this filter field per
  srs-rust lib.rs:268-272)

### TypeScript types

`src/lib/srs-client.ts`:
- `DocumentViewListFilter`: add `rootTypeId?: string` (exposes existing WASM capability).
- No other TS type changes required.

---

## Scope

**In scope:**
- `src/lib/discovery.ts`: change `documentViewsForBlueprint(blueprint, views)` to
  `documentViewsForBlueprint(rootTypeId: string, views)` using
  `view.rootTypeRefs?.some(r => r.typeId === rootTypeId) ?? false`.
- `src/lib/srs-client.ts`: add `rootTypeId?: string` to `DocumentViewListFilter`.
- `src/lib/guides/GuidesShell.svelte`: call `blueprintSchema()` before view discovery, pass
  `rootId` from `rootTypeId(schema)` to `documentViewsForBlueprint()`.
- `src/lib/governance/GovernanceShell.svelte`: replace `listContainers({ containerType })` with
  UUID-chain lookup via `dynamicSections` + `sectionRecords`.
- `src/lib/governance/type-registry.ts`: add `DECISION_LOG_TYPE_NAMESPACE = "governance"` and
  `DECISION_LOG_TYPE_NAME = "decision_log"` constants; keep `DECISION_LOG_CONTAINER_TYPE` for
  any callers outside GovernanceShell (remove import from GovernanceShell only).
- `e2e/fixtures/muSrs.srsj`: add `rootTypeRefs` to the guide document view
  (`guide-body-view-2aba4d85.json`).
- `tests/discovery.test.ts`: update all tests for the new `documentViewsForBlueprint` signature.
- `docs/adr/004-blueprint-view-convention-join.md`: update status to "Superseded by ADR-008".
- `docs/adr/008-rfc009-uuid-chain-join.md`: new ADR.

**Out of scope:**
- Adding `rootTypes: ExactTypeRef[]` to `BlueprintSummary` (requires srs-rust change; deferred).
- Removing `DECISION_LOG_CONTAINER_TYPE` constant entirely (may be used in tests or future code).
- Migrating `gallery.srsj` (has no decision-log container or guide document views; no change
  needed).
- Any change to `sections.ts` (already clean — no containerType usage).
- Container filter by `rootTypeId` directly (not in scope; current approach via
  `rootInstanceId` is sufficient).

---

## Phases

### Phase 1: Fix discovery.ts, GuidesShell.svelte, muSrs fixture, and tests

**Goal:** `documentViewsForBlueprint` uses UUID-chain join; fixture has `rootTypeRefs`; all tests pass.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/srs-client.ts`, add `rootTypeId?: string` to `DocumentViewListFilter`.
- [ ] In `src/lib/discovery.ts`:
  - Change function signature from `documentViewsForBlueprint(blueprint: BlueprintSummary, views: DocumentViewSummary[])` to `documentViewsForBlueprint(rootTypeId: string, views: DocumentViewSummary[])`.
  - Change filter logic from `v.namespace === blueprint.namespace && v.containerType === blueprint.name` to `v.rootTypeRefs?.some((r) => r.typeId === rootTypeId) ?? false`.
  - Remove `BlueprintSummary` import if no longer used.
  - Update the JSDoc comment to reference ADR-008 (UUID-chain join) instead of ADR-004.
- [ ] In `src/lib/guides/GuidesShell.svelte`:
  - In the `onMount()` boot sequence (around line 281), reorder operations:
    1. Call `listBlueprints()` and `findBlueprint()` as before.
    2. Call `blueprintSchema(repo, blueprint.id)` **first** (moved up from its current position after view discovery).
    3. Derive `rootId = rootTypeId(schema)` from the schema result.
    4. Call `const views = documentViewsForBlueprint(rootId ?? "", allViews).sort(...)`.
    5. Continue with the rest of the mount logic (sectionTypeList, guideTypeId, etc.) exactly as before.
  - Guard: if `rootId` is null after `blueprintSchema()`, set `schemaError` and return early.
- [ ] In `e2e/fixtures/muSrs.srsj`, add `rootTypeRefs` to the guide document view:
  - File: `package/document-views/guide-body-view-2aba4d85.json`
  - Add field: `"rootTypeRefs": [{ "typeId": "8f138dd6-11d2-42a5-99ec-3d6e23bed54f", "typeVersion": 1 }]`
  - The guide type UUID `8f138dd6-11d2-42a5-99ec-3d6e23bed54f` is confirmed from the muSrs.srsj
    types section (version 1, namespace com.mudemocracy).
- [ ] In `tests/discovery.test.ts`:
  - Update all calls to `documentViewsForBlueprint(blueprint, views)` to `documentViewsForBlueprint(rootTypeId, views)` using a string UUID as the first arg.
  - Update fixture `DocumentViewSummary` objects: replace `containerType` with `rootTypeRefs: [{ typeId: "...", typeVersion: 1 }]` where applicable.
  - Add a test for the negative case: a view with no `rootTypeRefs` returns false (not matched).

#### Acceptance Criteria

- [ ] `documentViewsForBlueprint("8f138dd6-...", [viewWithRootTypeRef])` returns the view.
- [ ] `documentViewsForBlueprint("8f138dd6-...", [viewWithNoRootTypeRefs])` returns empty array.
- [ ] `GuidesShell.svelte` compiles without type errors.
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
4. Commit with message `fix: UUID-chain join in documentViewsForBlueprint (#97)`.

Do not start Phase 2 until the milestone gate passes.

---

### Phase 2: GovernanceShell containerType fix

**Goal:** GovernanceShell resolves the decision-log container via the UUID chain through
`dynamicSections` and `sectionRecords`, eliminating the `containerType: "decision-log"` string join.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/governance/type-registry.ts`:
  - Add `export const DECISION_LOG_TYPE_NAMESPACE = "governance";`
  - Add `export const DECISION_LOG_TYPE_NAME = "decision_log";`
  - Keep `DECISION_LOG_CONTAINER_TYPE` unchanged (do not remove — may be referenced elsewhere).
- [ ] In `src/lib/governance/GovernanceShell.svelte`:
  - Update the import from `type-registry.js` to include the two new constants.
  - Remove `DECISION_LOG_CONTAINER_TYPE` from the import.
  - Replace lines 217-223 (`const containers = listContainers(repo, { containerType: ... })`)
    with UUID-chain lookup:
    ```ts
    const dlSection = dynamicSections.find(
      (s) => s.typeName === DECISION_LOG_TYPE_NAME && s.typeNamespace === DECISION_LOG_TYPE_NAMESPACE
    );
    if (dlSection) {
      const dlRecords = sectionRecords[dlSection.typeId] ?? [];
      const rootRecord = dlRecords[0];
      if (rootRecord) {
        try {
          const containers = listContainers(repo, { rootInstanceId: rootRecord.instanceId });
          decisionLogContainerId = containers[0]?.containerId ?? null;
        } catch (e: unknown) {
          console.error("listContainers failed in onMount:", e);
          decisionLogContainerId = null;
        }
      }
    }
    ```
  - Note: this code runs after `loadSectionRecords()` has synchronously populated
    `dynamicSections` and `sectionRecords`. No async concerns.
  - If `dlSection` is not found or `dlRecords` is empty, `decisionLogContainerId` remains
    `null` (correct: no decision-log container exists in this repo, as is the case for gallery).

#### Acceptance Criteria

- [ ] No TypeScript error on the import or usage.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes (no regressions in GovernanceShell-related tests).

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

### Phase 3: ADR updates

**Goal:** ADR-004 is marked superseded; ADR-008 documents the new UUID-chain join decision.

**Agent:** Web App Worker

#### Tasks

- [ ] In `docs/adr/004-blueprint-view-convention-join.md`:
  - Change `**Status:** Accepted` to `**Status:** Superseded by [ADR-008](008-rfc009-uuid-chain-join.md)`.
- [ ] Create `docs/adr/008-rfc009-uuid-chain-join.md` using existing ADRs as template. Document:
  - Context: ADR-004 used string-convention join (containerType === blueprint.name); RFC-009
    marks containerType as "hint only"; UUID chain is authoritative.
  - Decision: `documentViewsForBlueprint(rootTypeId, views)` uses
    `view.rootTypeRefs?.some(r => r.typeId === rootTypeId) ?? false`.
    GovernanceShell resolves decision-log container via `dynamicSections` → `sectionRecords` →
    `rootInstanceId`.
  - Consequences: ADR-001 compliant; requires `rootTypeRefs` to be present on document view
    fixtures; string `containerType` on views/containers becomes unused for discovery.
  - Alternatives rejected: keeping ADR-004 string join; adding `rootTypes` to BlueprintSummary
    (requires srs-rust change, deferred).
  - Status: accepted.

#### Acceptance Criteria

- [ ] ADR-004 status field reads "Superseded by ADR-008".
- [ ] ADR-008 file exists with status "accepted".
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Commit with message `docs: ADR-008 UUID-chain join, supersede ADR-004 (#97)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes (GuidesShell guide-body-view discovered via rootTypeRefs in muSrs fixture)
- [ ] `documentViewsForBlueprint` signature uses `rootTypeId: string` (not `BlueprintSummary`)
- [ ] No `containerType` string used for join logic in `discovery.ts` or `GovernanceShell.svelte`
- [ ] ADR-008 exists and ADR-004 is marked superseded

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The UUID join is presentation-layer filtering of
  WASM-returned metadata, not semantic logic.
- Lead Integrator confirms GuidesShell boot-sequence reorder doesn't break the `schemaError`
  early-return guard before Phase 1 ships.

## Assumptions

- The guide type UUID `8f138dd6-11d2-42a5-99ec-3d6e23bed54f` (version 1) is correct per
  the muSrs.srsj types section.
- The WASM `list_document_views` already accepts `rootTypeId` in its filter JSON (confirmed
  in srs-rust lib.rs:268-272) — no new srs-rust work needed.
- `ContainerListFilter.rootInstanceId` is already wired in `listContainers()` (confirmed in
  srs-client.ts:567-578).
- `dynamicSections` and `sectionRecords` are synchronously populated by `loadSectionRecords()`
  before the container-discovery block runs in `onMount()`.
- The gallery.srsj e2e fixture needs no changes: it has no decision-log containers and no guide
  document views.
