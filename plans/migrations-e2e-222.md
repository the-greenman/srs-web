# Plan: e2e test — migrations panel apply flow (#222)

## Summary

The migrations panel (srs-web#221) shipped with unit tests (`tests/srs-client.test.ts`,
`tests/Migrations.test.ts`) and GovernanceShell integration tests, but no Playwright end-to-end
spec. An e2e spec was deferred because no `.srsj` fixture existed in a pre-migration state that
would exercise the Apply button. This plan delivers that spec now. The `sample.srsj` fixture
(used by `load-repo.spec.ts`, `navigation.spec.ts`, and `validation.spec.ts`) has both
`migrate-identity` and `repo-upgrade` migrations in `needed` state — confirmed via
`available_migrations()` against the current WASM release. It also requires a one-line fix to
`sample.srsj` (remove a stale `identityInstanceId` that causes RFC-018 validation errors, and
clear stale `precedes` relations that use an undeclared relation type) — fixing these errors is a
prerequisite for the "clean" validation test that was already failing in CI on #221's PR.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Web App Worker |
| Web App Worker | Web App Worker |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS. The e2e spec drives the browser UI only — no SRS logic in the test code. | accepted |
| [ADR-002](../docs/adr/002-editor-mode-selection.md) | All governance e2e tests open with `getByTestId("mode-governance").click()` per ADR-002 convention. | accepted |
| [ADR-009](../docs/adr/009-container-nav.md) | ADR-009 governs container-driven nav (the "Articles" sentinel in beforeEach). The sentinel is a container-driven link that only appears after repository_navigation() completes, ensuring WASM nav is ready before any test begins. | accepted |
| [ADR-013](../docs/adr/013-repository-tool-sections.md) | Migrations live in the "Repository" NavGroup (extends ADR-009). The spec navigates via the "Migrations" nav link. | accepted |

No new ADR required — this plan adds only a test file and a fixture fix. No architectural decision with long-term consequences.

### onMigrationApplied callback

`GovernanceShell` wires `onMigrationApplied` to call `loadContainerNav()` + `refreshValidation()` only — no `exportSrsj()` call, no save, no download. The test never triggers a save. Confirmed via GovernanceShell.svelte:1039-1042.

---

## Contracts

### WASM API surface

**No new or changed WASM methods.** `available_migrations()` and `apply_migration(id)` are
already present in the current srs-rust WASM release and wrapped in `srs-client.ts` as
`availableMigrations()` / `applyMigration()`. Confirmed via direct WASM load.

### TypeScript types

No type changes. `MigrationSummary`, `MigrationStatus`, and `MigrationApplyResult` are already
exported from `srs-client.ts` (added in #221).

---

## Scope

In scope:

- Fix `e2e/fixtures/sample.srsj`: remove `identityInstanceId` from `manifest.container` and
  clear stale `precedes` relations from `relations/relations-collection.json`. This makes the
  fixture RFC-018-clean and also makes both `migrate-identity` and `repo-upgrade` report
  `status: needed` via `available_migrations()`.
- Write `e2e/migrations.spec.ts` with four tests:
  1. Clicking "Migrations" nav item shows the migrations panel heading.
  2. The panel lists both `migrate-identity` and `repo-upgrade` with "Needed" badges.
  3. Applying `migrate-identity` shows a result payload and flips the badge to "Applied".
  4. After apply, the governance nav (Articles, Decision Log, etc.) is still intact — no regression.

**Out of scope:**

- Generating a new `.srsj` fixture from the Rust CLI (not available in this cloud session;
  `sample.srsj` is an existing checked-in fixture and passes WASM load after the fix).
- Testing `repo-upgrade` apply (one migration apply is sufficient to prove the flow; testing
  both would be redundant given unit test coverage).
- Visual/CSS assertions on badge colours.

---

## Phases

### Phase 1: Fix sample.srsj + write migrations.spec.ts

**Goal:** `npm run e2e` passes with a new `migrations.spec.ts` that exercises the full apply
flow against `sample.srsj`.

**Agent:** Web App Worker

#### Tasks

- [x] Fix `e2e/fixtures/sample.srsj`:
  - Remove `identityInstanceId` key from `manifest.container`.
  - Set `relations/relations-collection.json` → `"relations": []`.
- [ ] Write `e2e/migrations.spec.ts` using `sample.srsj` as the fixture:
  - `beforeEach`: load governance mode, upload `sample.srsj`, wait for "Articles" nav link.
  - Test 1: click "Migrations" nav link → verify `h2` "Migrations" is visible.
  - Test 2: verify both migration rows show `.migration-badge--needed`.
  - Test 3: click Apply on `migrate-identity` row → wait for `.migration-result--ok` → verify badge becomes `.migration-badge--applied`.
  - Test 4: click "Articles" nav link → verify governance heading is still visible (no regression).
- [ ] Run `npm run e2e -- --grep "Migrations panel"` — all 4 tests pass.
- [ ] Run `npm run e2e` — all existing tests still pass (especially `validation.spec.ts`).

#### Acceptance Criteria

- [ ] `e2e/migrations.spec.ts` exists and covers the four scenarios above.
- [ ] `sample.srsj` passes WASM load with 0 validation errors (validation inspector shows "clean").
- [ ] Applying `migrate-identity` shows the result payload inline and badge flips to "Applied".
- [ ] After apply, clicking "Articles" nav link shows the Articles section heading.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.
- [ ] `npm run e2e` passes with no regressions.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run e2e -- --grep "Migrations panel"
npm run e2e
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. `npm run typecheck` and `npm run build` pass.
3. Mark task checkboxes `[x]`.
4. Commit: `test(e2e): migrations panel apply flow — fixture fix + spec (#222)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (217 tests)
- [ ] `npm run e2e` passes — including new `migrations.spec.ts` and existing `validation.spec.ts`
- [ ] WASM loads against `sample.srsj` with 0 validation errors
- [ ] `migrate-identity` apply flow verified end-to-end

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The e2e spec is pure UI driver.
- The `apply_migration` call mutates the in-memory WASM repo; the test must NOT trigger a save.

## Assumptions

- `available_migrations()` and `apply_migration(id)` behave stably in the current WASM release.
- `sample.srsj` after the fix is a valid fixture (confirmed: WASM loads it, 0 errors, both
  migrations report `status: needed`).
- The `migrate-identity` migration completes synchronously in the WASM (no async loading).
