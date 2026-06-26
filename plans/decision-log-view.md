# Plan: Decision Log View — srs-web#56

> **Tracked issue:** [srs-web#56](https://github.com/the-greenman/srs-web/issues/56)

## Summary

The governance editor's Decision Log section currently renders decisions as generic `Card`
components in a `.record-list` grid. This plan replaces that with a `DecisionLogView` that uses
`LogTable.svelte` rows + a new `DecisionSummaryCard.svelte` component, showing the four-question
decision summary at a glance with click-to-detail. No new WASM bindings are required —
`documentViewsForContainer`, `containersForInstance`, and `listDocumentViews` already ship in
srs-web#52. No spec changes needed. The container-scoped dispatch mechanism is deferred to
srs-web#54 (dynamic dispatch); this plan builds the presentation layer.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude (this pipeline) |
| Web App Worker | Phase 1, 2, 3 |
| Verification | Phase 4 |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TS — all field reads via `getStringField`/`getStringField` helpers, no UUID hardcoding beyond `field-utils.ts` stable map | accepted |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | Views render from field metadata, not hardcoded type schemas | accepted |
| [ADR-004](../docs/adr/004-blueprint-view-convention-join.md) | Blueprint↔view discovery via string-convention join — not used in this plan (container dispatch deferred to srs-web#54) | accepted |

**No new ADR required.** The field ID constants stay in `field-utils.ts` (the stable source). The
`DecisionSummaryCard` is a presentational component reading values via `getStringField`; no new
semantic contracts are introduced.

---

## Contracts

### WASM API surface

**No new WASM bindings required.** All needed bindings (`documentViewsForContainer`,
`containersForInstance`, `listDocumentViews`, `listRecords`) are already available
in `src/lib/srs-client.ts` (shipped in srs-web#52 + srs-web#43).

Data loading uses the existing `listRecords(repo, { typeNamespace: "governance", typeName: "decision" })` call already in `App.svelte`. No changes to WASM or srs-rust.

### TypeScript types

No new types beyond `SrsRecord` (already in `srs-client.ts`) and `Status` (already in `types.ts`).
`DecisionSummaryCard` accepts `SrsRecord`; reads field values via `getStringField` from
`src/lib/governance/field-utils.ts`.

---

## Scope

- New `src/lib/components/DecisionSummaryCard.svelte` — `<tr>` row component for LogTable
- New `src/lib/components/DecisionLogView.svelte` — view wrapping LogTable + DecisionSummaryCard rows
- Export both from `src/lib/components/index.ts`
- Update `App.svelte` to use `DecisionLogView` for the "decisions" section (replacing the generic `.record-list` grid)
- New Playwright assertions in `e2e/gallery.spec.ts` verifying card content

**Out of scope:**
- Container-scoped dispatch via `documentViewsForContainer` (srs-web#54)
- Sort/filter by date or topic (srs-web#57)
- Hide superseded/abandoned toggle (srs-web#58)
- Keyword search (srs-web#59)
- The container `138e2fac` in the gallery has `containerType: "document"` and RFC-009 rootTypeRefs are not yet defined for decisions (blocked on srs#68). Container-scoped loading is therefore deferred.

---

## Phases

### Phase 1: DecisionSummaryCard.svelte

**Goal:** A `<tr>` component that renders a decision record as a compact table row with three
cells: decision content | status | date.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/DecisionSummaryCard.svelte` with:
  - Props: `record: SrsRecord`, `selected: boolean = false`, `onclick: () => void`
  - Three `<td>` cells:
    1. **Decision cell** (`.log-table__decision`): bold title + decision statement on separate lines.
       - Title: `getStringField(record, "title") ?? "Untitled"`
       - Decision statement: `getStringField(record, "decision_statement")` — omit element entirely when `undefined`; when present, truncate at exactly 120 chars: `s.length > 120 ? s.substring(0, 120) + "…" : s`
    2. **Status cell** (`.log-table__nowrap`): `<Tag status={status} />` (omit if no status)
    3. **Date cell** (`.log-table__nowrap`): `record.createdAt?.slice(0, 10) ?? "—"`
  - `data-testid="decision-summary-card"` on the `<tr>` element
  - Selected state via `aria-selected` and a CSS class `log-table__row--selected`
  - Import `Tag` from `./Tag.svelte`, `SrsRecord` from `$lib/srs-client.js`, `Status` from `$lib/types.js`, `getStringField` from `$lib/governance/field-utils.js`

  Field IDs (from `field-utils.ts` FIELD_NAMES map):
  - `d7e82557-9045-5e92-a494-d99112bbec4a` → `title`
  - `de1296e0-e083-58d9-97a0-cb2b91fec02e` → `decision_statement`
  - `aee7afe9-6650-5fa4-a61a-495c3b88994b` → `status`

- [ ] Add CSS scoped to the component for:
  - `.dscard__title` — 0.875rem, font-weight 600, ink colour
  - `.dscard__statement` — 0.8125rem, opacity 0.7, line-height 1.4, `white-space: pre-wrap`; truncated display (see task above)
  - `.log-table__row--selected td` — subtle highlight: `background: var(--grey-1)`

- [ ] Export from `src/lib/components/index.ts`:
  ```ts
  export { default as DecisionSummaryCard } from "./DecisionSummaryCard.svelte";
  ```

#### Acceptance Criteria

- [ ] `<DecisionSummaryCard>` renders a `<tr>` with `data-testid="decision-summary-card"`.
- [ ] Three cells: decision content, status badge, date.
- [ ] Title shows when present; decision statement shown if present, capped at 120 chars.
- [ ] Status `<Tag>` omitted when `status` is absent (e.g. no `status` fieldValue).
- [ ] `selected=true` adds `.log-table__row--selected` class to `<tr>`.
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
```

#### Milestone gate

1. Acceptance criteria checked.
2. `npm run typecheck` and `npm run build` pass.
3. Mark checkboxes `[x]` and commit: `feat(components): add DecisionSummaryCard (#56)`.

---

### Phase 2: DecisionLogView.svelte

**Goal:** A view component that wraps `LogTable` with `DecisionSummaryCard` rows and an empty state.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/DecisionLogView.svelte` with:
  - Props: `records: SrsRecord[]`, `selectedId: string | null = null`, `onSelect: (id: string | null) => void`
  - Outer `<div data-testid="decision-log-view">`
  - When `records.length === 0`: `<p class="empty-state">No decisions in this repository.</p>`
  - When `records.length > 0`:
    ```svelte
    <LogTable columns={["Decision", "Status", "Date"]}>
      {#each records as record (record.instanceId)}
        <DecisionSummaryCard
          {record}
          selected={selectedId === record.instanceId}
          onclick={() => onSelect(selectedId === record.instanceId ? null : record.instanceId)}
        />
      {/each}
    </LogTable>
    ```
  - Imports: `LogTable`, `DecisionSummaryCard` from `./index.js`; `SrsRecord` from `$lib/srs-client.js`

- [ ] Export from `src/lib/components/index.ts`:
  ```ts
  export { default as DecisionLogView } from "./DecisionLogView.svelte";
  ```

#### Acceptance Criteria

- [ ] `<DecisionLogView records={[]} ...>` renders the empty state message.
- [ ] `<DecisionLogView records={[...]} ...>` renders one `<tr>` per record via `DecisionSummaryCard`.
- [ ] `selectedId` passed through to `DecisionSummaryCard.selected`.
- [ ] Clicking a row calls `onSelect(id)` (toggle off when clicking the already-selected row).
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
```

#### Milestone gate

As Phase 1. Commit: `feat(components): add DecisionLogView (#56)`.

---

### Phase 3: Wire DecisionLogView into App.svelte

**Goal:** The "decisions" section in the governance viewer uses `DecisionLogView` instead of the
generic `.record-list` grid.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/App.svelte`, import `DecisionLogView` from `$lib/components/index.js`.

- [ ] In the `Workspace` template, within the `{:else}` block (section list view), replace the
  existing generic record list block with a conditional:
  ```svelte
  {#if activeSection === "decisions"}
    <div class="section-heading">
      <h2 class="section-heading__title">{activeSection_.label}</h2>
      <span class="section-heading__count">{activeRecords.length}</span>
    </div>
    <DecisionLogView
      records={activeRecords}
      selectedId={selectedId}
      onSelect={(id) => { selectedId = id; }}
    />
  {:else}
    <!-- existing generic .record-list block for articles/roles/exercises -->
    ...existing code...
  {/if}
  ```
  Keep the existing generic `.record-list` grid for all other sections unchanged.

- [ ] Verify the reading view still opens when a decision is selected: `selectedRecord` is derived
  from `selectedId` + `activeRecords`, which is unchanged.

- [ ] Ensure the breadcrumb, inspector, and lifecycle transitions still work: `selectedRecord` is
  still used throughout — this is verified by checking `selectedId` is set via `onSelect`.

#### Acceptance Criteria

- [ ] "Decision Log" section renders `data-testid="decision-log-view"` wrapper.
- [ ] Decision records appear as `DecisionSummaryCard` rows (not `.record-list__item` divs).
- [ ] Clicking a row opens the existing reading view (selectedRecord is set, RecordReading shown).
- [ ] Other sections (articles, roles, exercises) still use the generic `.record-list` grid.
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

As Phase 1. Commit: `feat(app): use DecisionLogView in governance decisions section (#56)`.

---

### Phase 4: Playwright e2e test

**Goal:** E2e verification that the Decision Log shows summary cards with decision content,
and clicking opens the reading view.

**Agent:** Verification

#### Tasks

- [ ] Add to `e2e/gallery.spec.ts` inside the existing `"Gallery fixture — real records render"` describe block:

  ```ts
  test("Decision Log shows DecisionSummaryCard rows with decision content", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();

    // gallery.srsj has 7 decisions — 7 summary card rows
    const cards = page.getByTestId("decision-summary-card");
    await expect(cards).toHaveCount(7);

    // First card must contain the decision statement (not empty)
    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();
    // The decision statement text is in .dscard__statement; assert it is non-empty
    await expect(firstCard.locator(".dscard__statement")).not.toBeEmpty();
  });

  test("clicking a DecisionSummaryCard row opens the reading view", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await page.getByTestId("decision-summary-card").first().click();
    await expect(page.getByTestId("record-reading")).toBeVisible();
  });
  ```

- [ ] Update the existing `"Decision Log section renders cards, not empty state"` test: replace the old `.record-list__item` selector check with `data-testid="decision-log-view"` visibility assertion (the old selector is removed when Phase 3 replaces the `.record-list` grid).

#### Acceptance Criteria

- [ ] New tests pass.
- [ ] Updated existing test passes.
- [ ] All other existing gallery tests still pass (no regressions).

#### Testing

```bash
npm run e2e -- --grep "Decision Log"
npx playwright test e2e/gallery.spec.ts
```

#### Milestone gate

All tests pass. Commit: `test(e2e): verify DecisionLogView in gallery spec (#56)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` (vitest) passes
- [ ] `npx playwright test e2e/gallery.spec.ts` passes (all gallery tests including new ones)
- [ ] gallery.srsj loaded in governance mode → Decision Log → 7 `data-testid="decision-summary-card"` rows visible
- [ ] Clicking a row opens `data-testid="record-reading"` view
- [ ] Other sections (articles, roles, exercises) unaffected (generic `.record-list` still used)
- [ ] No regression in lifecycle, decision-flow, or record-edit tests

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001): field reads via `getStringField`; field ID constants via `field-utils.ts`; no inline UUID strings except inside `DecisionSummaryCard` (which uses named constants from `field-utils.ts`).
- Actually: field IDs in `DecisionSummaryCard` are accessed via `getStringField(record, "title")` etc. — using the NAME not the UUID directly. The UUID-to-name map is in `field-utils.ts`. No raw UUID literals in component code.

## Assumptions

- The gallery fixture has exactly 7 decision records of type `governance/decision` (confirmed from `gallery.spec.ts` comments and fixture inspection).
- The `decision_statement` field (`de1296e0-...` → `"decision_statement"` in `field-utils.ts`) is populated in all gallery decisions.
- Container-scoped loading via `documentViewsForContainer` is deferred to srs-web#54; this plan uses the existing `listRecords` type-based query.
- `getStringField` handles absent fields gracefully (returns `undefined`), so `DecisionSummaryCard` must handle undefined values (use `??` not just falsiness checks).
- The gallery fixture's 7-decision count is confirmed by the existing `gallery.spec.ts` count-badge test and fixture inspection.
- `.empty-state` class in `DecisionLogView.svelte` needs a scoped CSS definition (not assumed global); add `<style> .empty-state { ... } </style>` in the component.
