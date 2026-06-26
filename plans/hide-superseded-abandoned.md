# Plan: Hide superseded/abandoned decisions by default with Show all toggle

> Issue: srs-web#58

## Summary

The Decision Log currently shows all decisions regardless of lifecycle status, including `superseded` and `abandoned` records. Decision Logger v1 story S6 requires that users see only live decisions by default, with a toggle to reveal the historical ones. This is a client-side presentation filter in `DecisionLogView.svelte` using the status field value already present on every record. The srs-rust#180 RFC-M render filter ensures that when the decision log is rendered to HTML/Markdown via `render_document_view`, the DocumentView configuration already excludes these states server-side.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude (this pipeline) |
| Web App Worker | Phase 1 |
| Verification | Final gate |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TypeScript; status field values are read from records via fieldMeta, not hardcoded UUIDs | accepted |

The toggle hides records whose `status` field equals `"superseded"` or `"abandoned"`. These values are presentation-tier constants (the same pattern as `Status` in `types.ts` and `LIFECYCLE_TRANSITIONS` in `lifecycle.ts`), not SRS semantic operations. No new WASM binding is required.

---

## Contracts

### WASM API surface

**No new WASM method required.** The filter is applied client-side by reading the `status` field value from already-loaded `SrsRecord[]`. The `render_document_view` WASM call already respects RFC-M exclusion configured in the gallery DocumentView (srs-rust#180).

### TypeScript types

`Status` in `src/lib/types.ts` currently lacks `"abandoned"`. This plan adds it (srs#69 added `abandoned` as a terminal state in the spec package). `LIFECYCLE_TRANSITIONS` in `lifecycle.ts` gains `abandoned: []` as a terminal state alongside `superseded`.

---

## Scope

- Add `"abandoned"` to the `Status` union type in `src/lib/types.ts`.
- Add `abandoned: []` to `LIFECYCLE_TRANSITIONS` in `src/lib/governance/lifecycle.ts`.
- Add `showAll: boolean` state (default `false`) to `DecisionLogView.svelte`.
- Add filtering: when `showAll === false`, exclude records where `getStringField(r, "status", fieldMeta) ∈ {"superseded", "abandoned"}`.
- Add a "Show superseded/abandoned" toggle button in the controls bar (`data-testid="show-all-toggle"`).
- Update `e2e/fixtures/gallery.srsj` to include 1 superseded + 1 abandoned decision (total 9 decisions), updating the `manifest.json` `instanceIndex` accordingly.
- Update existing gallery.spec.ts count assertions (7 → 9 total, with 7 visible by default after filtering).
- Add Playwright tests in `e2e/gallery.spec.ts` for the toggle behavior.

**Out of scope:**
- Adding HTML/Markdown export buttons for the decision log (separate issue S4 / srs-web#41 scope is guides only).
- Modifying the `render_document_view` call signature — RFC-M exclusion is already server-side.
- Hiding superseded/abandoned records in the navigation count badge (that count reflects total records, not filtered).
- Export flow changes — the RFC-M DocumentView configuration already handles this.

---

## Phases

### Phase 1: Type updates + DecisionLogView toggle

**Goal:** `DecisionLogView.svelte` filters out superseded/abandoned by default, with a working "Show superseded/abandoned" toggle.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/types.ts`, add `"abandoned"` to the `Status` union (after `"rejected"`).
- [ ] In `src/lib/governance/lifecycle.ts`, add `abandoned: [],` to `LIFECYCLE_TRANSITIONS` (after `superseded: []`).
- [ ] In `src/lib/components/DecisionLogView.svelte`:
  - Import the `Status` type: `import type { Status } from "$lib/types.js";`
  - Add `let showAll = $state(false);` near the other state vars.
  - Define `const HIDDEN_STATUSES: ReadonlySet<Status> = new Set(["superseded", "abandoned"]);`
  - In the `displayedRecords` `$derived`, add a filter **before** the existing topic/search filters:
    ```ts
    .filter((r) => {
      if (!showAll) {
        const s = getStringField(r, "status", fieldMeta);
        if (s !== undefined && HIDDEN_STATUSES.has(s)) return false;
      }
      return true;
    })
    ```
    Chain this before the existing topic/search `.filter()` call.
  - In the controls bar, add a toggle button after the topic filter select:
    ```svelte
    <button
      data-testid="show-all-toggle"
      class="controls-bar__show-all-btn"
      class:controls-bar__show-all-btn--active={showAll}
      onclick={() => { showAll = !showAll; }}
    >
      {showAll ? "Hide superseded/abandoned" : "Show superseded/abandoned"}
    </button>
    ```
  - Add `.controls-bar__show-all-btn` and `.controls-bar__show-all-btn--active` styles consistent with `.controls-bar__sort-btn`.

#### Acceptance Criteria

- [ ] `getStringField(r, "status", fieldMeta)` returns `"superseded"` or `"abandoned"` for records with those status values.
- [ ] `displayedRecords` excludes records with status `"superseded"` or `"abandoned"` when `showAll === false`.
- [ ] `displayedRecords` includes all records when `showAll === true`.
- [ ] Toggle button text changes: "Show superseded/abandoned" ↔ "Hide superseded/abandoned".
- [ ] `"abandoned"` is a valid `Status` value.
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
```

#### Milestone gate

1. All acceptance criteria above checked.
2. `npm run typecheck` and `npm run build` pass.
3. Mark completed checkboxes.
4. Commit: `feat(decision-log): hide superseded/abandoned by default + Show all toggle (#58)`

---

### Phase 2: Fixture update + Playwright tests

**Goal:** gallery.srsj contains 2 additional decisions (1 superseded, 1 abandoned) and Playwright tests verify the toggle behavior end-to-end.

**Agent:** Web App Worker

#### Tasks

- [ ] In `e2e/fixtures/gallery.srsj`, add 2 new tier-2 decision records to the `data` object:

  Concrete field IDs (confirmed from `3be7b057-9167-42a4-b0db-2a8b30666cef.json`):
  - `typeId`: `1fcad6a2-9f78-5e41-94ba-d82e88b822f3`
  - `typeNamespace`: `governance`
  - title `fieldId`: `d7e82557-9045-5e92-a494-d99112bbec4a`
  - decision_statement `fieldId`: `de1296e0-e083-58d9-97a0-cb2b91fec02e`

  **Superseded decision** — file path `records/tier-2/00000000-0000-4000-8000-000000005801.json`:
  ```json
  {
    "instanceId": "00000000-0000-4000-8000-000000005801",
    "typeId": "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
    "typeVersion": 1,
    "typeNamespace": "governance",
    "typeName": "decision",
    "fieldValues": [
      { "fieldId": "d7e82557-9045-5e92-a494-d99112bbec4a", "value": "Old superseded decision" },
      { "fieldId": "de1296e0-e083-58d9-97a0-cb2b91fec02e", "value": "This decision has been superseded by a later record." },
      { "fieldId": "aee7afe9-6650-5fa4-a61a-495c3b88994b", "value": "superseded" }
    ],
    "createdAt": "2025-06-01T00:00:00Z",
    "updatedAt": "2025-06-01T00:00:00Z"
  }
  ```

  **Abandoned decision** — file path `records/tier-2/00000000-0000-4000-8000-000000005802.json`:
  ```json
  {
    "instanceId": "00000000-0000-4000-8000-000000005802",
    "typeId": "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
    "typeVersion": 1,
    "typeNamespace": "governance",
    "typeName": "decision",
    "fieldValues": [
      { "fieldId": "d7e82557-9045-5e92-a494-d99112bbec4a", "value": "Abandoned proposal" },
      { "fieldId": "de1296e0-e083-58d9-97a0-cb2b91fec02e", "value": "This proposal was abandoned without a decision being reached." },
      { "fieldId": "aee7afe9-6650-5fa4-a61a-495c3b88994b", "value": "abandoned" }
    ],
    "createdAt": "2025-05-01T00:00:00Z",
    "updatedAt": "2025-05-01T00:00:00Z"
  }
  ```

- [ ] In `e2e/fixtures/gallery.srsj`, add `"abandoned"` to the `allowedValues` array in `package/fields/status-aee7afe9.json` (after `"rejected"`). The current list is `["draft","proposed","active","deferred","superseded","closed","rejected","archived"]` — add `"abandoned"` to make it `["draft","proposed","active","deferred","superseded","closed","rejected","archived","abandoned"]`.

- [ ] Add both new record paths to the `manifest.json`'s `instanceIndex` array in `gallery.srsj`.

- [ ] Add both new `instanceId` values to `memberInstanceIds` in `containers/138e2fac-6a8a-4a06-9511-5aefd99ceae9.json` in `gallery.srsj`:
  ```json
  "memberInstanceIds": [
    "3be7b057-9167-42a4-b0db-2a8b30666cef",
    "4a989562-4a9d-4c86-a365-91bf14d55f06",
    "9054911c-5285-4c3e-8198-4b9650169001",
    "9af57e54-03fb-4625-9a4c-8d2a254ff2b7",
    "a9ca11cf-fd34-4901-b5f6-51e20737cb56",
    "dd715d4a-8640-4641-b79d-e44f728c547b",
    "eb4024a0-486f-4d64-a4e4-5d80297129d2",
    "00000000-0000-4000-8000-000000005801",
    "00000000-0000-4000-8000-000000005802"
  ]
  ```

- [ ] Update `e2e/gallery.spec.ts` — only one assertion changes; all others stay at `7`:
  - **Line 65** (`"Decision Log shows DecisionSummaryCard rows"` — `toHaveCount(7)`): **Do not change.** `showAll` defaults to `false`, so the default view still shows only 7 active decisions.
  - **Line 81** (nav badge `toContainText("7")`): Change to `toContainText("9")`. The nav badge uses total container membership count (not the DecisionLogView filter), so it shows all 9 after fixture update.
  - All assertions in `"Decision Log — sort and filter controls"` that reference `7` remain unchanged (they all run with `showAll=false`).
- [ ] Add a new `describe` block in `e2e/gallery.spec.ts`: "Decision Log — hide superseded/abandoned toggle":

  ```ts
  test.describe("Decision Log — hide superseded/abandoned toggle", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("mode-governance").click({ timeout: 15000 });
      await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
        timeout: 5000,
      });

      const fileInput = page.locator('input[type="file"]#srsj-file');
      await fileInput.setInputFiles(GALLERY_PATH);

      await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
      await page.getByRole("link", { name: /Decision Log/ }).click();
      await expect(page.getByTestId("decision-log-view")).toBeVisible();
    });

    test("default view hides superseded decisions", async ({ page }) => {
      const cards = page.getByTestId("decision-summary-card");
      await expect(cards).toHaveCount(7);
      // Filtered records are never rendered — assert absent from DOM
      await expect(page.locator('[data-testid="decision-summary-card"]')
        .filter({ hasText: "Old superseded decision" })).not.toBeAttached();
    });

    test("default view hides abandoned decisions", async ({ page }) => {
      const cards = page.getByTestId("decision-summary-card");
      await expect(cards).toHaveCount(7);
      await expect(page.locator('[data-testid="decision-summary-card"]')
        .filter({ hasText: "Abandoned proposal" })).not.toBeAttached();
    });

    test("Show all toggle reveals superseded and abandoned", async ({ page }) => {
      const toggle = page.getByTestId("show-all-toggle");
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveText("Show superseded/abandoned");
      await toggle.click();
      await expect(toggle).toHaveText("Hide superseded/abandoned");
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(9);
    });

    test("Hide toggle re-hides superseded and abandoned", async ({ page }) => {
      await page.getByTestId("show-all-toggle").click(); // show all
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(9);
      await page.getByTestId("show-all-toggle").click(); // hide again
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(7);
    });

    test("topic filter does not reveal superseded/abandoned records", async ({ page }) => {
      // New fixture records have no topic tags — but even if they did, showAll=false
      // means they are excluded before the topic filter runs.
      // Verify: topic filter on any value still shows ≤7 cards with showAll=false.
      await page.getByTestId("topic-filter").selectOption("exhibitions");
      const cards = page.getByTestId("decision-summary-card");
      // exhibitions has 2 active decisions; superseded/abandoned have no tags → 0 from them
      await expect(cards).toHaveCount(2);
      // showAll=true + topic filter: superseded/abandoned visible but still filtered by topic
      await page.getByTestId("show-all-toggle").click();
      // superseded/abandoned have no topic tags → still 2 after topic filter
      await expect(cards).toHaveCount(2);
    });
  });
  ```

#### Acceptance Criteria

- [ ] gallery.srsj loads cleanly with 9 records in the Decision Log.
- [ ] Default view (showAll=false) shows 7 decisions (superseded + abandoned hidden).
- [ ] Toggle shows all 9 decisions when clicked.
- [ ] Re-clicking the toggle re-hides them (7 visible again).
- [ ] Toggle button label changes correctly.
- [ ] No regressions in existing gallery.spec.ts tests (update count assertions).

#### Testing

```bash
npm run typecheck
npm run build
npm test
npm run e2e -- --grep "Decision Log"
```

#### Milestone gate

1. All acceptance criteria checked.
2. `npm run typecheck` and `npm run e2e` pass.
3. Mark checkboxes.
4. Commit: `test(e2e): add hide/show superseded toggle tests + fixture update (#58)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (unit tests)
- [ ] `npm run e2e` passes (all Playwright tests green, including new toggle tests)
- [ ] Default Decision Log hides decisions with status `superseded` or `abandoned`
- [ ] "Show superseded/abandoned" toggle reveals all decisions
- [ ] `render_document_view` RFC-M filter path confirmed: the DocumentView in gallery.srsj is configured to exclude superseded/abandoned via lifecycle-state exclusion (srs-rust#180) — verified by the existing engine tests

## Coordination Rules

- Web App Worker keeps changes to `srs-web/**`.
- No SRS semantics in TypeScript (ADR-001) — the filter reads field values from records, it does not re-implement status semantics.
- Fixture changes (gallery.srsj) must preserve the existing record count for all non-decision records.

## Assumptions

- The status field UUID `aee7afe9-6650-5fa4-a61a-495c3b88994b` is stable (confirmed from App.svelte and issue #66).
- The `typeId` and `fieldId` for new fixture records are copied from existing decision records in gallery.srsj.
- The nav count badge reflects total records (before the DecisionLogView filter), so it will show 9 after fixture update; tests asserting nav count "7" will update to "9".
- "Exported HTML/Markdown log" criterion is satisfied by the RFC-M filter in the srs-rust engine (srs-rust#180) which already excludes superseded/abandoned in `render_document_view` — no additional TS export code is needed.
