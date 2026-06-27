# Plan: Assert x-srs-field-id presence in blueprint-utils.ts

> Issue: [srs-web#73](https://github.com/the-greenman/srs-web/issues/73)

## Summary

`propertyToField()` in `src/lib/guides/blueprint-utils.ts` silently falls back to a snake_case property name when `x-srs-field-id` is absent from a schema property. If WASM `typeSchema()` or `blueprintSchema()` output ever omits this extension, `createRecord` receives a snake_case string instead of a UUID, causing silent data loss or WASM rejection. This plan replaces the silent fallback with a loud assertion that fails early and clearly.

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
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TS — field IDs must come from WASM schema, never be synthesised | accepted |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | Blueprint schema drives the composite authoring surface; `definitionToFields` / `definitionToGroups` are the conversion layer — this assertion enforces the schema-driven contract ADR-003 depends on | accepted |

No new ADR required. Throwing on missing `x-srs-field-id` is a defensive guard against schema contract violations, not an architectural constraint.

---

## Contracts

### WASM API surface

**No new or changed WASM method required.** The fix is purely in TypeScript — it asserts a postcondition of the existing WASM `blueprintSchema()` / `typeSchema()` output.

### TypeScript types

`SchemaProperty` in `src/lib/srs-client.ts` marks `x-srs-field-id` as optional (`?`). This is correct — it describes the WASM output type faithfully. The assertion lives in `propertyToField`, not in the type definition.

---

## Scope

- Replace `prop["x-srs-field-id"] ?? name` with a guard that throws a descriptive error when `x-srs-field-id` is absent.
- Add unit tests in `tests/blueprint-utils.test.ts` confirming the assertion fires on missing field ID and that normal paths still work.

**Out of scope:**

- Changing the WASM service to guarantee `x-srs-field-id` is always emitted (separate srs-rust concern).
- Changing `SchemaProperty` to mark `x-srs-field-id` as required (would break the TS contract with WASM output).
- `GuidesShell.svelte` lines 323 and 332: these are intentional `?? null` sites. They look up `x-srs-field-id` by named property (`title`, `heading`) for display-label derivation only — the results are used in `guideLabel()` / `sectionLabel()` which gracefully fall back to `fieldValues[0]` when null. No SRS record mutation is involved, so no assertion is warranted there.
- Pre-existing: `labelForTypeId()` in `blueprint-utils.ts` hardcodes four muDemocracy type UUIDs to produce friendly labels. This is a display concern that warrants a follow-up ADR-001 review but is out of scope here.

---

## Phases

### Phase 1: Add assertion + unit tests

**Goal:** `propertyToField` throws a descriptive error when `x-srs-field-id` is absent; unit tests verify the throw and the happy path.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/guides/blueprint-utils.ts`, replace the `fieldId` line in `propertyToField`:
  ```ts
  // Before:
  fieldId: prop["x-srs-field-id"] ?? name,
  // After — also applies inside definitionToGroups (item field mapping):
  fieldId: requireFieldId(prop["x-srs-field-id"], name),
  ```
  Add the helper before `propertyToField`:
  ```ts
  function requireFieldId(fieldId: string | undefined, propertyName: string): string {
    if (!fieldId) {
      throw new Error(
        `[blueprint-utils] x-srs-field-id missing on schema property "${propertyName}". ` +
        `The WASM typeSchema/blueprintSchema output must include x-srs-field-id on every field property.`
      );
    }
    return fieldId;
  }
  ```
- [ ] Create `tests/blueprint-utils.test.ts` with:
  - A test that `propertyToField` (via `definitionToFields`) throws when `x-srs-field-id` is absent.
  - A test that `definitionToFields` succeeds when `x-srs-field-id` is present (happy path).
  - A test that `definitionToGroups` throws when an item property is missing `x-srs-field-id`.

#### Acceptance Criteria

- [ ] `definitionToFields` throws with a message containing `x-srs-field-id` when a property omits it.
- [ ] `definitionToFields` returns correct `FieldFormDef[]` when all properties have `x-srs-field-id`.
- [ ] `definitionToGroups` throws when a group item property omits `x-srs-field-id`.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes (all unit tests green).

#### Testing

```bash
npm run typecheck
npm test
```

#### Milestone gate

1. All acceptance criteria checked.
2. `npm run typecheck` and `npm test` pass.
3. Commit: `fix(blueprint-utils): assert x-srs-field-id presence, throw on missing (#73)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (including new blueprint-utils tests)
- [ ] `npm run e2e` passes (no regression in guided capture / guide editor flows)

## Assumptions

- `x-srs-field-id` is always populated by the WASM engine for valid schemas. The throw surfaces a contract violation, not a normal path.
- The `SchemaProperty` type in `srs-client.ts` stays optional (`?`) — it faithfully represents what WASM can emit; the assertion is downstream.
