# Plan: Extract FieldInput.svelte primitive (srs-web#61)

## Summary

The 3-branch field widget dispatch (`text → Textarea | select+options → Select | default → Input`) is copy-pasted verbatim in three locations across `SectionForm.svelte` (flat field loop and group entry field loop) and `RecordForm.svelte` (flat field loop). A commit this week had to apply the same `options?.length` guard to all three sites. This plan extracts the dispatch into a `FieldInput.svelte` primitive so future field-type additions require one change instead of three.

## Agent Assignments

| Role | Agent |
|---|---|
| Web App Worker | — |
| Verification | — |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS — `FieldInput` is presentation-only dispatch | accepted |

No new ADR required — this is a refactor that reduces duplication, with no new contract or constraint introduced.

---

## Contracts

### WASM API surface

No new or changed WASM methods required. `FieldInput.svelte` is purely a presentation-layer component dispatching between existing UI primitives (`Input`, `Textarea`, `Select`).

### TypeScript types

`FieldInput` accepts `def: FieldFormDef` (from `$lib/governance/types.js`) which is already used at all three call-sites. No new type contracts.

```typescript
// FieldInput.svelte props (Svelte 5 runes)
// def: FieldFormDef — import directly from $lib/governance/types.js (not from the barrel)
// value: string (bindable)
// id: string
// disabled?: boolean (default false)
// rows?: number (default 4) — forwarded to Textarea only; ignored by Input and Select branches
```

**Important:** `FieldInput` is a render-dispatch component only. It must not absorb the `select` defaulting logic from `computeInitialValues` (RecordForm) or `initialFields` (SectionForm). Those parent-component helpers default a `select` field to its first option on initialisation — that logic must stay in the parent. `FieldInput` only renders; it does not initialise or default values.

---

## Scope

- Extract `FieldInput.svelte` to `src/lib/components/` accepting `def: FieldFormDef`, bindable `value: string`, `id: string`, `disabled: boolean`, `rows?: number` (default 4).
- Replace the three duplication sites in `SectionForm.svelte` (lines ~203–210 and ~282–289) and `RecordForm.svelte` (lines ~89–110).
- Export `FieldInput` from `src/lib/components/index.ts`.

**Out of scope:**

- Any change to `FieldFormDef` types or WASM API shape.
- Adding new field types (date picker, rich-text).
- Drag-to-reorder (#40), lifecycle UI (#86), or any other open issue.

---

## Phases

### Phase 1: Create FieldInput.svelte and replace duplication sites

**Goal:** All three widget-dispatch blocks replaced by `<FieldInput>` calls; `npm run typecheck`, `npm run lint`, and `npm run build` all pass.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/FieldInput.svelte` with:
  - Props: `def: FieldFormDef`, bindable `value: string`, `id: string`, `disabled: boolean`, `rows?: number` (default `4`).
  - Dispatch: `if valueType === "text"` → `<Textarea rows={rows}>`, `else if valueType === "select" && def.options?.length` → `<Select options={def.options}>`, `else` → `<Input>`.
- [ ] Export `FieldInput` from `src/lib/components/index.ts`.
- [ ] Replace site 1 in `SectionForm.svelte` flat field loop (~L203–210): `<FieldInput def={def} bind:value={fieldValues[def.fieldId]} id={inputId} disabled={saving} />` (rows default 4).
- [ ] Replace site 2 in `SectionForm.svelte` group entry field loop (~L282–289): `` <FieldInput def={f} bind:value={entry[f.fieldId]} id={`g-${g.groupId}-${i}-${f.fieldId}`} disabled={saving} rows={3} /> `` — note `rows={3}` (group entries are narrower) and the compound id must match the surrounding `<Field id={...}>` for `<label for>` association.
- [ ] Replace site 3 in `RecordForm.svelte` flat field loop (~L89–110): `<FieldInput def={def} bind:value={fieldValues[def.fieldId]} id={inputId} disabled={saving} />` (rows default 4).
- [ ] Remove unused `Input`, `Textarea`, `Select` imports from `SectionForm.svelte` and `RecordForm.svelte` if no longer needed.

#### Acceptance Criteria

- [ ] `grep -rn "valueType === \"text\"\|valueType === 'text'" src/lib/guides/SectionForm.svelte src/lib/components/RecordForm.svelte` returns 0 matches (dispatch removed from both files).
- [ ] `src/lib/components/FieldInput.svelte` exists and the dispatch lives there.
- [ ] `FieldInput` exported from `index.ts`.
- [ ] `grep -n 'rows={3}' src/lib/guides/SectionForm.svelte` shows `rows={3}` on the `FieldInput` group-entry call (confirming the narrower group rows are preserved).
- [ ] `npm run typecheck` passes with 0 errors.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm test` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

---

## Final Acceptance

- [ ] All Phase 1 acceptance criteria met.
- [ ] `grep -rn "valueType === \"text\"" src/` returns only `FieldInput.svelte` (no remnants in call-sites).
- [ ] Manual smoke-test: RecordForm field rendering unchanged in the running app.
