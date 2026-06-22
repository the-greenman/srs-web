# Plan: Render select fields as a dropdown in SectionForm

## Summary

`select`-type fields (e.g. the section `theme` variant, `com.mudemocracy/theme`) currently render
as a free-text `Input` inside the guides section editor, so authors must type the variant name
exactly with no discoverability and no typo protection. The dropdown plumbing already exists —
`FieldFormDef.options`, `blueprint-utils` mapping `enum`/`allowedValues` → `options` +
`valueType: "select"`, a `Select.svelte` component, and a first-option default in `initialFields()`.
`RecordForm.svelte` already renders selects via `Select`; only `SectionForm.svelte` is missing the
`select` branch — in **two** places (flat fields and generic group entries). This plan adds that
branch and makes the three render sites consistent.

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
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TS. Options come from schema-derived `allowedValues`/`enum` via `blueprint-utils`; nothing is hardcoded. | Accepted |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | The composite authoring surface is driven by the blueprint schema; per-type fields render with the B9 form components. This change keeps the `select` widget choice schema-derived. | Accepted |

No new ADR is required: this introduces no new constraint, public API, payload contract, or
cross-crate dependency. It is a render-branch addition fully governed by ADR-001/ADR-003.

---

## Contracts

### WASM API surface

No new or changed WASM methods. The `select` valueType and its `options` are already produced by
`blueprint-utils.ts` (`propertyToField` maps `prop.enum` → `valueType: "select"`, `options`) and by
the static `GOVERNANCE_FORMS` (`STATUS_OPTIONS`). **No srs-rust dependency.**

### TypeScript types

No changes. `FieldFormDef` already carries `options?: string[]` and `valueType: "...| select"`.

---

## Scope

In scope:

- Add a `select` render branch to `SectionForm.svelte` flat-field renderer (~L202-207).
- Add the same branch to `SectionForm.svelte` generic group-entry renderer (~L279-283).
- Make the `select` branch fall back to `Input` when `options` is empty, and apply the same
  `options?.length` guard to the existing `RecordForm.svelte` select branch. The current RecordForm
  branch renders `<Select options={def.options ?? []}>` unconditionally, so an optionless select
  produces an **empty dropdown** — this is a pre-existing bug corrected here, not merely cosmetic
  symmetry. After the fix all three sites have identical defensive select-then-Input logic.
- Add an e2e assertion in `e2e/guides-editor.spec.ts` that the section form renders the `theme`
  field (`com.mudemocracy/theme`, field id `cf0ab5be-de33-4c41-9cf8-f61af4842eb7`, options
  `["default","inverted","highlight"]`, assigned to every section type via base `section`) as a
  `<select>` combobox containing those options — confirmed present in `e2e/fixtures/muSrs.srsj`.

**Out of scope:**

- `multiselect` valueType (not present in `FieldFormDef.valueType` union; would need its own widget).
- Any change to `Select.svelte`, `blueprint-utils.ts`, or `form-schema.ts` (already correct).
- Validation of the chosen value (stays in WASM per ADR-001).

---

## Phases

### Phase 1: Add the select branch to SectionForm and unify render sites

**Goal:** Every form render site (RecordForm flat, SectionForm flat, SectionForm group entry)
renders a `select` field as a `<select>` dropdown when options exist, and falls back to a text
`Input` when options are empty.

**Agent:** Web App Worker

#### Tasks

- [ ] Import `Select` into `SectionForm.svelte`.
- [ ] Flat-field renderer: add `{:else if def.valueType === "select" && def.options?.length}` →
  `<Select options={def.options} bind:value disabled>` before the `{:else} <Input>` fallback.
- [ ] Group-entry renderer: add the same branch using `f`/`entry[f.fieldId]`.
- [ ] `RecordForm.svelte`: add the `&& def.options?.length` guard to the existing select branch.
  This fixes a pre-existing bug (optionless select currently renders an empty `<select>`); after the
  fix it falls back to `Input`, matching SectionForm.
- [ ] Add the e2e assertion in `e2e/guides-editor.spec.ts` for the `theme` select combobox.

#### Acceptance Criteria

- [ ] A section field with `valueType: "select"` and non-empty `options` renders a `<select>`.
- [ ] A `select` field with empty `options` renders a text `Input` (no empty dropdown).
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm run e2e -- guides-editor   # theme select field is in muSrs.srsj fixture (confirmed)
```

#### Milestone gate

1. Verify acceptance criteria.
2. `npm run typecheck`, `npm run lint`, and `npm run build` pass.
3. Mark task checkboxes `[x]`.
4. Commit referencing the issue (`... (#46)`).

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Select fields render as dropdowns in both SectionForm sites and RecordForm
- [ ] Empty-options select degrades to a text Input across all three sites

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The widget choice is schema-derived.

## Assumptions

- `multiselect` is not yet in the `FieldFormDef.valueType` union and is out of scope (tracked
  separately if needed).
- CI runs typecheck + lint only; build and e2e are run locally as part of this pipeline.
