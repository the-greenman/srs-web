# Plan: Migrate field-by-name lookup to WASM binding (srs-web#179)

## Summary

`lib/governance/field-utils.ts` exposes `findFieldId`, `getFieldValue`, and `getStringField`, which resolve field values by performing a linear scan of the WASM-derived `fieldMeta` map in TypeScript. This is ADR-001 residual debt: field-name-to-value lookup is SRS semantics that belongs in the engine, not in a leaf client. The required WASM binding `get_field_value_by_name(instance_id, field_name)` was shipped in srs-rust build 162 (srs-rust#536, closed 2026-07-12). This plan migrates the three callers of `field-utils.ts` to use the binding directly, then deletes `field-utils.ts` and removes the field-by-name debt entry from ADR-001.

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
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; field lookup moves to WASM binding | accepted — this plan closes the field-by-name debt entry |

No new ADR is required — this plan resolves existing ADR-001 debt without introducing a new architectural constraint.

---

## Contracts

### WASM API surface

The binding `get_field_value_by_name(instance_id: string, field_name: string): any` is already present in srs-rust build 162. No new srs-rust issue is needed. The `SrsRepository` interface in `srs-client.ts` must be updated to declare this method.

Return contract (from srs-rust#536): returns the raw field value (string, number, boolean, array, or object) as a JS value, or `null` if the field is absent, the field name is not in the type schema, or the record is not found. Never throws for missing/unknown fields — only throws on infrastructure failures.

### TypeScript types

- Add `get_field_value_by_name(instance_id: string, field_name: string): any` to the `SrsRepository` interface in `src/lib/srs-client.ts`.
- Add a typed wrapper `getFieldValueByName(repo, instanceId, fieldName)` returning `string | undefined` in `srs-client.ts` (following the existing wrapper pattern).
- `decision-export-utils.ts` signature changes: replace `fieldMeta: Map<string, FieldFormDef>` with `repo: SrsRepository`.
- `DecisionSummaryCard.svelte` gains a new optional prop `repo?: SrsRepository`.
- `SuccessorModal.svelte` gains a new prop `repo: SrsRepository`.

---

## Scope

**In scope:**
- Add `get_field_value_by_name` to `SrsRepository` interface and provide a typed wrapper in `srs-client.ts`.
- Migrate `formatDecisionMarkdown` and `formatDecisionHtml` in `decision-export-utils.ts` to accept `repo` instead of `fieldMeta`.
- Migrate `DecisionSummaryCard.svelte` to accept `repo` as a prop and call the binding.
- Migrate `SuccessorModal.svelte` to accept `repo` as a prop and call the binding.
- Update all call sites to pass `repo` (all callers already hold `repo`).
- Update `decision-export-utils.test.ts` to use a mock repo stub instead of `fieldMeta`.
- Delete `field-utils.ts` and `field-utils.test.ts`.
- Remove `getFieldMetaContext()` from `DecisionSummaryCard` and `SuccessorModal` (no longer needed).
- Update ADR-001 to remove the field-by-name lookup entry from the residual debt list.

**Out of scope:**
- `rendering/field-helpers.ts` — this file is display-layer only and not listed as ADR-001 debt; it is not changed or deleted in this plan.
- `rendering/DecisionSummaryCard.svelte` and `rendering/DecisionView.svelte` — these are separate rendering-layer components using `field-helpers.ts`, not `field-utils.ts`; no changes needed.
- `GovernanceShell.svelte` lifecycle/status path — already migrated via lifecycle binding in #135; not a caller of `field-utils.ts`.
- The `getFieldMeta()` deprecated function in `field-meta.ts` — out of scope; a separate cleanup.
- Any other ADR-001 debt items (relation-chain traversal, hardcoded vocabularies, relation type derivation).

---

## Phases

### Phase 1: Wire binding + migrate decision-export-utils.ts

**Goal:** `SrsRepository` interface exposes the binding; `decision-export-utils.ts` uses it; `field-utils.test.ts` deleted; milestone gate passes.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `get_field_value_by_name(instance_id: string, field_name: string): any` to the `SrsRepository` interface in `src/lib/srs-client.ts` (after the existing `find` entry, following comment conventions).
- [ ] Add typed wrapper to `srs-client.ts`:
  ```ts
  export function getFieldValueByName(
    repo: SrsRepository,
    instanceId: string,
    fieldName: string
  ): string | undefined {
    const v = repo.get_field_value_by_name(instanceId, fieldName);
    return typeof v === "string" ? v : undefined;
  }
  ```
- [ ] Update `src/lib/governance/decision-export-utils.ts`:
  - Change imports: replace `FieldFormDef` import with `SrsRepository` from `srs-client.js`; import `getFieldValueByName` from `srs-client.js`; remove `getStringField` import.
  - Change `formatDecisionMarkdown(record, fieldMeta)` → `formatDecisionMarkdown(record, repo)` — replace `getStringField(record, name, fieldMeta)` with `getFieldValueByName(repo, record.instanceId, name)`.
  - Change `formatDecisionHtml(record, fieldMeta)` → `formatDecisionHtml(record, repo)` — same replacement.
- [ ] Update caller in `GovernanceShell.svelte` (line ~818–819): replace `fieldMetaMap` with `repo` in the two `formatDecision*` calls.
- [ ] Update `tests/decision-export-utils.test.ts`:
  - Remove `makeFieldMeta` helper and `FieldFormDef` import.
  - Add a minimal `SrsRepository` stub that implements `get_field_value_by_name(instanceId, fieldName)` by looking up values from a pre-set `Map<string, Map<string, unknown>>` (keyed `instanceId → fieldName → value`).
  - Update all test calls from `formatDecisionMarkdown(record, basicFieldMeta)` → `formatDecisionMarkdown(record, mockRepo)`.
  - Verify existing test behaviour is preserved (title heading, field skipping, createdAt footer, HTML escaping).
- [ ] Delete `tests/field-utils.test.ts`.

#### Acceptance Criteria

- [ ] `SrsRepository` interface in `srs-client.ts` declares `get_field_value_by_name`.
- [ ] `getFieldValueByName` wrapper exported from `srs-client.ts` returns `string | undefined` (null-to-undefined conversion).
- [ ] `formatDecisionMarkdown` and `formatDecisionHtml` accept `repo: SrsRepository`, no longer accept `fieldMeta`.
- [ ] `decision-export-utils.test.ts` passes using the mock stub; no `fieldMeta` parameter remains.
- [ ] `tests/field-utils.test.ts` is deleted (no longer needed — `findFieldId` is being removed).
- [ ] `npm run typecheck` and `npm run build` pass.

#### Testing

```bash
cd /home/user/srs-web
npm run typecheck
npm run lint
npm run build
npm test -- tests/decision-export-utils.test.ts tests/srs-client.test.ts
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

**Agent:** Web App Worker

#### Tasks

- [ ] Update `src/lib/components/DecisionSummaryCard.svelte`:
  - Add `repo?: SrsRepository` to the `Props` interface and destructuring.
  - Import `SrsRepository` from `$lib/srs-client.js`.
  - Replace `getStringField(record, "decision_statement", fieldMeta)` with `(repo?.get_field_value_by_name(record.instanceId, "decision_statement") ?? null) as string | null | undefined` — or use the wrapper: add import `getFieldValueByName` from `$lib/srs-client.js` and call `getFieldValueByName(repo!, record.instanceId, "decision_statement")` with an `if (repo)` guard.
  - Replace `getStringField(record, "status", fieldMeta)` similarly.
  - Remove `import { getStringField } from "$lib/governance/field-utils.js"`.
  - Remove `getFieldMetaContext()` call and `fieldMeta` derived — no longer needed.
  - Remove `import { getFieldMetaContext } from "$lib/governance/field-meta.js"` if not otherwise used.
- [ ] Update `src/lib/components/DecisionLogView.svelte` to pass `repo` to `DecisionSummaryCard`:
  ```svelte
  <DecisionSummaryCard {record} {repo} ... />
  ```
  (DecisionLogView already has `repo?: SrsRepository` as a prop.)
- [ ] Update `src/lib/components/SuccessorModal.svelte`:
  - Add `repo: SrsRepository` to the `Props` interface and destructuring.
  - Import `SrsRepository` from `$lib/srs-client.js`.
  - Replace `getStringField(record, "status", fieldMeta) ?? "immutable"` with `(repo.get_field_value_by_name(record.instanceId, "status") as string | null | undefined) ?? "immutable"`.
  - Remove `import { getStringField } from "$lib/governance/field-utils.js"`.
  - Remove `getFieldMetaContext()` call and `fieldMeta` derived — no longer needed.
  - Remove `import { getFieldMetaContext } from "$lib/governance/field-meta.js"` if not otherwise used.
- [ ] Update `GovernanceShell.svelte` (line ~1143): add `{repo}` prop to `<SuccessorModal>`.
- [ ] Delete `src/lib/governance/field-utils.ts`.
- [ ] Update `src/lib/components/index.ts` if it re-exports anything from `field-utils.ts` (unlikely — check and confirm).
- [ ] Update `src/lib/governance/GovernanceShell.svelte` — remove `fieldMetaMap` from the two `formatDecision*` calls (done in Phase 1 already; verify no leftover references to `getStringField` or `field-utils`).
- [ ] Update `docs/adr/001-thin-client.md`: remove the **Field-by-name lookup** bullet from the residual debt list; add a line noting it was resolved in srs-web#179.

#### Acceptance Criteria

- [ ] `src/lib/governance/field-utils.ts` no longer exists.
- [ ] No file in `src/` imports from `field-utils`.
- [ ] `DecisionSummaryCard.svelte` accepts `repo?: SrsRepository`; uses `repo?.get_field_value_by_name(...)` for status and decision_statement.
- [ ] `SuccessorModal.svelte` accepts `repo: SrsRepository`; uses `repo.get_field_value_by_name(...)` for status.
- [ ] `GovernanceShell.svelte` passes `{repo}` to `<SuccessorModal>`.
- [ ] `DecisionLogView.svelte` passes `{repo}` to `<DecisionSummaryCard>`.
- [ ] ADR-001 field-by-name debt entry removed.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.

#### Testing

```bash
cd /home/user/srs-web
npm run typecheck
npm run lint
npm run build
npm test
```

Verify with grep that no callers remain:
```bash
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
- [ ] ADR-001 residual debt list no longer contains field-by-name lookup
- [ ] PR body includes `Closes #179`
