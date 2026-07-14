# Plan: Show field description + instructions in the record editors

## Summary

The governance decision fields now carry human `description` and `instructions` text (srs#132), and
the `type schema` projection emits them as `x-srs-description` / `x-srs-instructions` vendor keys
(srs-rust#415, merged, on `main`'s WASM binding). But the record editors still render only a field's
label — the authored guidance never reaches a participant filling in a decision log. This plan makes
each field's **description visible inline** as help text and its fuller **instructions reachable via
an ⓘ affordance** next to the label, across **both** editor surfaces (governance `RecordForm` and
guides `SectionForm`, which share `Field.svelte`). It is pure presentation over data the WASM engine
already returns — no new binding, no SRS semantics in TS (ADR-001). Delivers the "surface
instructions in the editor UI" remaining item of the participant story muDemocracy.org#105 (now
Must → P0).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | self |
| Web App Worker | self — `srs-web/**` |
| Verification | Verification Agent (Stage 7) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client; zero SRS semantics in TS. This plan only reads WASM-emitted keys and renders them — no new semantics. | accepted |

No new ADR: this is presentation of existing `type schema` output. The `x-srs-*` key contract is
owned upstream by srs-rust **ADR-026** (`type-schema-field-help-keys`, merged; renumbered from the
draft ADR-023). The ⓘ presentation was chosen by the requester during planning — no design-decision
pause outstanding.

---

## Contracts

### WASM API surface

No new or changed WASM methods. `type_schema` already exists (`src/lib/srs-client.ts`) and its
output now carries `x-srs-description` / `x-srs-instructions` (srs-rust#415, PR #452). Requires the
WASM binding built from srs-rust **`master`** at/after PR #452 (srs-rust's default branch is
`master`, not `main`) — obtained via `npm run fetch-bindings` (release artifact) during Stage
4/dogfood.

### TypeScript types

Extend the hand-maintained `SchemaProperty` interface (`src/lib/srs-client.ts`) with the two optional
keys, and `FieldFormDef` (`src/lib/governance/types.ts`) with `description?` / `instructions?`. These
mirror existing keys already modelled the same way (`x-srs-ai-guidance`, `x-srs-widget`).

---

## Scope

- Model the two projected keys in the client:
  - `SchemaProperty` (`src/lib/srs-client.ts`): add `"x-srs-description"?: string` and
    `"x-srs-instructions"?: string`.
  - `FieldFormDef` (`src/lib/governance/types.ts`): add `description?: string` and
    `instructions?: string`.
  - `propertyToField` (`src/lib/guides/blueprint-utils.ts:52`): populate both from the props,
    `|| undefined` (matching the `aiGuidance` pattern). This is the **shared** mapper — both
    `definitionToFields` (line 76, scalar fields) and `definitionToGroups` (line 103, group
    sub-fields) delegate to it, so grouped fields (SectionForm) inherit the keys for free; no
    separate mapper exists or needs extending.
- Enhance the shared frame `Field.svelte` (`src/lib/components/Field.svelte`):
  - New props `description?: string`, `instructions?: string`.
  - Render `description` via the existing `.field__help` slot, **suppressed when it exactly equals
    `label`** (strict string equality, no trim; a field with no `displayLabel` already uses its
    description as the label, so `title`/`x-srs-description` are the identical string — see srs-rust
    ADR-026).
  - Add an accessible **ⓘ toggle** beside the label: `<button type="button" aria-expanded={open}
    aria-controls={instructionsId} aria-label="Show field instructions">` + local `$state`, that
    reveals `instructions` in a `<p class="field__instructions" id={instructionsId}>` block; only
    rendered when `instructions` is present. Native `title={instructions}` as a hover fallback.
  - Styles beside `.field__help` in `src/styles/components/field.css`.
- Forward the props at the three call sites: `RecordForm.svelte:86`, `SectionForm.svelte:200`, and
  the group sub-field sites `SectionForm.svelte:214` and `:269` (from their `meta`/`f` field objects).

**Out of scope:**

- Read-only render path (`RecordView.svelte` / `FieldValueView.svelte`) — editors only per the
  request. Trivial follow-up if wanted (same `FieldFormDef`).
- Showing `aiGuidance.purpose` in the editor (AI-facing; `FieldFormDef.aiGuidance` stays unused here).
- Any change to the projection / WASM (owned by srs-rust#415, done).

---

## Phases

### Phase 1: Plumb the two keys through the type pipeline

**Goal:** `FieldFormDef` carries `description` + `instructions` sourced from the schema, with no
behavioural UI change yet.

**Agent:** Web App Worker

#### Tasks

- [x] `src/lib/srs-client.ts`: add `"x-srs-description"?: string` and `"x-srs-instructions"?: string`
  to `SchemaProperty`.
- [x] `src/lib/governance/types.ts`: add `description?: string` and `instructions?: string` to
  `FieldFormDef`.
- [x] `src/lib/guides/blueprint-utils.ts` `propertyToField`: set
  `description: prop["x-srs-description"] || undefined` and
  `instructions: prop["x-srs-instructions"] || undefined`. Verify the group sub-field mapper in the
  same file populates them too (grep for the second `label: prop.title` mapping; extend if separate).

#### Acceptance Criteria

- [x] `npm run typecheck` passes with the new optional fields.
- [x] A unit test proves the mapping sets both keys when present and yields `undefined` when absent,
  for **both** scalar fields (`definitionToFields`) and group sub-fields (`definitionToGroups`,
  exercised by the existing grouped-field test at `blueprint-utils.test.ts:191`).

#### Testing

```bash
npm run typecheck
npm test -- blueprint-utils
```

- `definitionToFields/Groups map x-srs-description/instructions` — present → set; absent → undefined;
  covering the grouped path via the existing `definitionToGroups` test fixture.

#### Milestone gate

`npm run typecheck` + `npm run build` pass; plan checkboxes updated; commit
`feat(editor): plumb field description + instructions into FieldFormDef (#176)`.

### Phase 2: Render description inline + instructions via ⓘ

**Goal:** Both editor surfaces show the description as help and reveal instructions through the ⓘ.

**Agent:** Web App Worker

#### Tasks

- [ ] `Field.svelte`: add `description`/`instructions` props; render description in `.field__help`
  (skip when `description === label`); add the ⓘ toggle + `.field__instructions` reveal block; wire
  `title={instructions}`.
- [ ] `src/styles/components/field.css`: styles for the ⓘ button and `.field__instructions`
  (muted, consistent with `.field__help`).
- [ ] Forward props at `RecordForm.svelte:86`, `SectionForm.svelte:200`, `:214`, `:269`.

#### Acceptance Criteria

- [ ] Each field shows its description as help; ⓘ appears only where instructions exist and toggles
  the fuller text; no duplicate description when a field lacks a `displayLabel`.
- [ ] Governance `RecordForm` and guides `SectionForm` behave identically (shared frame).
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm run build && npm test
```

- A `Field.svelte` component test (harness has `@testing-library/svelte` + `svelteTesting()` in
  `vitest.config.ts`; precedent `tests/GovernanceShell.test.ts`) asserting: description rendered;
  description suppressed when strictly equal to label; ⓘ present iff instructions exist; toggling ⓘ
  flips `aria-expanded` and reveals the instructions text. Fallback only if genuinely unworkable:
  an e2e assertion in the guides-editor spec.

#### Milestone gate

All gates green; plan checkboxes updated; commit
`feat(editor): show field description inline + instructions via info toggle (#176)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes (no regression in existing editor/guides specs)
- [ ] WASM loads against `gallery.srsj`; opening a decision record shows descriptions inline and ⓘ
  reveals instructions on fields that have them

## Coordination Rules

- Web App Worker keeps to `srs-web/**`.
- No SRS semantics in TS (ADR-001): only read WASM-emitted keys and render.
- Phase 2 depends on Phase 1 (needs `FieldFormDef.description/instructions`).

## Assumptions

- The fetched WASM binding is built from srs-rust `master` ≥ PR #452, so `type_schema` emits the two
  keys. `npm run fetch-bindings` retrieves the current release artifact.
- `gallery.srsj` (or the governance fixture) contains fields with authored `description`/
  `instructions` to exercise the ⓘ; if not, the dogfood step notes it and uses a governance repo.
