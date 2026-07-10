# Plan: Retire hardcoded FIELD_NAMES map in field-utils.ts (srs-web#68)

## Summary

`src/lib/governance/field-utils.ts` contains `FIELD_NAMES`, a hardcoded map of field UUIDs to snake_case names, used by `getStringField()` for sidebar title display in `App.svelte` and three `lib/components/` files. `srs-web#55` introduced the `fieldMeta` context (a `Map<fieldId, FieldFormDef>` built from `typeSchema()` at load time), which already carries this information from the WASM engine. This plan removes `FIELD_NAMES` and sources the lookup from `fieldMeta`, eliminating a synchronisation hazard between the hardcoded map and the actual package type definitions.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude (this pipeline) |
| Web App Worker | Phase 1 |
| Verification | Final Acceptance |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TS — field metadata sourced from WASM typeSchema(), not hardcoded | accepted |

No new ADR required. The field-meta context pattern is display plumbing already established in #55; this plan extends it to the remaining `lib/components/` call sites.

**Note on ADR-005:** ADR-005 is superseded by ADR-006; no longer cited. ADR-001 is the governing constraint for field metadata sourcing.

**Note on parameter order:** `getStringField` and `getFieldValue` updated to signature `(record, fieldName, fieldMeta)` — `fieldMeta` last, matching the established convention in `src/rendering/field-helpers.ts` (`getFieldValueByName(record, name, fieldMeta)`).

**Note on implementation:** `rendering/field-helpers.ts` already implements the same lookup loop. However, importing it from `lib/governance/` would invert the dependency graph (`rendering/` imports from `lib/governance/types.js`). The lookup is re-implemented inline in `field-utils.ts` — a short two-line body that is an acceptable duplication given the layering constraint.

**Note on Svelte context inheritance:** Svelte `setContext`/`getContext` is inherited through the entire component tree. `DecisionSummaryCard`, `SuccessorModal`, and `DecisionLogView` are all rendered (directly or transitively) inside `App.svelte`, so each can call `getFieldMetaContext()` independently — no prop-passing required.

**Note on Svelte 5 getContext pattern (#83):** `getContext` must be called at component init, not inside `$derived`. The correct pattern is the two-liner: `const _fieldMetaCtx = getFieldMetaContext(); const fieldMeta = $derived(_fieldMetaCtx.meta);`. Do NOT use `const fieldMeta = $derived(getFieldMeta())` — `getFieldMeta()` is deprecated as of #83.

---

## Contracts

### WASM API surface

No new or changed WASM methods required. This plan uses the existing `typeSchema()` binding and the `fieldMeta` context already set up in `App.svelte`.

### TypeScript types

`FieldFormDef` (from `src/lib/governance/types.ts`) has `name: string` (snake_case property name) and `fieldId: string`. These are already the types used by `field-meta.ts` — no type changes.

---

## Scope

- Update `getStringField` and `getFieldValue` in `src/lib/governance/field-utils.ts` to accept `fieldMeta: Map<string, FieldFormDef>` as their first parameter, implementing the lookup via the schema-derived map rather than `FIELD_NAMES`.
- Remove `FIELD_NAMES` from `field-utils.ts`.
- Update all callers:
  - `src/App.svelte` — already has `fieldMetaMap` from `$derived(buildFieldMetaMap(sectionSchemas))`.
  - `src/lib/components/DecisionSummaryCard.svelte` — add `getFieldMeta()` call.
  - `src/lib/components/SuccessorModal.svelte` — add `getFieldMeta()` call.
  - `src/lib/components/DecisionLogView.svelte` — add `getFieldMeta()` call.

**Out of scope:**

- The rendering-layer helpers in `src/rendering/field-helpers.ts` (already schema-derived, no change needed).
- Any change to the WASM API or `typeSchema()` binding.
- Changes to `DecisionLogView.svelte` logic beyond replacing the `getStringField` call.

---

## Phases

### Phase 1: Replace FIELD_NAMES with fieldMeta lookup

**Goal:** `FIELD_NAMES` is deleted; all callers pass `fieldMeta`; `npm run typecheck` passes.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/governance/field-utils.ts`:
  - Add `import type { FieldFormDef } from './types.js';`
  - Change `getFieldValue(record, fieldName)` → `getFieldValue(record: SrsRecord, fieldName: string, fieldMeta: Map<string, FieldFormDef>): unknown` — iterate `fieldMeta` to find the `def` where `def.name === fieldName`, then return the value from `record.fieldValues` for `def.fieldId`. (Iterate the Map, not the record — opposite direction from the old FIELD_NAMES approach.)
  - Change `getStringField(record, fieldName)` → `getStringField(record: SrsRecord, fieldName: string, fieldMeta: Map<string, FieldFormDef>): string | undefined`.
  - Delete the `FIELD_NAMES` constant and its comment block.
  - Note: `fieldMeta` last — matches the `getFieldValueByName(record, name, fieldMeta)` convention in `src/rendering/field-helpers.ts`.

- [ ] In `src/App.svelte`:
  - Update all 5 `getStringField(record, ...)` → `getStringField(record, ..., fieldMetaMap)`.

- [ ] In `src/lib/components/DecisionSummaryCard.svelte`:
  - Add `import { getFieldMetaContext } from '$lib/governance/field-meta.js';`
  - Add the two-liner at init (not inside $derived): `const _fieldMetaCtx = getFieldMetaContext(); const fieldMeta = $derived(_fieldMetaCtx.meta);`
  - Update the 3 `getStringField(record, name)` → `getStringField(record, name, fieldMeta)`.

- [ ] In `src/lib/components/SuccessorModal.svelte`:
  - Add `import { getFieldMetaContext } from '$lib/governance/field-meta.js';`
  - Add the two-liner at init: `const _fieldMetaCtx = getFieldMetaContext(); const fieldMeta = $derived(_fieldMetaCtx.meta);`
  - Update `getStringField(record, name)` → `getStringField(record, name, fieldMeta)`.

- [ ] In `src/lib/components/DecisionLogView.svelte`:
  - Add `import { getFieldMetaContext } from '$lib/governance/field-meta.js';`
  - Add the two-liner at init: `const _fieldMetaCtx = getFieldMetaContext(); const fieldMeta = $derived(_fieldMetaCtx.meta);`
  - Update both `getStringField(r, name)` → `getStringField(r, name, fieldMeta)`.

#### Acceptance Criteria

- [ ] `grep -r "FIELD_NAMES" src` returns empty.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria checked.
2. `npm run typecheck` and `npm run build` pass.
3. Mark task checkboxes `[x]`.
4. Commit: `refactor(field-utils): retire FIELD_NAMES — source from fieldMeta context (#68)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `grep -r "FIELD_NAMES" src` returns empty
- [ ] No import of `FIELD_NAMES` anywhere in `src/`
- [ ] `getStringField` and `getFieldValue` accept `fieldMeta` as first parameter

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). Field name lookup must use `fieldMeta` from WASM `typeSchema()`, not hardcoded maps.

## Assumptions

- `DecisionSummaryCard.svelte`, `SuccessorModal.svelte`, and `DecisionLogView.svelte` in `lib/components/` are always rendered as descendants of `App.svelte`, so `getFieldMeta()` context is available.
- `fieldMetaMap` in `App.svelte` is non-empty by the time the record list renders (it is derived from `sectionSchemas` which is populated at load time).
