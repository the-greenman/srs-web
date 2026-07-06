# Plan: List pane from container members + DocumentView field spec (srs-web#94)

## Summary

The generic governance list pane renders each container member through `Card` using
two hardcoded, name-based field lookups (`getStringField(record, "article_number", …)`
and `getStringField(record, "status", …)` in `GovernanceShell.svelte:660-661`). Which
fields appear — and that they appear at all — is decided in TypeScript, per type. This
plan drives the list's columns from the core: `resolveContainerView(containerId)`
(srs-rust#254, already wrapped) returns a `ColumnSpec[]` derived from the container's
governing DocumentView, plus the ordered members and their core-resolved `displayLabel`.
The list renders the title from `displayLabel` and one cell per `ColumnSpec`, reading
each value positionally by the core-provided `fieldId`. This removes the last
name-based field selection from the governance list and completes the "lists = views"
half of epic #92. Because the gallery's `articles-and-roles` DocumentView selects no
fields (no `rootTypeRefs`, no `renderViewId`), the plan also enriches `gallery.srsj` so
Articles/Roles resolve real view-driven columns and the mechanism is demonstrable.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-009](../docs/adr/009-container-driven-nav.md) | Sidebar + list are container-keyed | accepted |
| [ADR-010](../docs/adr/010-view-driven-list-columns.md) | **List-pane columns come from `resolveContainerView().columns`, not name-based `getStringField`** (new — this plan) | proposed |

---

## Contracts

### WASM API surface

**No new or changed WASM binding.** This plan consumes the existing
`resolve_container_view` binding (srs-rust#254, closed), already wrapped as
`resolveContainerView()` in `src/lib/srs-client.ts` (returns `ContainerView` with
`root`, `members: ResolvedMember[]`, `columns: ColumnSpec[]`, `excludeLifecycleStates`,
`diagnostics`).

### TypeScript types

`ContainerView`, `ResolvedMember`, `ColumnSpec` already exist in `srs-client.ts`. No
type changes required.

### Data (gallery.srsj fixture)

`e2e/fixtures/gallery.srsj` is enriched (existing DocumentView/View schema only —
no schema change):
- **New L1 View `governance/articles-list`** — `fieldViews`: Article Number
  (`60be1468-01bc-5d12-9eea-628f02801893`, order 0), Status
  (`aee7afe9-6650-5fa4-a61a-495c3b88994b`, order 1). Both `visible: true`.
- **New L1 View `governance/roles-list`** — `fieldViews`: Role Holder
  (`a6c19b95-4f8f-5b07-93f8-3426c545277e`, order 0), Authority
  (`d25da548-79d6-555b-8878-f40b685b3955`, order 1), Status (`aee7afe9-…`, order 2).
- **`articles-and-roles` DocumentView** gains:
  - `rootTypeRefs`: `[{typeId: a1142ac3-5385-5c0e-8630-1dd3432cdf7f, typeVersion: 1}
    (article), {typeId: e53dce11-6b83-5714-a8fe-f730edb500fa, typeVersion: 1} (role)]`
    — so `document_views_for_container` matches both the Articles and Roles containers.
  - articles section → `renderViewId: <articles-list view id>`.
  - roles section → `renderViewId: <roles-list view id>`.
- Both new view paths registered in `package/package.json` `views[]`.

The two new view UUIDs are fixed constants (chosen for review stability):
`articles-list` = `a11c0000-0000-4000-8000-000000000a01`,
`roles-list` = `a11c0000-0000-4000-8000-000000000a02`.

---

## Scope

**In scope:**

- `src/lib/governance/GovernanceShell.svelte`
  - Resolve `activeContainerView: ContainerView | null` for the active (non-decision)
    container via `resolveContainerView(repo, activeContainerId)`.
  - Generic list branch: render each member with title = `displayLabel` and one cell per
    `activeContainerView.columns`, value read by `col.fieldId`.
  - Remove the `getStringField(record, "article_number", …)` and
    `getStringField(record, "status", …)` lookups from the **list** branch.
  - Title-only rows when `columns` is empty (no fallback to hardcoded fields).
- `Card.svelte` (or a small inline row): present a title plus an ordered set of
  `label: value` column cells. Prefer extending `Card`'s existing `children`/`grid` body
  with a `CardField`-style cell rather than a new component (per the "inline now" decision).
- `e2e/fixtures/gallery.srsj`: the enrichment above (via a scripted edit).
- `docs/adr/010-view-driven-list-columns.md` (new, this plan).
- Unit/e2e coverage: assert the Articles list shows the view's columns (Article Number,
  Status) sourced from `ColumnSpec`, and that Decision Log is unchanged.

**Out of scope:**

