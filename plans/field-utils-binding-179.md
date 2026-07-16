# Plan: Migrate field-by-name lookup to WASM binding (srs-web#179)

## Summary

`lib/governance/field-utils.ts` exposes `findFieldId`, `getFieldValue`, and `getStringField`, which resolve field values by performing a linear scan of the WASM-derived `fieldMeta` map in TypeScript. This is ADR-001 residual debt: field-name-to-value lookup is SRS semantics that belongs in the engine, not in a leaf client. The required WASM binding `get_field_value_by_name(instance_id, field_name)` was shipped in srs-rust build 162 (srs-rust#536, closed 2026-07-12). This plan migrates the three callers of `field-utils.ts` to use the binding directly, then deletes `field-utils.ts` and updates ADR-001 to remove the field-by-name debt entry.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Main session |
| Web App Worker | Main session |
| Verification | Spawned in Stage 7 |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; field lookup moves to WASM binding | accepted — this plan closes the `field-utils.ts` debt entry |
| [ADR-012](../docs/adr/012-governance-status-via-lifecycle-binding.md) | Status reads in list rows use `get_field_value_by_name` as a display-only shortcut; lifecycle binding remains the write path | accepted exception — see Phase 2 note |

No new ADR is required — this plan resolves existing ADR-001 debt without introducing a new architectural constraint.

---

## Contracts

### WASM API surface

The binding `get_field_value_by_name(instance_id: string, field_name: string): any` is already present in srs-rust build 162 (confirmed in `src/lib/srs_bindings/srs_bindings.d.ts:134`). No new srs-rust issue is needed.

Return contract (from srs-rust#536): returns the raw field value (string, number, boolean, array, or object) as a JS value, or `null` if the field is absent, the field name is not in the type schema, or the record is not found. Never throws for missing/unknown fields — only throws on infrastructure failures.

**No wrapper function in `srs-client.ts`**: `get_field_value_by_name` is called directly on the `repo` handle at the three call sites; an inline `as string | null | undefined` cast is sufficient. This avoids a name collision with the existing `getFieldValueByName` export in `src/rendering/field-helpers.ts` (which has a different signature and is out of scope for this plan).

### TypeScript types

- Add `get_field_value_by_name(instance_id: string, field_name: string): any` to the `SrsRepository` interface in `src/lib/srs-client.ts` (after the `find` entry, following comment conventions).
- `decision-export-utils.ts` signature changes: replace `fieldMeta: Map<string, FieldFormDef>` with `repo: SrsRepository`.
- `DecisionSummaryCard.svelte` (`src/lib/components/`) gains a new **required** prop `repo: SrsRepository`.
- `SuccessorModal.svelte` gains a new prop `currentState: string` (not `repo: SrsRepository`) — the shell already holds `allowedTransitions.currentState` when showing the modal, making a WASM call in the modal unnecessary and ADR-012 non-compliant.

---

## Scope

**In scope:**
- Add `get_field_value_by_name` to `SrsRepository` interface in `srs-client.ts`.
- Update `tests/srs-client.test.ts` `mockRepo` stub to include the new method.
- Migrate `formatDecisionMarkdown` and `formatDecisionHtml` in `decision-export-utils.ts` to accept `repo: SrsRepository` instead of `fieldMeta`; update callers and tests.
- Migrate `DecisionSummaryCard.svelte` to accept required `repo: SrsRepository` and call the binding; update `DecisionLogView.svelte` to pass `repo`.
- Migrate `SuccessorModal.svelte` to accept `currentState: string` instead of the `getStringField` pattern; update `GovernanceShell.svelte` to pass `allowedTransitions.currentState`.
- Remove `getFieldMetaContext()` from `DecisionSummaryCard` and `SuccessorModal` (no longer needed).
- Delete `src/lib/governance/field-utils.ts` and `tests/field-utils.test.ts`.
- Update ADR-001 to replace the `field-utils.ts` debt entry with a closure note.

**Out of scope:**
- `rendering/field-helpers.ts`, `rendering/DecisionView.svelte`, `rendering/DecisionSummaryCard.svelte` — use `field-helpers.ts`, not `field-utils.ts`; display-layer only, not ADR-001 debt.
- `GovernanceShell.svelte` `setFieldMetaContext` / `buildFieldMetaMap` — continues serving the rendering layer; untouched.
- The deprecated `getFieldMeta()` function in `field-meta.ts`.
- Any other ADR-001 debt items.

---

## Phases

### Phase 1: Wire binding + migrate decision-export-utils.ts

**Goal:** `SrsRepository` interface exposes the binding; `decision-export-utils.ts` and its tests use `repo`; `field-utils.test.ts` deleted; milestone gate passes.

**Agent:** Web App Worker

#### Tasks

- [ ] Add to `SrsRepository` interface in `src/lib/srs-client.ts` (after the `find` entry):
  ```ts
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; null for missing/unknown field
  get_field_value_by_name(instance_id: string, field_name: string): any;
  ```
- [ ] Update `tests/srs-client.test.ts`: find the `mockRepo` helper function and add `get_field_value_by_name: () => undefined` to the `base: SrsRepository` object so it satisfies the updated interface.
- [ ] Update `src/lib/governance/decision-export-utils.ts`:
  - Remove import of `getStringField` from `field-utils.js`.
  - Remove import of `FieldFormDef` from `types.js` (no longer needed).
  - Add import of `SrsRepository` from `$lib/srs-client.js`.
  - Change `formatDecisionMarkdown(record: SrsRecord, fieldMeta: Map<string, FieldFormDef>)` → `formatDecisionMarkdown(record: SrsRecord, repo: SrsRepository)`.
  - Replace each `getStringField(record, name, fieldMeta)` with `repo.get_field_value_by_name(record.instanceId, name) as string | null | undefined`. Treat `null` the same as `undefined` (field absent).
  - Apply the same changes to `formatDecisionHtml`.
- [ ] Update `GovernanceShell.svelte` (lines ~818–819): replace `fieldMetaMap` with `repo` in the two `formatDecision*` calls.
- [ ] Update `tests/decision-export-utils.test.ts`:
  - Remove `makeFieldMeta` helper, `FieldFormDef` import, and `basicFieldMeta` constant — unused after migration.
  - Remove `TITLE_FIELD_ID`, `STATEMENT_FIELD_ID`, `CONTEXT_FIELD_ID` constants — unused after migration.
  - Simplify `makeRecord`: the `fieldValues` parameter is unused (formatting functions no longer read `record.fieldValues`); remove it or leave as empty array.
  - Add a minimal mock stub. **The stub's inner lookup must be keyed by field name strings** (`"title"`, `"decision_statement"`, `"context"`, etc.) — NOT by field ID constants:
    ```ts
    function makeRepoStub(values: Record<string, string>): Pick<SrsRepository, "get_field_value_by_name"> {
      return { get_field_value_by_name: (_id: string, name: string) => values[name] ?? null };
    }
    const basicRepo = makeRepoStub({ title: "My Decision", decision_statement: "We chose X", context: "Background" });
    ```
  - Update all test calls: `formatDecisionMarkdown(record, basicFieldMeta)` → `formatDecisionMarkdown(record, basicRepo)` and likewise for `formatDecisionHtml`.
  - Verify: every assertion that previously passed against a `fieldMeta`-keyed lookup still passes. No assertion should silently pass because the stub returns `undefined` for a field it should populate — confirm the stub covers all field names exercised by the test suite.
- [ ] Delete `tests/field-utils.test.ts`.

#### Acceptance Criteria

- [ ] `SrsRepository` interface in `srs-client.ts` declares `get_field_value_by_name`.
- [ ] `tests/srs-client.test.ts` compiles — `mockRepo` base includes `get_field_value_by_name`.
- [ ] `formatDecisionMarkdown` and `formatDecisionHtml` accept `repo: SrsRepository`, no longer accept `fieldMeta`.
- [ ] `decision-export-utils.test.ts` passes using the mock stub; stub is keyed by field name strings; no `TITLE_FIELD_ID` or `fieldMeta` references remain.
- [ ] `tests/field-utils.test.ts` is deleted.
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] `npm test` passes.

#### Testing

```bash
cd /home/user/.worktrees/179-field-utils-binding
npm run typecheck
npm run lint
npm run build
npm test -- tests/decision-export-utils.test.ts tests/srs-client.test.ts
# srs-client.test.ts: verifies the interface addition doesn't break existing wrapper coverage
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Run `npm test` — all tests pass.
4. Mark completed task checkboxes `[x]`.
5. Commit: `feat: wire get_field_value_by_name binding; migrate decision-export-utils (#179)`.

---

### Phase 2: Migrate Svelte components + delete field-utils.ts + update ADR-001

**Goal:** All callers of `field-utils.ts` removed; `field-utils.ts` deleted; ADR-001 updated; milestone gate passes.

**ADR-012 note:** `DecisionSummaryCard.svelte` reads status via `repo.get_field_value_by_name(record.instanceId, "status")`. Calling `get_allowed_lifecycle_transitions` per list row would be prohibitively expensive (one round-trip per record). Using the field-value read for the status badge is an approved ADR-012 exception for this display-only context; the lifecycle binding remains the write path and the authority for immutability gating.

**Agent:** Web App Worker

#### Tasks

- [ ] Update `src/lib/components/DecisionSummaryCard.svelte`:
  - Add `import type { SrsRepository } from "$lib/srs-client.js"`.
  - Add required `repo: SrsRepository` to the `Props` interface and destructuring (remove `?` — all real callers have `repo`).
  - Replace `getStringField(record, "decision_statement", fieldMeta)` with:
    ```ts
    const rawStatement = $derived(repo.get_field_value_by_name(record.instanceId, "decision_statement") as string | null | undefined ?? undefined);
    ```
  - Replace `getStringField(record, "status", fieldMeta)` with:
    ```ts
    const status = $derived(repo.get_field_value_by_name(record.instanceId, "status") as Status | null | undefined ?? undefined);
    ```
  - Remove `import { getStringField } from "$lib/governance/field-utils.js"`.
  - Remove `import { getFieldMetaContext } from "$lib/governance/field-meta.js"` and the `_fieldMetaCtx` / `fieldMeta` derived declarations — no longer needed.
- [ ] Update `src/lib/components/DecisionLogView.svelte` (line ~149): add `{repo}` to the `<DecisionSummaryCard>` element. `DecisionLogView` already has `repo?: SrsRepository` as a prop; pass it with a non-null assertion `repo={repo!}` (records are only rendered when `repo` is loaded).
- [ ] Update `src/lib/components/SuccessorModal.svelte`:
  - The modal should accept `currentState: string` as a prop (replace `record: SrsRecord` — the modal no longer needs the full record).
  - Props interface: `{ currentState: string; onCreateSuccessor: () => void; onCancel: () => void }`.
  - Replace uses of `status` (previously from `getStringField`) with `currentState` directly.
  - Remove `import { getStringField } from "$lib/governance/field-utils.js"`.
  - Remove `import { getFieldMetaContext } from "$lib/governance/field-meta.js"`.
  - Remove `import type { SrsRecord } from "$lib/srs-client.js"` if `record` prop is removed.
- [ ] Update `GovernanceShell.svelte` (line ~1143, `<SuccessorModal>` usage):
  - Remove `record={selectedRecord}`.
  - Add `currentState={allowedTransitions?.currentState ?? "immutable"}`.
  - Verify that `allowedTransitions` is populated before `showSuccessorModal = true` on both code paths (~line 589 and ~line 615). If needed, capture the value in a local variable at the point the modal is triggered.
- [ ] Delete `src/lib/governance/field-utils.ts`.
- [ ] Update `docs/adr/001-thin-client.md`: replace the **Field-by-name lookup** bullet with: "**Field-by-name lookup** — resolved in srs-web#179: `field-utils.ts` deleted; `getStringField`/`findFieldId`/`getFieldValue` removed; callers now use `repo.get_field_value_by_name` directly. Note: an equivalent TS-side field-name scan remains in `src/rendering/field-helpers.ts` (display-layer only, not yet tracked as ADR-001 debt)."

#### Acceptance Criteria

- [ ] `src/lib/governance/field-utils.ts` no longer exists.
- [ ] No file in `src/` imports from `field-utils`.
- [ ] `DecisionSummaryCard.svelte` (`src/lib/components/`) accepts required `repo: SrsRepository`; calls `repo.get_field_value_by_name(...)` for status and decision_statement; no `fieldMeta` or `getFieldMetaContext` references.
- [ ] `SuccessorModal.svelte` accepts `currentState: string`; makes no WASM calls; no `field-utils` import; no `getFieldMetaContext`.
- [ ] `GovernanceShell.svelte` passes `currentState` to `<SuccessorModal>`; `DecisionLogView.svelte` passes `{repo}` to `<DecisionSummaryCard>`.
- [ ] ADR-001 field-by-name debt entry replaced with closure note (including rendering-layer caveat).
- [ ] Grep confirms no callers remain: `grep -rn "field-utils\|getStringField\|findFieldId\|getFieldValue" src/ --include="*.ts" --include="*.svelte"` → no output.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.

#### Testing

```bash
cd /home/user/.worktrees/179-field-utils-binding
npm run typecheck
npm run lint
npm run build
npm test
grep -rn "field-utils\|getStringField\|findFieldId\|getFieldValue" src/ --include="*.ts" --include="*.svelte"
# Expected: no output
```

#### Milestone gate

1. All acceptance criteria met.
2. All milestone gate commands pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: migrate Svelte callers to WASM binding; delete field-utils.ts (#179)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run e2e` passes (if e2e tests exist for the affected flows)
- [ ] No import of `field-utils` anywhere in `src/`
- [ ] ADR-001 field-by-name debt entry replaced with closure note
- [ ] PR body includes `Closes #179`
