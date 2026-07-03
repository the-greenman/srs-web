# Plan: Consume core displayLabel in governance record list (srs-web#91)

## Summary

The governance editor derives each record's display title client-side by reaching into
`record.fieldValues[]` and selecting a field by name — duplicating semantics already present
in the Rust core (`record_display_label`). This violates ADR-001. As of srs-rust#293 the WASM
`list_records` binding now returns `RecordSummary` objects (`{ instanceId, displayLabel, record }`)
where `displayLabel` carries the core-resolved label. This plan wires up that payload so
`GovernanceShell.svelte` and `DecisionSummaryCard.svelte` render the core label directly and no
longer re-derive titles from `fieldValues`.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Web App Worker | — |
| Verification | — |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |

No new ADR required — this change enforces the existing ADR-001 constraint by removing the
duplicated title-selection logic.

---

## Contracts

### WASM API surface

No new WASM binding required. `srs-rust#293` landed and changed the `list_records` binding to
return `RecordSummary[]` — `[{ instanceId: string, displayLabel: string, record: Record }]`.
The TypeScript wrapper in `srs-client.ts` must be updated to unwrap this shape. No srs-rust
issue needed.

### TypeScript types

- Add `displayLabel?: string` to the `SrsRecord` interface in `src/lib/srs-client.ts`.
- Update `listRecords()` to pull `displayLabel` from the WASM wrapper and attach it to the
  normalized `SrsRecord`. All callers continue to receive `SrsRecord[]` — no type change at
  call sites.
- The `get_record` binding returns a bare `Record` (not a `RecordSummary`), so `getRecord()`
  normalizes the same way as before; `displayLabel` will be absent/undefined for single-record
  fetches (acceptable — `getRecord` is used for edit forms, not list labels).
- **`displayLabel` optionality:** The Rust `record_display_label` always returns a non-empty
  string (falls back to `type_name` as last resort), so `displayLabel` is effectively always
  present in the WASM payload. The TS interface marks it `?` only because `getRecord()` doesn't
  provide it. Callers use `?? record.instanceId` / `?? "Untitled"` as a defensive fallback.

---

## Scope

**In scope:**

- `src/lib/srs-client.ts`: add `displayLabel?: string` to `SrsRecord`; update `normalizeRecord`
  caller in `listRecords()` to unwrap `{ instanceId, displayLabel, record }` and attach
  `displayLabel` to the resulting `SrsRecord`.
- `src/lib/governance/GovernanceShell.svelte:447-451`: replace the three-tier
  `getStringField("title") ?? getStringField("decision_statement") ?? record.instanceId` chain
  with `record.displayLabel ?? record.instanceId`.
- `src/lib/components/DecisionSummaryCard.svelte:24`: replace
  `getStringField(record, "title", fieldMeta) ?? "Untitled"` with
  `record.displayLabel ?? "Untitled"`.
- `tests/srs-client.test.ts`: add a unit test confirming `listRecords` returns `SrsRecord`
  objects with `displayLabel` populated from the WASM `RecordSummary` wrapper.

**Out of scope:**

- `src/lib/guides/GuidesShell.svelte` `guideLabel`/`sectionLabel` functions — they use
  schema-derived field IDs (not hardcoded field names) and are a separate anti-pattern to fix
  in a follow-on issue.
- Removing `getFieldValue`/`getStringField` from `field-utils.ts` — they remain for legitimate
  non-title presentation lookups (`status`, `article_number`, `decision_statement` body display).
- `getRecord()` single-record fetch — used for edit forms; no `displayLabel` needed there.

---

## Phases

### Phase 1: Update WASM normalizer in srs-client.ts

**Goal:** `listRecords()` returns `SrsRecord[]` where each element carries `displayLabel` from the
WASM-provided `RecordSummary` wrapper; existing callers compile unchanged.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `displayLabel?: string` to the `SrsRecord` interface in `src/lib/srs-client.ts`
  (after the `tags?: string[]` field, line ~93).
