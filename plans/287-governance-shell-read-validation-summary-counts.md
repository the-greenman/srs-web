# Plan: GovernanceShell reads errorCount/warnCount from report.summary

## Summary

`GovernanceShell.svelte` computes `errorCount`/`warnCount` by filtering the local `diagnostics[]` array by severity, even though the WASM engine's `RepositoryValidationReport` already returns these counts directly at `report.summary.errors`/`report.summary.warnings` — exactly as `GuidesShell.svelte` already reads them. Per ADR-001 (thin client, zero SRS semantics in TS) and capability-layering, re-deriving a count the engine already computes is redundant client-side logic to avoid. This plan makes `GovernanceShell` read the engine's counts directly, matching `GuidesShell`'s pattern, and adds a one-line documentation fix in `migrations.spec.ts` for an unrelated, tiny, adjacent gap found during the same review (why `sample.srsj` must stay unmigrated).

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

No new ADR — this plan implements ADR-001, it does not extend or change it.

---

## Contracts

### WASM API surface

Does this plan require new or changed WASM methods in `srs-rust`?

- **No.** `report.summary.errors` and `report.summary.warnings` already exist on `RepositoryValidationReport` (`src/lib/srs-client.ts:124`) and are already consumed correctly by `GuidesShell.svelte:176-177`. This plan only changes which existing field `GovernanceShell.svelte` reads.

### TypeScript types

No type changes — `RepositoryValidationReport`'s shape is unchanged.

---

## Scope

- In `src/lib/governance/GovernanceShell.svelte`:
  - Replace the `$derived` `errorCount`/`warnCount` (lines 289–292, filtering `diagnostics[]` by severity) with `$state<number>(0)` values set directly inside `refreshValidation()` (line 480–489) from `report.summary.errors` / `report.summary.warnings`, matching `GuidesShell.svelte`'s pattern (`warnCount = report.summary.warnings; errorCount = report.summary.errors;`).
  - `diagnostics` state and its consumers (the full diagnostics list at line 1278, `mapDiagnostic`) are untouched — only the count derivation moves.
  - `validationAside` (line 295–299) and the size-warning banner (line 1031–1033) keep reading `errorCount`/`warnCount` as before — no change to their logic, only to what feeds the two variables.
- In `e2e/migrations.spec.ts`: add a one-line comment noting that `sample.srsj` is deliberately left unmigrated (no `identityInstanceId`) so this spec's "migrate-identity … Needed" assertion has a fixture to exercise, reciprocating the note already in `navigation.spec.ts` (which now points at `gallery.srsj` instead, for exactly this reason).

**Out of scope:**
- Any change to `GuidesShell.svelte` (already correct).
- Any change to the WASM binding or `RepositoryValidationReport` shape.
- A shared fixtures README documenting every e2e fixture's intended state — the plan's e2e-comment fix above is the minimal reciprocal note; a broader fixtures doc is a separate, larger effort not warranted by this small fix.
- Deduplicating `mockRepo`/`validate()` test-mock scaffolding across `GovernanceShell.test.ts`/`GuidesShell.test.ts` — a pre-existing nice-to-have, not a defect, and not touched by this change.

---

## Phases

### Phase 1: Read validation counts from report.summary

**Goal:** `GovernanceShell`'s error/warning counts come from the engine's own summary, not a client-side re-filter, with no behavior change to what the UI displays.

**Agent:** Web App Worker

#### Tasks

- [ ] In `GovernanceShell.svelte`, replace the `errorCount`/`warnCount` `$derived` declarations with `$state<number>(0)` declarations, initialized near `instanceCount`/`attachmentCount` (line 152–154).
- [ ] In `refreshValidation()`, after `instanceCount = report.summary.checked;`, add `errorCount = report.summary.errors;` and `warnCount = report.summary.warnings;`.
- [ ] Remove the now-unused severity-filter derivation and its two doc comments (lines 288–292).
- [ ] Add the reciprocal one-line comment to `e2e/migrations.spec.ts` explaining why `sample.srsj` must stay unmigrated.
- [ ] Update/adjust any unit test in `GovernanceShell.test.ts` that mocked `diagnostics` expecting `errorCount`/`warnCount` to be derived from it — mocks should instead set `report.summary.errors`/`.warnings` directly (mirroring `GuidesShell.test.ts`'s existing mock shape), so the test continues to exercise the real code path.

#### Acceptance Criteria

- [ ] `errorCount`/`warnCount` are populated from `report.summary.errors`/`report.summary.warnings`, not from filtering `diagnostics[]`.
- [ ] `validationAside` and the size-warning banner display unchanged (same values, same conditions).
- [ ] `GovernanceShell.test.ts` passes and its mocks reflect the new read path.
- [ ] No regression in `GuidesShell.svelte` (untouched).

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

Specific tests to verify: any `GovernanceShell.test.ts` case that asserts the inspector's error/warning display, updated to mock `report.summary.errors`/`.warnings` instead of relying on `diagnostics[]` severity filtering.

#### Milestone gate

1. Verify all acceptance criteria above.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update this plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#287)`).

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes (validation.spec.ts's inspector count assertions, in particular)
- [ ] WASM loads and all WASM API calls succeed against `gallery.srsj`
- [ ] No visible behavior change in the Repository inspector or size-warning banner

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001) — this plan removes client-side re-derivation, it doesn't add any.
- Verification Agent runs after the phase and before final sign-off.

## Assumptions

- `report.summary.errors`/`report.summary.warnings` count diagnostics identically to the client's own severity filter (same underlying diagnostics, engine-authoritative) — confirmed by `GuidesShell.svelte` already relying on this equivalence in production.
- No e2e test currently depends on `errorCount`/`warnCount` being `$derived` (reactive to `diagnostics[]` changing outside `refreshValidation()`) rather than a plain `$state` set inside it — `diagnostics` is only ever assigned inside `refreshValidation()`, so the two are behaviorally equivalent.
