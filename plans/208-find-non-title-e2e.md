# Plan: Add e2e assertion for non-title text field match via WASM find (srs-web#208)

## Summary

The WASM `find` binding routes `DecisionLogView` search through all text fields (not just title), but no e2e test explicitly asserts that a term appearing only in non-title fields returns the correct decision. This plan adds one such test to `e2e/gallery.spec.ts`, completing the acceptance criteria of srs-rust#219.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Claude (this session) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |

No new ADR required — this is a pure test addition with no architectural impact.

---

## Contracts

### WASM API surface

**No new WASM methods required.** The `find` binding is already present in `srs-client.ts` (line 1085) and the WASM binary (downloaded via `prebuild`).

### TypeScript types

No type changes required.

---

## Scope

**In scope:**

- `e2e/gallery.spec.ts`: add one test in the "Decision Log — search" describe block asserting that searching for `"overextending"` (a term that appears only in the concerns field of the "Phase 1 scope" decision, not its title) returns exactly one decision card with title "Phase 1 scope".

**Out of scope:**

- Any implementation changes (already complete in prior sessions via srs-web#104 and #126).
- Modifying `DecisionLogView.svelte`, `decision-log-utils.ts`, or `srs-client.ts`.

---

## Phases

### Phase 1: Add non-title e2e search assertion

**Goal:** `e2e/gallery.spec.ts` contains an explicit test proving that WASM `find` matches text in non-title fields.

**Agent:** Web App Worker

#### Tasks

- [ ] In `e2e/gallery.spec.ts`, within the `"Decision Log — sort and filter controls"` `test.describe` block (after the "search is case-insensitive" test, before the closing `});` at line 295), add:
  ```ts
  test("search matches text in non-title fields (body content)", async ({ page }) => {
    // "overextending" appears only in the concerns field of "Phase 1 scope", not its title.
    // This verifies WASM find() searches beyond the display label.
    await page.getByTestId("search-input").fill("overextending");
    const cards = page.getByTestId("decision-summary-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.filter({ hasText: "Phase 1 scope" })).toHaveCount(1);
  });
  ```

#### Acceptance Criteria

- [ ] New test present in `e2e/gallery.spec.ts`.
- [ ] Searching "overextending" returns exactly 1 decision card with text "Phase 1 scope".
- [ ] All existing search tests still pass.

#### Milestone gate

Commit: `test(e2e): assert WASM find matches non-title text fields (#208)`

---

## Final Acceptance

- [x] `npm run typecheck` passes (already confirmed)
- [x] `npm run lint` passes (already confirmed)
- [x] `npm run build` succeeds (WASM downloaded by prebuild)
- [ ] `npm test` passes
- [ ] New e2e test present and named search cases still pass
- [ ] `Closes the-greenman/srs-rust#219` in PR body

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001).

## Assumptions

- The gallery fixture's "Phase 1 scope" decision (`4a989562-4a9d-4c86-a365-91bf14d55f06`) has "overextending" only in field `1a1c0a5d-a1df-5d03-95f2-32af73bb71da` (concerns/risks), not in its title field `d7e82557-9045-5e92-a494-d99112bbec4a`.
- The WASM `find` text projection covers all text/string fields, including concerns.
- Chromium is available at `/opt/pw-browsers/chromium` (per cloud session setup).