- The Decision Log path (`DecisionLogView`) — it is a `TYPE_REGISTRY` custom detail
  component and stays as-is; unifying it under the container/root model is #95.
- Applying the DocumentView's authored `ordering` to members (Articles by
  `article_number`) — core-ordering follow-up (see Assumptions).
- Extracting a shared `ContainerMemberList` component — deferred to #137.
- Mirroring the gallery enrichment into the canonical `srs` gallery — follow-up issue.
- Removing `getStringField`/`getFieldValue` — still used by inspector + decision path.

---

## Phases

### Phase 1: Enrich gallery.srsj so Articles/Roles resolve view columns

**Goal:** `resolveContainerView(articlesContainer)` and `resolveContainerView(rolesContainer)`
return non-empty `columns` against the gallery fixture.

**Agent:** Web App Worker

#### Tasks

- [ ] Write a one-shot Python script (kept in scratchpad, not committed) that edits the
      `data` map of `e2e/fixtures/gallery.srsj` (values are JSON objects, not strings):
  - Add `data["package/views/articles-list-a11c0000.json"]` =
    ```json
    { "id": "a11c0000-0000-4000-8000-000000000a01", "namespace": "governance",
      "name": "articles-list", "version": 1,
      "description": "Compact article list — number and status.",
      "createdAt": "2026-07-06T00:00:00Z",
      "fieldViews": [
        { "fieldId": "60be1468-01bc-5d12-9eea-628f02801893", "displayLabel": "Article №", "order": 0, "required": false, "visible": true },
        { "fieldId": "aee7afe9-6650-5fa4-a61a-495c3b88994b", "displayLabel": "Status",    "order": 1, "required": true,  "visible": true }
      ] }
    ```
  - Add `data["package/views/roles-list-a11c0000.json"]` =
    ```json
    { "id": "a11c0000-0000-4000-8000-000000000a02", "namespace": "governance",
      "name": "roles-list", "version": 1,
      "description": "Compact role list — holder, authority, status.",
      "createdAt": "2026-07-06T00:00:00Z",
      "fieldViews": [
        { "fieldId": "a6c19b95-4f8f-5b07-93f8-3426c545277e", "displayLabel": "Role Holder", "order": 0, "required": false, "visible": true },
        { "fieldId": "d25da548-79d6-555b-8878-f40b685b3955", "displayLabel": "Authority",   "order": 1, "required": true,  "visible": true },
        { "fieldId": "aee7afe9-6650-5fa4-a61a-495c3b88994b", "displayLabel": "Status",      "order": 2, "required": true,  "visible": true }
      ] }
    ```
  - Append both paths to `data["package/package.json"].views` (keep existing
    `views/decision-log-faebd240.json`).
  - In `data["package/document-views/articles-and-roles-78b11038.json"]`: add
    `rootTypeRefs = [ {"typeId":"a1142ac3-5385-5c0e-8630-1dd3432cdf7f","typeVersion":1},
    {"typeId":"e53dce11-6b83-5714-a8fe-f730edb500fa","typeVersion":1} ]`; set the
    articles section (`sectionId: "articles"`) `renderViewId =
    "a11c0000-0000-4000-8000-000000000a01"` and the roles section (`sectionId: "roles"`)
    `renderViewId = "a11c0000-0000-4000-8000-000000000a02"`.
- [ ] Re-serialise with `json.dump(obj, f, indent=<match existing>, ensure_ascii=False)`;
      inspect `git diff` to confirm only the intended additions appear.
- [ ] Confirm `document_views_for_container` will match: the Articles container root
      (`ad159754…`) is an `article` record (typeId `a1142ac3…` v1) and the Roles container
      root (`5bbf9209…`) is a `role` record (typeId `e53dce11…` v1) — both covered by the
      new `rootTypeRefs`.

#### Acceptance Criteria

- [ ] `git diff e2e/fixtures/gallery.srsj` shows only the intended additions.
- [ ] Bundle still parses as JSON; instance/record counts unchanged.
- [ ] Unit test: loading the enriched fixture, `resolveContainerView(repo, articlesContainerId)`
      returns `documentViewId` set and `columns.length === 2` with fieldIds
      `[60be1468…, aee7afe9…]` in order; Roles returns `columns.length === 3`.

#### Milestone gate

Commit: `feat(gallery): enrich articles-and-roles view with rootTypeRefs + L1 field views (#94)`

---

### Phase 2: Drive the governance list columns from resolveContainerView

**Goal:** The generic list pane renders view-driven columns; no name-based field lookup
remains in the list branch.

**Agent:** Web App Worker

- [ ] Add `resolveContainerView` to the `$lib/srs-client.js` value import and
      `ContainerView` to the type import in `GovernanceShell.svelte`. Import `CardField`
      (from `$lib/components/index.js`) and `FieldValueView`
      (`$lib/rendering/FieldValueView.svelte`).
