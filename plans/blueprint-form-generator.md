# Plan: Blueprint-schema-driven form generator (replace GOVERNANCE_FORMS)

## Summary

`src/lib/governance/form-schema.ts` hard-codes every governance type's field definitions as static TypeScript objects (`GOVERNANCE_FORMS`). This duplicates the SRS type schema and drifts over time. `typeSchema()` (added in srs-web#52) already projects a Type's field definitions from the loaded repo into a draft-07 JSON Schema decorated with `x-srs-*` hints. `definitionToFields()` in `blueprint-utils.ts` already converts that schema into `FieldFormDef[]`. This plan wires them together: at repo load time, derive one `TypeFormDef` per governance section from `typeSchema()`, cache it in reactive state, and pass it to `RecordForm` and `RecordReading` — then delete `form-schema.ts` entirely.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Orchestrating agent |
| Web App Worker | Orchestrating agent |
| Verification | Verification Agent (srs-web) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | Blueprint/type schema drives authoring forms | accepted |
| ADR-005 (proposed) | typeIds for governance sections live in SECTIONS config | proposed |

### ADR-005 rationale

`typeSchema(repo, typeId)` requires a typeId to call. There is no governance blueprint in the gallery package; the blueprint↔view join (ADR-004) cannot be used. The stable typeIds from the gallery package are **structural config** (the same UUIDs already in `GOVERNANCE_FORMS`); moving them to `SECTIONS` is not SRS semantics (ADR-001 compliant). This is the minimal change that enables runtime schema derivation without a new WASM binding.

---

## Contracts

### WASM API surface