- [ ] In `srs-client.ts`, create a new internal function `normalizeRecordSummary(raw: any): SrsRecord`
  that:
  1. Checks if `raw.record` exists (the `RecordSummary` shape from srs-rust#293).
  2. If yes: calls `normalizeRecord(raw.record)` to get the inner record, then sets
     `result.displayLabel = raw.displayLabel ?? raw.display_label`.
  3. If no: logs `console.warn("list_records: unexpected bare Record shape; WASM contract may have changed", raw)` and falls back to `normalizeRecord(raw)` (with `displayLabel` undefined) so the app doesn't crash — but the warning surfaces the contract break immediately.
- [ ] Update `listRecords()` at line ~284 to call `raw.map(normalizeRecordSummary)` instead of
  `raw.map(normalizeRecord)`.
- [ ] Add unit tests in `tests/srs-client.test.ts` for the new `normalizeRecordSummary` path:
  1. **Happy path (camelCase):** mock `list_records` returning `[{ instanceId: "r1", displayLabel: "My Label", record: { instanceId: "r1", typeId: "t1", typeVersion: 1, fieldValues: [], tags: [] } }]`; assert `result[0].displayLabel === "My Label"` and `result[0].instanceId === "r1"`.
  2. **Snake_case variant:** mock returning `[{ instanceId: "r2", display_label: "Snake Label", record: { instanceId: "r2", typeId: "t1", typeVersion: 1, fieldValues: [], tags: [] } }]`; assert `result[0].displayLabel === "Snake Label"`.
  3. **Fallback (no wrapper):** mock returning a bare record `[{ instanceId: "r3", typeId: "t1", typeVersion: 1, fieldValues: [], tags: [] }]` (old shape); assert `result[0].displayLabel === undefined` and `result[0].instanceId === "r3"` (no throw).

#### Acceptance Criteria

- [ ] `SrsRecord.displayLabel` is populated after `listRecords()` when WASM returns the `RecordSummary` shape.
- [ ] `display_label` (snake_case) variant is also accepted.
- [ ] Bare-record (old) shape falls back gracefully with `displayLabel === undefined`.
- [ ] `npm run typecheck` passes.
- [ ] All existing and new tests in `tests/srs-client.test.ts` pass.

**Note:** Unit tests mock the WASM boundary directly; no WASM binary is needed for `npm test`.
The built WASM binary (`src/lib/srs_bindings/`) is required only at browser runtime.

#### Testing

```bash
npm run typecheck
npm run build
npm test -- tests/srs-client.test.ts
```

#### Milestone gate

Run `npm run typecheck && npm run build && npm test -- tests/srs-client.test.ts`.
All must pass before starting Phase 2. Commit: `feat(srs-client): unwrap RecordSummary displayLabel from list_records (#91)`.

---

### Phase 2: Consume displayLabel in GovernanceShell and DecisionSummaryCard

**Goal:** The two sites that derived titles client-side now render `record.displayLabel`; no
title-priority semantics remain in these components.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/governance/GovernanceShell.svelte`, replace lines 448-451:
  ```svelte
  {@const title =
    getStringField(record, "title", fieldMetaMap) ??
    getStringField(record, "decision_statement", fieldMetaMap) ??
    record.instanceId}
  ```
  with:
  ```svelte
  {@const title = record.displayLabel ?? record.instanceId}
  ```
- [ ] In `GovernanceShell.svelte`, remove the `getStringField` import at line 46 **only if**
  `getStringField` is no longer used anywhere else in the file. (Check: `getStringField` is also
  used at line 452 for `article_number` and line 453 for `status`; keep the import if still used.)
- [ ] In `src/lib/components/DecisionSummaryCard.svelte`, replace line 24:
  ```ts
  const title = $derived(getStringField(record, "title", fieldMeta) ?? "Untitled");
  ```
  with:
  ```ts
  const title = $derived(record.displayLabel ?? "Untitled");
  ```
- [ ] In `DecisionSummaryCard.svelte`, remove the `import { getStringField }` and
  `import { getFieldMeta }` lines **only if** they are no longer used anywhere else in the
  component after this change. (Check carefully — `fieldMeta` may be used for other derived
  values; only remove if unused.)

#### Acceptance Criteria

- [ ] `GovernanceShell.svelte` list rows render `record.displayLabel` directly.
- [ ] `DecisionSummaryCard.svelte` title derives from `record.displayLabel`.
- [ ] No `getStringField(record, "title", ...)` or `getStringField(record, "decision_statement", ...)`
  calls remain in either file for the purpose of title selection.
- [ ] `npm run typecheck` passes with no new errors.
- [ ] `npm run build` succeeds.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

```bash
npm run typecheck
npm run lint
npm run build
npm test
# Verify no title-selection getStringField calls remain:
! grep -E 'getStringField\(record,\s*"title"' src/lib/governance/GovernanceShell.svelte src/lib/components/DecisionSummaryCard.svelte
! grep -E 'getStringField\(record,\s*"decision_statement"' src/lib/governance/GovernanceShell.svelte
```

All must pass. Commit: `feat(governance): use WASM displayLabel in record list and summary card (#91)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` — all unit tests pass (including new `listRecords` displayLabel test)
- [ ] No `getStringField(record, "title", ...)` remains for title-selection purpose in GovernanceShell or DecisionSummaryCard
- [ ] Gallery records render correct labels: verified manually in Stage 7.6 dogfooding (E2E gallery.spec.ts exercises the record-list rendering path at runtime)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001).
- `getFieldValue`/`getStringField` remain in `field-utils.ts` for legitimate uses (status, article_number, decision_statement body display).

## Assumptions

- `srs-rust#293` is merged and the updated WASM binary (`src/lib/srs_bindings/`) is built and present at runtime.
- In the test environment the WASM binary is absent; tests mock the WASM boundary directly.
- `getStringField` is still used in GovernanceShell for `article_number` and `status` field lookups — confirmed at lines 452-453. The import must be kept.
- `getStringField` / `fieldMeta` are used in `DecisionSummaryCard` for `rawStatement` and `status` — confirmed at lines 26-31. Check whether they are still needed after removing the title lookup.
