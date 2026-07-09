# Plan: RecordView detail header — use core displayLabel, drop typeName fallback

> **Usage note:** The purpose of a plan file is to be reviewed and executed by agents. Write it with that reader in mind: unambiguous tasks, explicit file paths, named functions, checkable acceptance criteria. A plan that requires human interpretation at execution time is incomplete.

## Summary

`RecordView.svelte` titles the detail pane with `title ?? record.typeName ?? record.instanceId.slice(0, 8)`. It never consults `record.displayLabel` — the core-resolved label populated by the WASM `list_records` binding via `normalizeRecordSummary` in `srs-client.ts`. As a result, any record whose type is not in the `TYPE_REGISTRY` shows its type name (e.g. "decision") as the detail-pane heading rather than the record's actual identity value, even in governance repos where a meaningful label exists. This plan removes the `typeName` fallback and replaces it with `displayLabel`, aligning `RecordView` with how every other component in the app (DecisionSummaryCard, GovernanceShell, GuidesShell) renders record headings.

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
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS — use WASM-resolved `displayLabel` | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | typeId-keyed dispatch; RecordView is the fallback renderer | accepted |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | Unified TYPE_REGISTRY; absent entry → RecordView fallback | accepted |
| [ADR-009](../docs/adr/009-container-driven-nav.md) | Container-keyed nav; active container's members come from `listRecords()` → carry `displayLabel` | accepted |
| [ADR-010](../docs/adr/010-view-driven-list-columns.md) | "The row title is the core-resolved `displayLabel` … Titles are never re-derived from `fieldValues`" | accepted |

No new ADR is required. This change is a direct application of ADR-001 and ADR-010: `displayLabel` is resolved by the WASM engine (`record_display_label` in srs-repository), delivered on `SrsRecord.displayLabel` by `listRecords()` → `normalizeRecordSummary()`, and the TS client renders it — no semantics in TypeScript. ADR-009 establishes that the data flow through GovernanceShell always calls `listRecords()`, guaranteeing `displayLabel` is present on records reaching `RecordView`.

---

## Contracts

### WASM API surface

No new or changed WASM methods required. `displayLabel` is already returned by the existing `list_records` WASM binding (srs-rust#293) and exposed on `SrsRecord` (line 116, `src/lib/srs-client.ts`).

### TypeScript types

`SrsRecord.displayLabel?: string` is already defined in `src/lib/srs-client.ts` (line 116). No type changes needed.

---

## Scope

- `src/rendering/RecordView.svelte` — replace `record.typeName` with `record.displayLabel` in the title fallback chain.

**Out of scope:**

- `RecordDispatch.svelte` — currently passes only `{record}`; no change needed because `displayLabel` is already on the record.
- Other rendering components (DecisionView, etc.) — they already handle `displayLabel` correctly.
- Records from `getRecord()` (bare Record without `displayLabel`) — these flow through `normalizeRecord()`, not `normalizeRecordSummary()`, and so lack `displayLabel`. This path does not reach `RecordView` in production (records in `RecordReading` come from `listRecords()` via `containerRecords` in GovernanceShell). If `displayLabel` is absent, the fallback is `record.instanceId.slice(0, 8)` — the honest default.
- Adding `displayLabel` resolution to `getRecord()` (single-record fetch) — this is a separate concern requiring a WASM binding change; out of scope here.

---

## Phases

### Phase 1: Update title fallback in RecordView

**Goal:** `RecordView.svelte` uses `record.displayLabel` instead of `record.typeName` as the detail-pane heading, dropping the `typeName` fallback.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/rendering/RecordView.svelte`, change line 33 from:
  ```svelte
  title={title ?? record.typeName ?? record.instanceId.slice(0, 8)}
  ```
  to:
  ```svelte
  title={title ?? record.displayLabel ?? record.instanceId.slice(0, 8)}
  ```
  No other changes to this file.

#### Acceptance Criteria

- [ ] `RecordView.svelte` line 33 uses `record.displayLabel`, not `record.typeName`.
- [ ] `record.typeName` is not referenced anywhere in `RecordView.svelte`.
- [ ] `npm run typecheck` passes (no TS errors).
- [ ] `npm run lint` passes (no biome errors).
- [ ] `npm run build` succeeds.
- [ ] `npm test` passes (note: the test suite covers TypeScript unit functions only — no Svelte component tests exist; `npm run typecheck` is the primary correctness gate for the Svelte change).

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Confirm `record.typeName` no longer appears in `RecordView.svelte`.
3. Mark task checkbox `[x]` and commit: `feat(RecordView): use displayLabel in detail header, drop typeName fallback (#136)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `RecordView.svelte` title chain is `title ?? record.displayLabel ?? record.instanceId.slice(0,8)`
- [ ] No regression in `RecordDispatch`-fallback rendering for non-registry record types (the only consumer of `RecordView`)

## Coordination Rules

- Web App Worker keeps to `src/rendering/RecordView.svelte` only.
- No SRS semantics in TypeScript (ADR-001). `displayLabel` is WASM-resolved; TS only renders it.
- Verification Agent runs after Phase 1 and before final sign-off.

## Assumptions

- Records reaching `RecordView` via the `GovernanceShell → RecordReading → RecordDispatch → RecordView` path always come from `listRecords()` and therefore carry `displayLabel`. This is confirmed by tracing `containerRecords` back to `listRecords()` calls at GovernanceShell lines 282 and 330.
- The `title` prop is retained for API completeness; in the current production call chain `RecordDispatch` always passes only `{record}` so `title` is `undefined`. Registered custom views replace `RecordView` entirely via `RecordDispatch` and do not call into it with a `title` prop.
- Removing `record.typeName` from the fallback is safe because type names are not meaningful identity labels — `displayLabel` (e.g., the record's `heading` or `name` field value) is the appropriate semantic label for the detail pane heading.