**No new WASM binding required.** `typeSchema(repo, typeId, typeVersion?)` is already exposed in `srs-client.ts` (srs-web#52). It returns `TypeSchemaResult { schema: Record<string, unknown>, diagnostics: string[] }` where `schema` is a draft-07 JSON Schema matching the `SchemaDefinition` interface.

### TypeScript types

- `FieldFormDef` and `TypeFormDef` currently live in `src/lib/governance/form-schema.ts`. They must be moved to `src/lib/governance/types.ts` so `form-schema.ts` can be deleted.
- All existing importers must be updated (see Phase 1 task list).
- `SECTIONS` gains optional `typeId?: string` and `typeVersion?: number` per entry. Entries without `typeId` (exercises) remain read-only.

---

## Scope

- Delete `src/lib/governance/form-schema.ts` (hardcoded `GOVERNANCE_FORMS` and its interfaces).
- Move `FieldFormDef` and `TypeFormDef` interfaces to `src/lib/governance/types.ts`.
- Extend `SECTIONS` entries in `src/lib/governance/sections.ts` with `typeId` and `typeVersion` for article, decision, and role.
- In `App.svelte`: derive `TypeFormDef` per section at repo load time via `typeSchema()` + `definitionToFields()`; cache in `sectionSchemas` reactive state; replace all `GOVERNANCE_FORMS[...]` with `sectionSchemas[...]`.
- Fix the hardcoded decision typeId in the `DecisionFlow` onSave callback in App.svelte. (Superseded by srs-web#103: `DecisionFlow` is now dead code; this item was completed differently.)
- Update all import paths for `FieldFormDef` and `TypeFormDef`.

**Out of scope:**

- Changing `RecordForm.svelte` or `RecordReading.svelte` props or rendering logic.
- Adding type schema support to `DecisionFlow.svelte`'s own internal field rendering (it still manages its own fields). (Moot as of srs-web#103: `DecisionFlow` is dead code.)
- The exercise section editor (no exercise type exists in gallery.srsj; remains read-only).
- New WASM bindings, e2e fixture changes, or changes to srs-rust.

---

## Phases

### Phase 1: Move interfaces + extend SECTIONS

**Goal:** All TypeScript consumers import `FieldFormDef`/`TypeFormDef` from the new `$lib/governance/types.ts`; `SECTIONS` carries typeId+typeVersion for the three known types; `form-schema.ts` is deleted.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/governance/types.ts` containing the `FieldFormDef` and `TypeFormDef` interfaces (verbatim from `form-schema.ts`, minus `GOVERNANCE_FORMS` and `STATUS_OPTIONS`).
- [ ] Update `src/lib/guides/blueprint-utils.ts`: change `import type { FieldFormDef } from "$lib/governance/form-schema.js"` → `"$lib/governance/types.js"`.
- [ ] Update `src/lib/guides/SectionForm.svelte`: same import path change for `FieldFormDef`.
- [ ] Update `src/lib/guides/GuidesShell.svelte`: change `import type { TypeFormDef } from "$lib/governance/form-schema.js"` → `"$lib/governance/types.js"`.
- [ ] Update `src/lib/components/RecordForm.svelte`: change import path for `TypeFormDef` (and `FieldFormDef` if present) → `"$lib/governance/types.js"`.
- [ ] Update `src/lib/components/RecordReading.svelte`: change import path for `TypeFormDef` → `"$lib/governance/types.js"`.
- [ ] Update `src/App.svelte` line 56: change `import type { TypeFormDef } from "$lib/governance/form-schema.js"` → `"$lib/governance/types.js"`.
- [ ] Extend `src/lib/governance/sections.ts`: add `typeId` and `typeVersion` to the article, decision, and role entries:
  - `articles`: `typeId: "a1142ac3-5385-5c0e-8630-1dd3432cdf7f"`, `typeVersion: 1`
  - `decisions`: `typeId: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3"`, `typeVersion: 1`
  - `roles`: `typeId: "e53dce11-6b83-5714-a8fe-f730edb500fa"`, `typeVersion: 1`
  - `exercises`: omit `typeId` (exercises has no type in the gallery package)
  - Update the `SectionKey` export if needed; add `typeId?: string; typeVersion?: number` to the const entries.
- [ ] Delete `src/lib/governance/form-schema.ts`.

#### Acceptance Criteria

- [ ] `npm run typecheck` passes — no import errors for `FieldFormDef` or `TypeFormDef`.
- [ ] `grep -r "form-schema" src/` returns empty.
- [ ] `grep -r "GOVERNANCE_FORMS" src/` returns only `App.svelte` (still used there until Phase 2).

#### Milestone gate

Run `npm run typecheck && npm run lint && npm run build` — all must pass before Phase 2.
Commit: `refactor: move TypeFormDef/FieldFormDef to governance/types, extend SECTIONS with typeIds (#53)`

---

### Phase 2: Runtime schema derivation in App.svelte

**Goal:** `App.svelte` loads `TypeFormDef` for each section at repo load time from `typeSchema()`; all `GOVERNANCE_FORMS` references are removed.

**Agent:** Web App Worker

#### Tasks

- [ ] In `App.svelte` `<script>` imports:
  - Add `typeSchema` and `SchemaDefinition` to the import from `"$lib/srs-client.js"`.
  - Add `definitionToFields` import from `"$lib/guides/blueprint-utils.js"`.
  - Remove `import { GOVERNANCE_FORMS }` from `"$lib/governance/form-schema.js"`.
  - Keep `import type { TypeFormDef }` but source it from `"$lib/governance/types.js"` (done in Phase 1).
- [ ] Add reactive state: `let sectionSchemas = $state<Record<string, TypeFormDef>>({})`.
- [ ] Add helper function `buildSectionSchemas(loadedRepo: SrsRepository): Record<string, TypeFormDef>`:
  ```ts
  function buildSectionSchemas(loadedRepo: SrsRepository): Record<string, TypeFormDef> {
    const result: Record<string, TypeFormDef> = {};
    for (const section of SECTIONS) {
      if (!section.typeId) continue;
      try {
        const { schema } = typeSchema(loadedRepo, section.typeId, section.typeVersion);
        result[section.key] = {
          typeId: section.typeId,
          typeVersion: section.typeVersion ?? 1,
          typeNamespace: section.typeNamespace,
          typeName: section.typeName,
          label: section.label,
          fields: definitionToFields(schema as SchemaDefinition),
        };
      } catch {
        // Section stays read-only if the type is absent from the loaded repo.
      }
    }
    return result;
  }
  ```
- [ ] In `loadDocument()`: after `loadSectionRecords(repo)`, add `sectionSchemas = buildSectionSchemas(repo)`.
- [ ] In `handleFormSave()`: replace `GOVERNANCE_FORMS[activeSection]` with `sectionSchemas[activeSection]` (check null before use).
- [ ] In `handleCreateSuccessor()`: replace `GOVERNANCE_FORMS[activeSection]` with `sectionSchemas[activeSection]`.
- [ ] In the template `{#snippet actions()}`: replace `GOVERNANCE_FORMS[activeSection]` guard and `.label` with `sectionSchemas[activeSection]`.
- [ ] In the template `{:else if formMode !== null && GOVERNANCE_FORMS[activeSection]}` condition: replace with `sectionSchemas[activeSection]`.
- [ ] In `<RecordForm>` `schema` prop: replace `GOVERNANCE_FORMS[activeSection] as TypeFormDef` with `sectionSchemas[activeSection]`.
- [ ] In `<RecordReading>` `schema` prop: replace `GOVERNANCE_FORMS[activeSection] as TypeFormDef` with `sectionSchemas[activeSection]`.
- [ ] Fix the hardcoded decision typeId in the `DecisionFlow` onSave callback (App.svelte line ~532):
  - Replace `"1fcad6a2-9f78-5e41-94ba-d82e88b822f3", 1` with `sectionSchemas["decisions"]?.typeId ?? SECTIONS.find(s => s.key === "decisions")!.typeId!, sectionSchemas["decisions"]?.typeVersion ?? 1`.
  - Or more simply: use `SECTIONS.find(s => s.key === "decisions")!` directly — `section.typeId!` and `section.typeVersion ?? 1` — since SECTIONS now carries these values and they're stable config.
- [ ] Remove any remaining `GOVERNANCE_FORMS` import from `App.svelte`.

#### Acceptance Criteria

- [ ] `grep -r "GOVERNANCE_FORMS" src/` returns empty.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm test` passes.
- [ ] Loading `gallery.srsj` renders Article, Decision, and Role sections with working create and edit forms.
- [ ] The Exercise Book section remains visible but shows no "New" button.
- [ ] The `DecisionFlow` onSave creates a Decision record correctly (no hardcoded UUID in App.svelte).

#### Milestone gate

Run `npm run typecheck && npm run lint && npm run build && npm test` — all must pass.
Commit: `feat: derive governance form schemas from typeSchema() at load time, remove GOVERNANCE_FORMS (#53)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes
- [ ] `grep -r "GOVERNANCE_FORMS" src/` empty
- [ ] `grep -r "form-schema" src/` empty
- [ ] Creating an Article, Decision, and Role record against `gallery.srsj` succeeds (forms render from typeSchema output)
- [ ] WASM loads without JS errors; `typeSchema` calls return without diagnostics

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). typeIds in SECTIONS are stable structural config from the gallery package, not semantic decisions.
- `definitionToFields()` from `blueprint-utils.ts` is the single field-extraction function — do not reimplement.
- Verification Agent runs after Phase 2 and before the PR.

## Assumptions

- `typeSchema(repo, typeId)` returns a schema matching `SchemaDefinition` interface (confirmed: same interface used in blueprint-utils.ts).
- The gallery.srsj fixture has article, decision, and role types with `x-srs-*` hints sufficient for `definitionToFields()` to produce non-empty field lists.
- The exercise type is absent from gallery.srsj (confirmed by fixture inspection); exercises remain read-only.
- `definitionToFields()` already handles all field-type hints needed (string, text/textarea, select/enum) — verified from blueprint-utils.ts source.
