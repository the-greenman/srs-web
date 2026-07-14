# Plan: Show field description/instructions in the read-only record view

## Summary

Issue #211 is the read-only counterpart to #176. #176 taught the **editor** frame
(`Field.svelte`) to surface a field's own help text — the short `description` as an inline
caption, and the fuller `instructions` behind an accessible circled-ⓘ toggle — sourcing both
from `FieldFormDef.description` / `FieldFormDef.instructions` (already plumbed through
`propertyToField` from the `x-srs-description` / `x-srs-instructions` keys the type-schema
projection emits, srs-rust#415). The **read-only** render path (`RecordView.svelte` →
`CardField.svelte`) consumes the exact same `FieldFormDef` via the `fieldMeta` context map but
still shows only the label. This plan mirrors the #176 treatment in the read view so a reader
gets the same guidance an editor does. Presentation only (ADR-001) — no new WASM binding, no
spec change; the data is already in `FieldFormDef`.

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
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS. This change reads `description`/`instructions` already present on `FieldFormDef` (WASM-sourced) and renders them — pure presentation; the new caption/toggle CSS in `card.css` is a presentation concern, not an SRS semantic. | accepted |

No new ADR: this establishes no new constraint. It reuses the interaction and accessibility
pattern already accepted and shipped in #176; the read view is simply the second surface that
inherits it, exactly as the issue anticipates ("the same way"). (ADR-007 is *not* cited — it is
narrowly about GuidesShell preview/print `theme_variant`, not a general CSS-placement rule; the
styling-location rationale here is a straightforward ADR-001 consequence.)

---

## Contracts

### WASM API surface

