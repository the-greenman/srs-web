# Plan: Discover status field UUID from schema instead of hardcoding (#86)

## Summary

`field-utils.ts` exports a hardcoded constant `STATUS_FIELD_ID = "aee7afe9-..."` that is used in three `GovernanceShell.svelte` handlers — `handleEditRecord` (immutability guard), `handleLifecycleTransition` (field value write), and `handleCreateSuccessor` (field value write). Hardcoding a field UUID violates ADR-001 in spirit: structural metadata that could change across repo versions or differ between governance packages is embedded in TypeScript. The correct approach — already used for reading (`getStringField(record, "status", fieldMeta)` at line 831) — is to discover the field ID at runtime from the WASM-derived `fieldMeta` map. This plan completes that pattern on the write path and removes the constant.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Architecture Reviewer + Verification Agent (spawned in Stage 7) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |

**ADR-001 residual debt addressed:** The existing `STATUS_FIELD_ID` constant is listed as residual debt in ADR-001 ("Hardcoded vocabularies — the lifecycle STATUS_OPTIONS list is hardcoded in TS instead of derived from the type/lifecycle definition via a binding"). This plan eliminates the hardcoded UUID on the write path. No new ADR is required: this is debt reduction, not a new architectural constraint. The field-name lookup ("status") is the same pattern already used at line 831 and acknowledged in ADR-001 as the interim approach pending a binding-level "fields addressable by name" capability.

---

## Contracts

### WASM API surface

**No new WASM binding required.** The existing `typeSchema()` binding already populates `FieldFormDef.name` via `buildFieldMetaMap()`. The read path (`getStringField`) already uses this. The fix extends the same name-based lookup to the write path.

### TypeScript types

No new TS types. `FieldFormDef.name: string` (already in `governance/types.ts`) is the field used for discovery.

---

## Scope

- Add `findFieldId(name: string, fieldMeta: Map<string, FieldFormDef>): string | undefined` to `field-utils.ts`.
- Remove the exported `STATUS_FIELD_ID` constant from `field-utils.ts`.
- Add `$derived(findFieldId("status", fieldMetaMap))` in `GovernanceShell.svelte`; update all three usage sites.
- Add unit tests for `findFieldId` in `tests/field-utils.test.ts`.

**Out of scope:**
- `LIFECYCLE_TRANSITIONS` and `IMMUTABLE_STATES` in `lifecycle.ts` — addressed in srs-web#135 (depends on srs-rust#375).
- `DecisionLogView` status filter — addressed in srs-web#118.
- Moving the `status` field lookup into a WASM binding — future work, noted in ADR-001.

---

## Phases

### Phase 1: Add findFieldId + remove STATUS_FIELD_ID + update GovernanceShell

**Goal:** `STATUS_FIELD_ID` is gone; all three handler sites discover the status field ID at runtime from `fieldMetaMap`; unit tests pass.

**Agent:** Web App Worker (Claude)

#### Tasks

- [ ] Add `findFieldId(name: string, fieldMeta: Map<string, FieldFormDef>): string | undefined` to `src/lib/governance/field-utils.ts`. Remove `STATUS_FIELD_ID` export.
- [ ] In `GovernanceShell.svelte`:
  - Modify the existing import: replace `STATUS_FIELD_ID` with `findFieldId`, retaining `getStringField`.
  - Add `const statusFieldId = $derived(findFieldId("status", fieldMetaMap));` after `fieldMetaMap`.
  - Update `handleEditRecord`: wrap the immutability check in `if (statusFieldId !== undefined)`. If `statusFieldId` is `undefined`, skip the check and allow edit to proceed (safe fallback).
  - Update `handleLifecycleTransition`: add `if (!selectedRecord || statusFieldId === undefined) return;` at the top. Delete the dead `const statusFieldId = STATUS_FIELD_ID;` alias line.
  - Update `handleCreateSuccessor`: `showSuccessorModal = false` first, then `if (!statusFieldId) return;`, then rest. Delete the dead `const statusFieldId = STATUS_FIELD_ID;` alias line.
- [ ] Add `tests/field-utils.test.ts` with unit tests for `findFieldId`:
  - (a) field name present → returns correct fieldId UUID
  - (b) field name absent → returns `undefined`
  - (c) empty map → returns `undefined`

#### Acceptance Criteria

- [ ] `STATUS_FIELD_ID` no longer exported from `field-utils.ts`. (`grep -r STATUS_FIELD_ID src/` returns no matches.)
- [ ] All three handler sites use the module-level derived `statusFieldId`.
- [ ] When `fieldMeta` has no entry with `name === "status"`, `handleLifecycleTransition` and `handleCreateSuccessor` return without calling any WASM mutation.
- [ ] When `fieldMeta` has no "status" entry, `handleEditRecord` allows editing (skips immutability check).
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes (new `findFieldId` tests green, all three cases covered).
- [ ] No e2e regression: `lifecycle.spec.ts` continues to pass.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
npx playwright test e2e/lifecycle.spec.ts
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Mark completed task checkboxes `[x]`.
4. Commit with message referencing the issue (`... (#86)`).

Do not start the next phase until the milestone gate passes.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all unit tests including new `findFieldId` tests)
- [ ] `STATUS_FIELD_ID` constant no longer exists anywhere in `src/`
- [ ] `findFieldId("status", fieldMeta)` discovers the status field from schema at runtime

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The name "status" is package-level vocabulary already used at line 831; this plan completes the pattern.
- Lead Integrator freezes WASM binding API names before any srs-web edit forms consume them. (No new WASM binding in this plan — N/A.)
- Verification Agent runs after Phase 1 and before the PR.

## Assumptions

- The governance package field named "status" is stable across governance repo versions (same as the current caller at GovernanceShell.svelte:831 assumes).
- If a governance type has no "status" field (e.g. a custom governance package), `findFieldId` returns `undefined` and the immutability guard / lifecycle transition gracefully no-ops — editing is permitted without status gating.