- [ ] Add `activeContainerView = $derived(...)` in `GovernanceShell.svelte` that, **only
      when a container is active and it is not the Decision path**
      (`activeContainer?.rootTypeId !== DECISION_TYPE_ID`), calls
      `resolveContainerView(repo, activeContainerId)`; otherwise `null`. `console.warn`
      when `view.diagnostics.length > 0`. Skipping the decision path avoids a wasted WASM
      round-trip (arch review #8).
- [ ] Add a derived `activeColumns = $derived([...(activeContainerView?.columns ?? [])].sort((a,b) => a.order - b.order))`.
- [ ] In the generic list `{#each activeRecords ...}` branch, render each row as:
      `<Card title={record.displayLabel ?? record.instanceId}>` with a `children` snippet
      that does `{#each activeColumns as col}<CardField label={col.displayLabel}
      empty={value === undefined || value === null || value === ""}>
      <FieldValueView fv={{ fieldId: col.fieldId, value }} /></CardField>{/each}`, where
      `value = record.fieldValues.find(fv => fv.fieldId === col.fieldId)?.value`. Use
      `grid` on the Card for compactness. Empty `activeColumns` → title-only card. Do not
      thread `col.required` into the list cell (keep rows compact — arch review #3).
- [ ] Remove the `getStringField(record, "article_number", …)` and
      `getStringField(record, "status", …)` `{@const}`s from the **list** branch only.
      Keep the `getStringField` import (still used by the inspector `status`/lifecycle).
- [ ] Do **not** extract a shared component, refactor shared state, or touch the Decision
      path or GuidesShell — #137 covers convergence.

#### Acceptance Criteria

- [ ] Articles list rows show Article № + Status cells sourced from `ColumnSpec` (order 0,1).
- [ ] Roles list rows show Role Holder + Authority + Status cells from `ColumnSpec`.
- [ ] A record missing a column's `fieldId` renders the cell with its label and the
      `CardField` empty placeholder (no crash, no `undefined` text).
- [ ] Row titles use `displayLabel` (core). No `getStringField(..., "title", ...)` and no
      `getStringField(..., "article_number"/"status", ...)` in the list branch.
- [ ] Decision Log section renders exactly as before (DecisionLogView); `resolveContainerView`
      is not called for it.
- [ ] Removing an entry from `TYPE_REGISTRY` changes only its icon/custom view, not the
      list columns (spot-check reasoning; icon still resolves via registry).
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` pass.

#### Milestone gate

Commit: `feat(governance): drive list columns from resolveContainerView column spec (#94)`

---

### Phase 3: Tests + dogfood the flow

**Goal:** Automated coverage proves the list is view-driven; the app renders it end-to-end.

**Agent:** Verification Agent

#### Tasks

- [ ] Add/extend a unit test (`tests/`) that loads the enriched gallery, calls
      `resolveContainerView` for the Articles container, and asserts `columns` field IDs +
      order match the `articles-list` view.
- [ ] Add/extend an e2e assertion (Playwright, `e2e/`) that the Articles list renders the
      Article Number + Status column cells; confirm Decision Log flow specs still pass.
- [ ] Dogfood: `npm run build` + drive the app on `gallery.srsj`, select Articles, confirm
      the view-driven columns render and selection/edit still works.

#### Acceptance Criteria

- [ ] New unit test passes; existing e2e suite green.
- [ ] Manual/Playwright confirmation of view-driven Articles columns.

#### Milestone gate

Commit: `test(governance): cover view-driven list columns (#94)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (incl. new column-spec test)
- [ ] e2e suite passes against enriched `gallery.srsj`
- [ ] `resolveContainerView()` returns non-empty `columns` for the Articles and Roles
      containers against the enriched `gallery.srsj` (asserted by unit test)
- [ ] No name-based field selection (`getStringField(record, "article_number"/"status"/"title", …)`)
      remains in the `GovernanceShell` list branch
- [ ] ADR-010 status flipped `proposed → accepted` when the change ships

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001): columns and labels come from the core; the
  client only reads values at core-provided `fieldId`s and renders them.
- The Decision Log custom-view path is untouched (that is #95).

## Assumptions

- `resolve_container_view` returns `members` in core member order (not the DocumentView's
  authored `ordering`). Applying authored field-ordering is a **deferred follow-up**
  (file in Stage 3), analogous to srs-web#122 (precedes ordering).
- The canonical `srs` gallery will be enriched to match via a **deferred follow-up**
  (file in Stage 3); until then the srs-web e2e fixture carries the enrichment.
- srs-rust#254 is merged and the WASM binary in `srs-web` exposes `resolve_container_view`.
