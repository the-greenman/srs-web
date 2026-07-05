# Plan: Expose resolve_container_view in WASM bindings (srs-web #96)

## Summary

`resolve_container_view` already exists in `srs-rust/crates/srs-bindings/src/lib.rs` but is not yet wired into the `SrsRepository` TypeScript interface or `srs-client.ts`. Until it is, srs-web reconstructs the same structured data with separate `getContainer` + filtered `listRecords` calls, which duplicates ordering and display-label logic that lives in the core. This plan adds the TypeScript wrapper and uses it in `GuidesShell.svelte` to replace the current `getContainer` + member-filtering workaround. The `columns` and `excludeLifecycleStates` fields it exposes unblock issues #93 and #94 (container-driven nav and list pane).

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
| [ADR-001](../docs/adr/001-thin-client.md) | No SRS semantics in TypeScript — `resolveContainerView` is a pure WASM pass-through; all member ordering and display-label resolution stays in the core | accepted |
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

`record.displayLabel` is populated from `ResolvedMember.displayLabel` in the wrapper so that consumer code (e.g. `guideLabel()`, `sectionLabel()`) can use it transparently.

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
- Changes to `srs-rust`
- Changes to `GovernanceShell.svelte` (does not use the 3-call pattern)

---

## Phases

### Phase 1: Add TypeScript wrapper to srs-client.ts

**Goal:** `resolveContainerView()` is exported from `srs-client.ts` and typechecks cleanly.

**Agent:** Web App Worker

#### Tasks

- [x] Add `resolve_container_view(container_id: string, view_id?: string | null): any` to `SrsRepository` interface
- [x] Add `ColumnSpec` interface
- [x] Add `ResolvedMember` interface (with `record: SrsRecord`)
- [x] Add `ContainerView` interface
- [x] Add `resolveContainerView()` wrapper that normalizes snake_case/camelCase and sets `record.displayLabel`

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

- [x] Import `resolveContainerView` and `ContainerView`/`ResolvedMember` types from `srs-client.ts`
- [x] Remove `getContainer` import
- [x] Update `refreshSections()`: replace `getContainer(repo, containerId)` + `sections.filter(...)` with `resolveContainerView(repo, containerId).members`; filter root from members; keep `orderByPrecedes()`
- [x] Remove `sections` `$state` variable
- [x] Update `reload()`: remove `sections` filtering from `listRecords()` output
- [x] Verify `guideLabel()` and `sectionLabel()` still work (they operate on `SrsRecord.fieldValues`)

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
- No SRS semantics in TypeScript (ADR-001). Display-label resolution and member ordering live in the WASM binding, not in TS.
- `sections` state is not replaced with any alternative TS-side computation — members come directly from `resolveContainerView`.

## Assumptions

- `resolve_container_view` is already built into the WASM artifact at `src/lib/srs_bindings/`. If the WASM artifact is not rebuilt for this PR (CI builds from source), tests that require a live WASM call will be skipped/mocked — this is acceptable for this PR.
- The `orderByPrecedes()` function is retained in GuidesShell because precedes-chain ordering is guide-author intent, not container membership order.
- `ContainerView.members[0]` is the root (guide record). Filtering it out of the section list is done by comparing `instanceId` to `view.root?.instanceId`.
