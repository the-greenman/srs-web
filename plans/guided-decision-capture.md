# Plan: Guided decision capture from blueprint schema + aiGuidance (#60)

## Summary

`DecisionFlow.svelte` hard-codes 11 decision field UUID constants and 8 status option strings. This violates the srs-web#60 acceptance criterion that no decision field metadata be hardcoded in TypeScript, and means `aiGuidance` text from the package is never surfaced to the user. This plan removes all hardcoded field UUIDs from `DecisionFlow.svelte`, drives the component from the `TypeFormDef` already loaded in `App.svelte`, and exposes each field's `aiGuidance.purpose` as in-context help text.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Orchestrating agent |
| Web App Worker | Orchestrating agent |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | Blueprint/type schema drives authoring forms | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | `sectionSchemas` keyed by typeId UUID; `DecisionFlow` receives TypeFormDef | accepted |

No new ADR required — this feature applies existing ADRs. `DecisionFlow` consuming `TypeFormDef` (already used by `RecordForm`) is the natural extension of ADR-003.

---

## Contracts

### WASM API surface

**No new WASM binding required.** `typeSchema(repo, typeId)` already exists. The `x-srs-ai-guidance` extension property is already emitted by `type_schema_service.rs` (lines 208–214) when `aiGuidance` is an object. The TS type `SchemaProperty` simply needs the property declared.

### TypeScript types

Two additive changes:
1. `SchemaProperty` in `srs-client.ts` gains `"x-srs-ai-guidance"?: { purpose?: string; [key: string]: unknown }`.
2. `FieldFormDef` in `src/lib/governance/types.ts` gains `aiGuidance?: string`.
3. `DecisionFlow.svelte` gains a required `schema: TypeFormDef` prop.

These are backward-compatible additions. No type is removed or renamed.

---

## Scope

- Add `"x-srs-ai-guidance"` to `SchemaProperty` in `srs-client.ts`.
- Add `aiGuidance?: string` to `FieldFormDef` in `src/lib/governance/types.ts`.
- Update `propertyToField()` in `blueprint-utils.ts` to extract `prop["x-srs-ai-guidance"]?.purpose`.
- Refactor `DecisionFlow.svelte`: accept `schema: TypeFormDef`; remove all `FIELD_*` UUID constants and `STATUS_OPTIONS`; derive Quick Capture fields and Full Deliberation stages from the schema; render `field.aiGuidance` as `help` text.
- Wire `App.svelte` to pass `schema={sectionSchemas[DECISION_TYPE_ID]}` to `<DecisionFlow>`.
- Update `e2e/fixtures/gallery.srsj` to add real `aiGuidance.purpose` for the `decision_statement` and `rationale` fields.
- Add an e2e test asserting that `aiGuidance` help text renders for those fields.
- Update existing e2e tests in `decision-flow.spec.ts` to reflect the schema-driven stage count (10 stages in the gallery fixture: all fields except `title` and `status`).

**Out of scope:**