**No** new or changed WASM methods. `FieldFormDef.description` and `FieldFormDef.instructions`
already exist (added in #176, commit a56d9cd) and are populated by `propertyToField` in
`blueprint-utils.ts`. `RecordView` already holds the `FieldFormDef` for each value via
`getFieldMetaContext().meta.get(fv.fieldId)`.

### TypeScript types

No type changes. `FieldFormDef` (in `src/lib/governance/types.ts`) already carries the two
optional string fields. `CardField.svelte` gains three optional props: `description?: string`,
`instructions?: string`, and `id?: string` (the last mirrors `Field.svelte`'s external-id
pattern so `aria-controls` resolves to a caller-stable DOM id).

---

## Scope

In scope:

- Add optional `description?: string` and `instructions?: string` props to
  `src/lib/components/CardField.svelte`, rendered as:
  - **description** → inline caption below the label, suppressed when it equals the label
    (mirrors `Field.svelte`'s `description !== label` rule, since type-schema `title` falls back
    to `description`, srs-rust ADR-026).
  - **instructions** → a circled-ⓘ toggle button in the label row (24×24 hit target, WCAG 2.2
    SC 2.5.8; `aria-expanded` / `aria-controls` / stateful `aria-label`; `title` fallback), that
    reveals the instructions paragraph on click. Identical semantics to `Field.svelte`.
- Add card-scoped CSS to `src/styles/components/card.css` mirroring the `.field__info` /
  `.field__instructions` / help treatment, namespaced `.card__field-*`.
- Wire `RecordView.svelte` to pass `description` / `instructions` from
  `fieldMeta.get(fv.fieldId)` into `CardField`.
- Unit tests for `CardField` (`tests/CardField.test.ts`), mirroring `tests/Field.test.ts`.

**Out of scope:**

- Editor surfaces (`Field.svelte`) — already done in #176.
- `DecisionView.svelte` / `DecisionSummaryCard.svelte` / `GovernanceShell.svelte` — other
  `CardField` callers. They pass no `description`/`instructions`; the new props default
  `undefined`, so they render unchanged. Surfacing help there is a separate concern, not filed
  unless dogfooding shows a gap.
- Markdown/HTML document-view export (a WASM render path, not this component tree).

---

## Phases

### Phase 1: CardField frame + styling + unit tests

**Goal:** `CardField` can render a field's description caption and instructions toggle, matching
the #176 editor treatment, with unit coverage. No behavioural change for existing callers.

**Agent:** Web App Worker

#### Tasks

- [x] Add `description?: string`, `instructions?: string`, and `id?: string` to
      `CardField.svelte` props (with the same doc-comment wording used on `Field.svelte`). `id`
      mirrors `Field.svelte`'s external-id pattern — the caller passes a stable unique id
      (Phase 2 passes `fv.fieldId`); no label-slugification or module counter.
- [x] Compute `captionText = description && description !== label ? description : undefined`.
- [x] Compute `instructionsId = id ? `${id}-instructions` : undefined` (exactly as `Field.svelte`).
- [x] Restructure the label row: keep `.card__field-label` as the flex row (it already is
      `display:flex; align-items:baseline; gap:8px`); when `instructions` is set, render a
      `<button class="card__field-info">` after the label text with `type="button"`,
      `aria-expanded={showInstructions}`, `aria-controls={instructionsId}`,
      `aria-label={showInstructions ? 'Hide field instructions' : 'Show field instructions'}`,
      `title={instructions}`, and an `onclick` that toggles `showInstructions` (`$state(false)`).
- [x] Render `{#if captionText}<p class="card__field-description">{captionText}</p>{/if}` and
      `{#if instructions && showInstructions}<p class="card__field-instructions"
      id={instructionsId}>{instructions}</p>{/if}` between the label row and the value.
- [x] Add `.card__field-info`, `.card__field-description`, `.card__field-instructions` rules to
      `card.css`, mirroring the `field.css` treatment (circled "i" ::before glyph, hover/expanded
      ink, focus-visible ring, left-rule instructions block) but scaled to the card label's
      mono/uppercase context. Keep the description caption in the sans body voice (like
      `.field__help`), not the mono label voice.
- [x] Add `tests/CardField.test.ts` mirroring `tests/Field.test.ts`: (a) description renders as
      caption; (b) description NOT rendered when it equals the label; (c) no ⓘ button when
      `instructions` absent; (d) ⓘ button present, instructions hidden by default; (e) clicking
      the button reveals the instructions paragraph and flips `aria-expanded` + `aria-label`;
      (f) existing label/required/empty behaviour still passes.

#### Acceptance Criteria

- [x] `CardField` with only `label` (description/instructions `undefined`) renders identically to
      before — no caption, no toggle, no extra DOM.
- [x] `CardField` with `instructions` renders the toggle; instructions hidden until clicked; a
      click flips `aria-expanded` and the stateful `aria-label` and reveals the paragraph.
- [x] `CardField` with `instructions` undefined renders no toggle.
- [x] `CardField` with `description !== label` renders the caption; `description === label` or
      `undefined` renders no caption.
- [x] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify acceptance criteria.
2. `npm run typecheck` and `npm run build` pass.
3. Mark task checkboxes `[x]`.
4. Commit: `feat(record-view): CardField renders field description + instructions (#211)`.

---

### Phase 2: Wire RecordView

**Goal:** The read-only record view surfaces each field's description/instructions from
`fieldMeta`, using the Phase 1 `CardField` capability.

**Agent:** Web App Worker

#### Tasks

- [x] In `RecordView.svelte`, resolve `const def = fieldMeta.get(fv.fieldId)` once per row and
      pass `description={def?.description}`, `instructions={def?.instructions}`, and
      `id={fv.fieldId}` to `CardField` (alongside the existing `label`).
- [x] Regression: the other `CardField` callers (`DecisionView.svelte`,
      `DecisionSummaryCard.svelte`, `GovernanceShell.svelte`) pass none of the new props, so they
      render unchanged. Verify by running the full `npm test` suite (which covers those views) —
      not by eyeball.
- [x] E2e caption assertion (data-driven): **added** to `e2e/lifecycle.spec.ts` — gallery
      **article** records dispatch to `RecordView` (only decisions use `DecisionView`), and their
      fields' schema `title` (humanized name) differs from `description`, so the caption is not
      suppressed. The test selects the "What this is" article and asserts `RecordView` renders
      `.card__field-description`, giving the read path the same live, WASM-driven proof #176 gave
      the editor. (The walkthrough's decision path uses `DecisionView`, so it carries a note, not
      an assertion.) The ⓘ toggle still has no fixture data (`instructions` empty everywhere) and
      is covered by the unit tests only — stated explicitly, not skipped.

#### Acceptance Criteria

- [x] A record whose type schema defines a distinct field description shows the caption in
      `RecordView`; a field with `instructions` shows the ⓘ toggle.
- [x] Records with no field help render exactly as before (verified by the full `npm test` run,
      which exercises the other `CardField` callers).
- [x] The Phase-2 e2e outcome is recorded: either a live caption assertion was added, or the
      "no distinct-description fixture field" finding is documented in the plan + PR body.
- [x] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` pass.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify acceptance criteria.
2. `npm run typecheck` and `npm run build` pass.
3. Mark task checkboxes `[x]`.
4. Commit: `feat(record-view): surface field description + instructions in RecordView (#211)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes (no regression; #176's walkthrough-r1 assertions still green)
- [x] WASM loads against `gallery.srsj`. Caption/toggle behaviour is fully proven by Phase 1's
      unit tests (synthetic props). Against live fixture data: the description caption is asserted
      in `e2e/lifecycle.spec.ts` on a real article rendered through `RecordView`; the ⓘ toggle
      cannot be fixture-verified (no fixture carries `instructions`) and is covered by unit tests
      only — this gap is stated explicitly, not glossed.
- [ ] Existing `CardField` consumers (DecisionView, DecisionSummaryCard, GovernanceShell) unchanged

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The description/instructions strings come from
  `FieldFormDef` (WASM-sourced); TS only renders them.
- Verification Agent runs before final sign-off.

## Assumptions

- The `x-srs-description` / `x-srs-instructions` type-schema keys are already emitted by
  srs-rust (srs-rust#415) and mapped into `FieldFormDef` by `propertyToField` — verified by
  #176's shipped code and `tests/blueprint-utils.test.ts`. No srs-rust dependency.
- The read view's visual language (mono uppercase label, sans body) differs from the editor, so
  the CSS is card-scoped rather than reusing `.field__*` classes verbatim; the interaction and
  accessibility contract is identical.
