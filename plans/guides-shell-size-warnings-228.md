# Plan: Surface size warnings in GuidesShell (non-blocking banner)

> Issue: srs-web#228

## Summary

GovernanceShell already calls `repo.validate()` on load and shows a non-blocking warning banner when `summary.warnings > 0 && errorCount === 0`. GuidesShell does not call `validate()` at all, so size warnings from the WASM engine are silently swallowed in guides mode. This plan wires up validation in GuidesShell and surfaces the same advisory banner, mirroring the GovernanceShell pattern with no new WASM bindings required.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrator |
| Web App Worker | orchestrator |
| Verification | orchestrator |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | All validation goes through `repo.validate()` WASM call; no TS-side re-implementation | accepted |

No new ADR required. This change applies the existing `repo.validate()` WASM binding already used in GovernanceShell to GuidesShell. The pattern is established; no new constraint or rejected alternative is introduced.

**Implementation approach vs GovernanceShell:** GovernanceShell stores `report.diagnostics.map(mapDiagnostic)` as a `$state<Diagnostic[]>` and derives counts via `$derived` filters — it needs the full array because it renders a Diagnostics inspector panel. GuidesShell has no such panel, so it only needs the integer counts. Reading `report.summary.warnings` and `report.summary.errors` directly is simpler and appropriate for this narrower use-case. Both are populated by the same WASM call; the `summary` field is the engine's authoritative count summary and the source of truth for counts (distinct from the `diagnostics` array, which the WASM populates for per-instance detail). This is intentionally different from GovernanceShell, not a copy error.

---

## Contracts

### WASM API surface

No new or changed WASM methods are needed. `SrsRepository.validate()` is already exposed in `srs-client.ts:23` and returns `RepositoryValidationReport` with `summary: { checked, errors, warnings }` (srs-client.ts:97).

`RepositoryValidationReport` also has a top-level `errorCount: number` field (srs-client.ts:95). For symmetry, `summary.errors` is used here (same source object as `summary.warnings`), which is unambiguously co-consistent.

### TypeScript types

`RepositoryValidationReport` from `src/lib/srs-client.ts:93` covers the return shape. No TS type changes needed.

---

## Scope

- Add `warnCount` and `errorCount` reactive state in `GuidesShell.svelte`, populated by `repo.validate()` called after repo is loaded in `onMount()`.
- Add the non-blocking warning banner below the Topbar when `warnCount > 0 && errorCount === 0`.
- Style the banner consistently with the `GovernanceShell.svelte` `.size-warning-banner` style (copy it into GuidesShell's scoped `<style>` block).

**Out of scope:**

- Adding a full Diagnostics/Repository inspector panel to GuidesShell (a separate, larger issue).
- Re-validating on every record mutation in GuidesShell (the existing pattern in GovernanceShell does re-validate, but GuidesShell has no mutation paths that cross the size threshold in normal use — the banner on load is the agreed acceptance criterion per the issue).
- Dark-mode overrides beyond copying the GovernanceShell pattern.

---

## Phases

### Phase 1: Wire validation and add banner

**Goal:** GuidesShell calls `repo.validate()` on load, stores the counts, and shows the advisory banner when `warnCount > 0 && errorCount === 0`.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/guides/GuidesShell.svelte`, add two `$state` variables:
  ```ts
  let warnCount = $state(0);
  let errorCount = $state(0);
  ```
- [ ] Add a `refreshValidation()` function:
  ```ts
  function refreshValidation(): void {
    const report = repo.validate();
    warnCount = report.summary.warnings;
    errorCount = report.summary.errors;
  }
  ```
- [ ] Call `refreshValidation()` at the end of `onMount()` (after `reload()`), so it runs once when the repo is first loaded.
- [ ] In the template, insert the warning banner immediately after `<Topbar>` closes and before the `{#if schemaError}` block:
  ```svelte
  {#if warnCount > 0 && errorCount === 0}
    <div class="size-warning-banner" role="status">
      {warnCount} size warning{warnCount === 1 ? "" : "s"} — see Repository panel for details.
    </div>
  {/if}
  ```
- [ ] Add the `.size-warning-banner` style to the scoped `<style>` block, matching GovernanceShell exactly:
  ```css
  .size-warning-banner {
    padding: 0.4rem 1.25rem;
    font-size: 0.8rem;
    background: color-mix(in srgb, var(--warn, #b45309) 10%, transparent);
    color: var(--warn-text, #92400e);
    border-bottom: 1px solid color-mix(in srgb, var(--warn, #b45309) 20%, transparent);
  }

  @media (prefers-color-scheme: dark) {
    .size-warning-banner {
      background: color-mix(in srgb, #d97706 12%, transparent);
      color: #fde68a;
      border-bottom-color: color-mix(in srgb, #d97706 25%, transparent);
    }
  }
  ```

#### Acceptance Criteria

- [ ] When a guides-mode repo has `summary.warnings > 0` and `summary.errors === 0`, the banner appears below the Topbar.
- [ ] Banner is absent when `errorCount > 0` (mixed errors + warnings case: the safety interlock fires and the banner is suppressed).
- [ ] Banner is absent when `warnCount === 0`.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

Banner-specific unit test to add in `tests/` (or alongside existing GuidesShell tests if present): mock `repo.validate()` to return `{ summary: { warnings: 2, errors: 0, checked: 10 }, diagnostics: [], instanceCount: 5, errorCount: 0 }` and assert the banner renders; then repeat with `errors: 1` and assert it does not render; then `warnings: 0` and assert it does not render.

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit: `feat: surface size warnings in GuidesShell (#228)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (including the three banner unit test cases: warnings-only shows, errors+warnings suppresses, no-warnings absent)
- [ ] Warning banner appears in GuidesShell when `summary.warnings > 0 && summary.errors === 0`
- [ ] Banner absent when both errors and warnings present (`errorCount > 0` safety interlock)
- [ ] Banner absent when no warnings

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). Validation delegated entirely to `repo.validate()`.

## Assumptions

- `repo.validate()` is called once at mount; the banner reflects the state at load time. Incremental re-validation on every mutation is out of scope for this issue.
- GuidesShell does not have a Diagnostics inspector panel (unlike GovernanceShell); the banner text referencing "Repository panel" is intentional — it is a shared advisory string guiding users to the governance view where the full diagnostics surface is available.
