# Plan: Expose resolve_container_view in WASM bindings (srs-web #96)

## Summary

`resolve_container_view` already exists in `srs-rust/crates/srs-bindings/src/lib.rs` but is not yet wired into the `SrsRepository` TypeScript interface or `srs-client.ts`. Until it is, srs-web reconstructs the same structured data with separate `getContainer` + filtered `listRecords` calls, which duplicates membership filtering logic that belongs in the core. This plan adds the TypeScript wrapper and uses it in `GuidesShell.svelte` to replace the current `getContainer` + member-filtering workaround. The `columns` and `excludeLifecycleStates` fields it exposes unblock issues #93 and #94 (container-driven nav and list pane).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude Code (this session) |
| Web App Worker | Claude Code (this session) |
| Verification | Claude Code (this session) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | No SRS semantics in TypeScript — `resolveContainerView` is a pure WASM pass-through; all SRS semantics live in the core | accepted |
| [ADR-001](../docs/adr/001-thin-client.md) | `orderByPrecedes()` is retained as known ADR-001 residual debt: the Rust service returns members in stored (UUID-alphabetical) order, not precedes order. A future issue (#97) should extend the Rust service to return precedes-ordered members. An implementer must NOT drop `orderByPrecedes()` on the assumption that member ordering comes from WASM — it does not. | accepted |
| [ADR-008](../docs/adr/008-rfc009-uuid-chain-join.md) | UUID-chain join governs DocumentView matching; `resolve_container_view` reuses the same service-level matcher (not client logic) | accepted |

No new ADR required: this change adds a wrapper with no novel architectural constraints.

---

## Contracts

### WASM API surface

No new WASM binding needed. `resolve_container_view(container_id: &str, view_id: Option<String>)` is already implemented in `srs-rust/crates/srs-bindings/src/lib.rs` (lines 545–559). Dependency: srs-rust#254 (closed/done).

Return type from the Rust side (`#[serde(rename_all = "camelCase")]`):
```
ContainerView {
  containerId: string
  documentViewId?: string
  root?: ResolvedMember
  members: ResolvedMember[]          // roots-first, deduped; root appears as members[0]
  columns: ColumnSpec[]
  excludeLifecycleStates: string[]
  diagnostics: string[]
}
ResolvedMember { instanceId, tier, displayLabel, record: Record }
ColumnSpec { fieldId, fieldName, displayLabel, order, required }
```

### TypeScript types

New types added to `srs-web/src/lib/srs-client.ts`:
- `ColumnSpec`
- `ResolvedMember` (with `record: SrsRecord` normalized via `normalizeRecord`)
- `ContainerView`
- `resolveContainerView(repo, containerId, viewId?)` exported wrapper function

`record.displayLabel` is NOT populated from `ResolvedMember.displayLabel`. `guideLabel()` and `sectionLabel()` read from `record.fieldValues` directly — no displayLabel injection is performed and none is needed.

---

## Scope

- Add `resolve_container_view` to the `SrsRepository` TS interface
- Add `ColumnSpec`, `ResolvedMember`, `ContainerView` types to `srs-client.ts`
- Add `resolveContainerView()` wrapper function to `srs-client.ts`
- Update `GuidesShell.svelte#refreshSections()` to use `resolveContainerView` instead of `getContainer` + member filter
- Remove now-unused `sections` state and `getContainer` import from `GuidesShell.svelte`

**Out of scope:**
- Implementing container-driven nav (#93) or list pane (#94)
- Using `columns` in any consumer (no UI for column-driven rendering in this PR)
- Using `excludeLifecycleStates` in any consumer (that is #94 / ADR-020 work)
- Fixing the ADR-001 residual debt in `orderByPrecedes()` (tracked as #97 in srs-web)
- Changes to `srs-rust`
- Changes to `GovernanceShell.svelte` (does not use the 3-call pattern)

---

## Phases

### Phase 1: Add TypeScript wrapper to srs-client.ts

**Goal:** `resolveContainerView()` is exported from `srs-client.ts` and typechecks cleanly.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `resolve_container_view(container_id: string, view_id?: string | null): any` to `SrsRepository` interface
- [ ] Add `ColumnSpec` interface
- [ ] Add `ResolvedMember` interface (with `record: SrsRecord`)
- [ ] Add `ContainerView` interface
- [ ] Add `resolveContainerView()` wrapper that normalizes snake_case/camelCase fields; does NOT inject `displayLabel` into `record`

#### Acceptance Criteria

- [ ] `resolveContainerView` is callable in TypeScript with correct types
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run lint
```

#### Milestone gate

1. `npm run typecheck` passes with no errors.
2. Commit: `feat(wasm): add resolveContainerView wrapper to srs-client (#96)`

---

### Phase 2: Replace 3-call workaround in GuidesShell.svelte

**Goal:** `GuidesShell#refreshSections()` uses `resolveContainerView` instead of `getContainer` + member filtering; `sections` state is removed.

**Agent:** Web App Worker

#### Tasks

- [ ] Import `resolveContainerView` and `ContainerView`/`ResolvedMember` types from `srs-client.ts`
- [ ] Remove `getContainer` import
- [ ] Update `refreshSections()`: replace `getContainer` + `sections.filter(...)` with `resolveContainerView(repo, containerId)`, then extract `view.members.filter(m => m.tier > 0).map(m => m.record)` (tier 0 is the root guide record; tier > 0 are sections) and pipe through `orderByPrecedes()`. Note: `members` returns `ResolvedMember[]`, not `SrsRecord[]` — the `.map(m => m.record)` extraction is required before passing to `orderByPrecedes()`.
- [ ] Remove `sections` `$state` variable
- [ ] Update `reload()`: remove `sections` filtering from `listRecords()` output
- [ ] Verify `guideLabel()` and `sectionLabel()` still work (they operate on `SrsRecord.fieldValues`, not `displayLabel`)

#### Acceptance Criteria

- [ ] Selecting a guide still shows its ordered sections
- [ ] Adding, editing, removing, and reordering sections works without regression
- [ ] No `getContainer` or `sections` references remain in `GuidesShell.svelte`
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria met.
2. All milestone gate commands pass.
3. Commit: `feat(guides): use resolveContainerView in refreshSections (#96)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] No `getContainer` import or `sections` state in `GuidesShell.svelte`
- [ ] `resolveContainerView` exported from `srs-client.ts` with correct TS types
- [ ] Selecting a guide and navigating sections works end-to-end (dogfooding)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). All SRS semantics live in the WASM binding.
- `orderByPrecedes()` is retained as known ADR-001 residual debt — the Rust service returns members in stored (UUID-alphabetical) order, NOT precedes order. Do NOT remove it.
- `sections` state is not replaced with any alternative TS-side computation — section records come directly from `resolveContainerView` members.

## Assumptions

- `resolve_container_view` is already built into the WASM artifact at `src/lib/srs_bindings/`. If the WASM artifact is not rebuilt for this PR (CI builds from source), tests that require a live WASM call will be skipped/mocked — this is acceptable for this PR.
- The `orderByPrecedes()` function is retained in GuidesShell because precedes-chain ordering is guide-author intent and the Rust service does not yet return precedes-ordered members (tracked in #97).
- `ContainerView.members[0]` is the root (guide record) with tier 0. Section members have tier > 0. Root is excluded from the section list by filtering `m.tier > 0`.