- Changes to `RecordForm.svelte`, `RecordReading.svelte`, or other form components.
- Adding a protocol-stage view (the spec's Protocol type maps stages to sections — a separate feature).
- Changes to `srs-rust` or the `srs` spec.
- Updating the gallery.srsj fixture fields other than `decision_statement` and `rationale`.

---

## Phases

### Phase 1: Extend TypeScript types + `propertyToField()`

**Goal:** `FieldFormDef` carries `aiGuidance?`, `SchemaProperty` exposes `x-srs-ai-guidance`, and `propertyToField()` populates it — with typecheck passing.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/srs-client.ts`, add `"x-srs-ai-guidance"?: { purpose?: string; [key: string]: unknown }` to the `SchemaProperty` interface (after the existing `"x-srs-composite-renderer"?` line).
- [ ] In `src/lib/governance/types.ts`, add `aiGuidance?: string` to the `FieldFormDef` interface (after the `name` field).
- [ ] In `src/lib/guides/blueprint-utils.ts`, update `propertyToField()` to extract guidance:
  ```ts
  return {
    fieldId: prop["x-srs-field-id"] ?? name,
    label: prop.title || name,
    valueType,
    required,
    options: prop.enum,
    name,
    aiGuidance: prop["x-srs-ai-guidance"]?.purpose || undefined,
  };
  ```

#### Acceptance Criteria

- [ ] `npm run typecheck` passes — no errors on `SchemaProperty`, `FieldFormDef`, or `propertyToField`.
- [ ] `npm run build` succeeds.

#### Milestone gate

Run `npm run typecheck && npm run build`. Commit: `feat: expose x-srs-ai-guidance in SchemaProperty and FieldFormDef (#60)`

---

### Phase 2: Refactor `DecisionFlow.svelte` to be schema-driven

**Goal:** `DecisionFlow.svelte` contains no hardcoded UUIDs or status strings; all field metadata comes from `schema: TypeFormDef`; `aiGuidance` renders as `help` text; stage count is derived from the schema.

**Agent:** Web App Worker

#### Context: field naming convention

The `FieldFormDef.name` property is the snake_case JSON Schema property name (e.g. `"title"`, `"decision_statement"`, `"status"`). These are stable identifiers in the governance package — they are structural metadata, not SRS semantics (ADR-001 compliant per ADR-006 rationale).

#### Field roles

- **Persistent header** (always visible, not a stage): fields named `"title"` and `"status"`.
- **Quick Capture** (4 fields): fields named `"title"`, `"decision_statement"`, `"rationale"`, `"status"`.
- **Full Deliberation stages**: all fields NOT named `"title"` or `"status"`, in schema order. For the current gallery.srsj fixture (12 fields), this produces 10 stages.

These role assignments are presentation configuration (display logic), not SRS semantics.

#### Tasks

- [ ] Add `schema: TypeFormDef` as a required prop (import `TypeFormDef` from `"$lib/governance/types.js"`).
- [ ] Replace all 11 `FIELD_*` UUID constants with derived lookups from `schema.fields`:
  - `const titleField = schema.fields.find(f => f.name === "title")!;`
  - `const statusField = schema.fields.find(f => f.name === "status")!;`
  - `const decisionStatementField = schema.fields.find(f => f.name === "decision_statement");`
  - `const rationaleField = schema.fields.find(f => f.name === "rationale");`
- [ ] Replace `STATUS_OPTIONS` with `statusField?.options ?? []`.
- [ ] Replace `STAGES` constant with derived `deliberationStages: FieldFormDef[]`:
  ```ts
  const HEADER_NAMES = ["title", "status"];
  const deliberationStages = schema.fields.filter(f => !HEADER_NAMES.includes(f.name));
  ```
- [ ] Replace `stageValues` initialisation:
  ```ts
  let stageValues = $state<Record<string, string>>(
    Object.fromEntries(deliberationStages.map(s => [s.name, ""]))
  );
  ```
- [ ] Update `summaryDecisionStatement` derived:
  ```ts
  let summaryDecisionStatement = $derived(
    mode === "quick"
      ? quickDecisionStatement
      : stageValues["decision_statement"] ?? ""
  );
  ```
- [ ] Update `summaryRationale` derived similarly (use `stageValues["rationale"] ?? ""`).
- [ ] Update `buildInput()`:
  - Quick mode: use `titleField.fieldId`, `statusField.fieldId`, `decisionStatementField?.fieldId`, `rationaleField?.fieldId`.
  - Deliberate mode: iterate `deliberationStages`, push `{ fieldId: s.fieldId, value: stageValues[s.name] }` for non-empty values.
- [ ] Update `currentStage` and `isLastStage` derived to use `deliberationStages`:
  ```ts
  let currentStage = $derived(deliberationStages[stage]);
  let isLastStage = $derived(stage === deliberationStages.length - 1);
  ```
- [ ] In Quick Capture template: for each of the 4 fields, render `<Field>` with `help={field?.aiGuidance}` (undefined is fine — `Field` renders nothing when `help` is undefined).
- [ ] In Full Deliberation template:
  - Progress label: `Stage {stage + 1} of {deliberationStages.length}: {currentStage.label}`
  - Stage field: render `<Textarea>` if `currentStage.valueType === "text"`, else `<Input>`, with `help={currentStage.aiGuidance}`.
  - Bind to `stageValues[currentStage.name]` (not `stageValues[currentStage.fieldId]`).
- [ ] Update `App.svelte`: pass `schema={sectionSchemas[DECISION_TYPE_ID]}` to `<DecisionFlow>`. Guard the render: only show `<DecisionFlow>` when `sectionSchemas[DECISION_TYPE_ID]` is defined.

#### Acceptance Criteria

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds.
- [ ] `grep -rn "FIELD_TITLE\|FIELD_DECISION_QUESTION\|FIELD_CONTEXT\|FIELD_FRICTION\|FIELD_ALTERNATIVES\|FIELD_KEY_REQUIREMENTS\|FIELD_DECISION_STATEMENT\|FIELD_RATIONALE\|FIELD_REVISIT_WHEN\|FIELD_NEXT_STEPS\|FIELD_STATUS\|STATUS_OPTIONS" src/` returns empty.
- [ ] `npm test` passes — all deliberation field values round-trip into `buildInput()` fieldValues correctly (covered by existing unit tests and e2e save flow).
- [ ] `grep -r "GOVERNANCE_FIELDS\|GOVERNANCE_FORMS" src/` returns empty (was already passing; confirm no regression).
- [ ] Loading `gallery.srsj`, clicking "New Decision" → "Quick Capture" shows 4 fields with help text on fields that have `aiGuidance`.
- [ ] Full Deliberation shows the correct stage count (10 for gallery.srsj) with aiGuidance as help text.
- [ ] `npm test` passes.

#### Milestone gate

Run `npm run typecheck && npm run lint && npm run build && npm test`. Commit: `feat: schema-driven DecisionFlow — remove hardcoded field UUIDs, show aiGuidance (#60)`

---

### Phase 3: Update fixture + e2e tests

**Goal:** The gallery.srsj fixture has real `aiGuidance.purpose` for `decision_statement` and `rationale`; a Playwright test asserts the help text renders; existing tests are updated for the new stage count.

**Agent:** Web App Worker

#### Tasks

- [ ] In `e2e/fixtures/gallery.srsj`, update `package/fields/decisionstatement-de1296e0.json`.aiGuidance.purpose to: `"States the settled commitment in one concise, active-voice sentence. This is the record of what was decided, not why."` (from gallery-project-v2 spec).
- [ ] In `e2e/fixtures/gallery.srsj`, update `package/fields/rationale-3340532b.json`.aiGuidance.purpose to: `"Explains the deciding factor — why this option was chosen over the alternatives. One to three sentences capturing the core reasoning."` (from gallery-project-v2 spec).
- [ ] In `e2e/decision-flow.spec.ts`, update Test 4 ("Stage 1 of 9: Decision Question") to "Stage 1 of 10: Decision Question".
- [ ] In `e2e/decision-flow.spec.ts`, update Test 5 ("Stage 2 of 9: Context") to "Stage 2 of 10: Context" and the `ContainText` check for `Stage ${i + 2} of 9` to `Stage ${i + 2} of 10`.
- [ ] In `e2e/decision-flow.spec.ts`, update Test 6 (`stageTexts`) to add a 10th entry for the "Owner" stage (e.g. `"Alice"`) and update the loop to expect 10 stages total.
- [ ] Add Test 8 in `e2e/decision-flow.spec.ts`: "Quick Capture shows aiGuidance help text on decision_statement and rationale fields":
  ```ts
  test("Quick Capture shows aiGuidance help text on decision_statement and rationale", async ({ page }) => {
    await goToDecisions(page);
    await page.locator("button.topbar__new").click();
    await page.getByRole("button", { name: "Quick Capture" }).click();
    // decision_statement help text
    await expect(page.locator(".field").filter({ hasText: "Decision Statement" }).locator(".field__help"))
      .toContainText("settled commitment");
    // rationale help text
    await expect(page.locator(".field").filter({ hasText: "Rationale" }).locator(".field__help"))
      .toContainText("deciding factor");
  });
  ```
- [ ] Add Test 9: "Full Deliberation shows aiGuidance help text on Decision Statement stage":
  ```ts
  test("Full Deliberation shows aiGuidance help text on Decision Statement stage", async ({ page }) => {
    await goToDecisions(page);
    await page.locator("button.topbar__new").click();
    await page.getByRole("button", { name: "Full Deliberation" }).click();
    // Navigate to stage 6 (Decision Statement)
    for (let i = 0; i < 5; i++) {
      await page.locator("#del-stage-field").fill("placeholder");
      await page.getByRole("button", { name: "Next" }).click();
    }
    await expect(page.locator(".decision-flow__progress-label")).toContainText("Stage 6 of 10: Decision Statement");
    await expect(page.locator(".field__help")).toContainText("settled commitment");
  });
  ```

#### Acceptance Criteria

- [ ] `npm run e2e` passes (all existing + new tests).
- [ ] The aiGuidance help text tests pass.
- [ ] `npm test` passes.

#### Milestone gate

Run `npm run typecheck && npm run lint && npm run build && npm test`. Commit: `test: update decision-flow e2e for schema-driven stages and aiGuidance help text (#60)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes (all 9 decision-flow tests green)
- [ ] WASM loads and `typeSchema()` returns decision fields for gallery.srsj
- [ ] `grep -rn "FIELD_TITLE\|FIELD_DECISION_QUESTION\|FIELD_CONTEXT\|FIELD_FRICTION\|FIELD_ALTERNATIVES\|FIELD_KEY_REQUIREMENTS\|FIELD_DECISION_STATEMENT\|FIELD_RATIONALE\|FIELD_REVISIT_WHEN\|FIELD_NEXT_STEPS\|FIELD_STATUS\|STATUS_OPTIONS" src/` returns empty
- [ ] `grep -r "GOVERNANCE_FIELDS\|GOVERNANCE_FORMS" src/` returns empty

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). Field names (`"title"`, `"decision_statement"`) in `HEADER_NAMES` and `QUICK_CAPTURE_NAMES` are presentation configuration, not SRS semantics.
- `propertyToField()` in `blueprint-utils.ts` is the single field-extraction function.
- Verification Agent runs after Phase 2 and before the PR.

## Assumptions

- `typeSchema(repo, typeId)` returns a `SchemaDefinition` where each property has `"x-srs-ai-guidance": { "purpose": "..." }` when the field has non-empty aiGuidance (confirmed in `type_schema_service.rs` lines 208–214).
- The gallery.srsj decision type has fields named `"title"`, `"status"`, `"decision_statement"`, `"rationale"` — confirmed by fixture inspection.
- The gallery.srsj decision type has 12 fields, so Full Deliberation will show 10 stages (all minus title and status).
- `Field.svelte` accepts `help?: string` and renders it as `.field__help` — confirmed.
- The `options` array from `FieldFormDef` (from `SchemaProperty.enum`) contains the status values for the status field — confirmed via `allowedValues` in the gallery fixture (the WASM maps `allowedValues` to `enum` in the JSON Schema).
