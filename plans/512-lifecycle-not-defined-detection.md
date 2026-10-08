# Plan: Detect LifecycleNotDefined via structured error code

## Summary

`getAllowedLifecycleTransitions` (`src/lib/srs-client.ts`) is supposed to return `null` when a
record's Type has no lifecycle defined, so the UI treats the record as editable. The current
catch branch matches `e.message.includes("LifecycleNotDefined")`, which never matches: the WASM
binding threw a bare string (not an `Error`), and even when it threw an `Error` the Rust Display
text ("record '…' has no lifecycle defined on its Type") never contains the variant name. Every
record whose Type has no lifecycle therefore falls through to `GovernanceShell.svelte`'s
fail-closed branch and renders immutable.

srs-rust#1338 (structured errors through the CLI envelope, WASM, and MCP) has since landed and
shipped in published release `v0.1.0-build.499` (the current latest published, non-draft
srs-rust release; confirmed via `gh api repos/the-greenman/srs-rust/releases/tags/v0.1.0-build.499`
→ `"draft": false`, and it is a strict git descendant of the `v0.1.0-build.497` tag, which points
exactly at the merge commit for srs-rust PR #1346/"feat/1338-structured-errors"). The WASM binding
now throws a real `js_sys::Error` carrying a stable `.code` field (`"lifecycle-not-defined"` for
this variant — `RepositoryError::code()` in `srs-repository/src/error.rs:1178`; the `.code` field
is set via `js_sys::Reflect::set` in `srs-bindings/src/lib.rs`'s `report_to_js`, ~line 85). This
plan bumps the bindings pin to that release and switches the catch branch to check `e.code`
instead of matching message text, per ADR-048 rule 6 (identifier over label in outputs,
`srs-rust/docs/adr/048-implementation-decision-rules.md`, amendment 2026-10-08, #1264) — exactly
what the issue asks for and explicitly rules out another text-matching patch.

**Review note:** only `.code` is confirmed set on the thrown error; `.details` is not guaranteed
present for this variant (it is only populated when the error carries structured detail fields,
which `LifecycleNotDefined` does not) and must not be relied on by this fix.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrating session |
| Web App Worker | — |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS — this fix removes a text-matching heuristic in favor of the engine's own structured code, strengthening ADR-001 compliance rather than weakening it | accepted (governs, no change) |
| [ADR-012](../docs/adr/012-governance-status-via-lifecycle-binding.md) | Governance status is read/written exclusively through `get_allowed_lifecycle_transitions`/`set_lifecycle_state`; the UI renders the binding's result rather than encoding lifecycle semantics itself — this fix keeps that contract intact and only fixes how the *absence* of a lifecycle is detected | accepted (governs, no change) |
| ADR-048 (srs-rust) rule 6 | Identifier (`code`) over label (message text) in client error handling | accepted (governs, no change — srs-rust side) |

No new ADR needed: this is a straightforward application of an existing, already-accepted rule once its dependency (srs-rust#1338) shipped.

---

## Contracts

### WASM API surface

No new or changed WASM methods. `get_allowed_lifecycle_transitions` already exists; only the
shape of the error it throws on the `LifecycleNotDefined` path changes (plain string/unstructured
message → `js_sys::Error` with `.code`), as of srs-rust `v0.1.0-build.497`+ (this plan pins to
`v0.1.0-build.499`, the current latest). This plan bumps the pinned bindings build consumed by
`scripts/ensure-bindings.mjs` to pick that up.

### TypeScript types

No new payload type needed. The WASM-thrown error already surfaces as a JS `Error` with a
`.code: string` property — this plan narrows the `catch (e: unknown)` branch to
`e instanceof Error && (e as { code?: unknown }).code === "lifecycle-not-defined"`, not a new
generated type.

---

## Scope

- Bump `scripts/ensure-bindings.mjs` `DEFAULT_URL`/`SHA256` to srs-rust release `v0.1.0-build.499`
  (latest published release carrying the srs-rust#1338 fix) and refresh the local bindings.
- Fix `getAllowedLifecycleTransitions` in `src/lib/srs-client.ts` to branch on the structured
  `code` field (`"lifecycle-not-defined"`) instead of matching message text.
- Add/extend a unit test proving a record whose Type has no lifecycle returns `null` from
  `getAllowedLifecycleTransitions` given the new structured error shape, and that an unrelated
  error with a different code is still rethrown.

**Out of scope:**

- Any other `instanceof Error && message.includes(...)` text-matching sites in the codebase
  (e.g. srs-vscode#131's analogous bug in a different repo) — file as a follow-up if found here,
  but do not expand this PR's surface beyond the #512 fix.
- Re-auditing every WASM error call site in srs-web for the same anti-pattern — out of scope for
  this bug fix; file a follow-up issue if other instances turn up during the fix.

---

## Phases

### Phase 1: Bump bindings pin + fix error handling

**Goal:** `getAllowedLifecycleTransitions` correctly returns `null` for a lifecycle-less record
using the now-available structured error code, against the currently-published WASM bindings.

**Agent:** Web App Worker

#### Tasks

- [x] Fetch `v0.1.0-build.499`'s `srs-bindings-web.tar.gz.sha256` asset from srs-rust releases;
      update `scripts/ensure-bindings.mjs` `DEFAULT_URL` and `SHA256` to that release.
- [x] Run `node scripts/ensure-bindings.mjs --force` to refresh local bindings against the new pin.
- [x] In `src/lib/srs-client.ts`, change `getAllowedLifecycleTransitions`'s catch branch (~line 971)
      to `e instanceof Error && (e as { code?: unknown }).code === "lifecycle-not-defined"` instead
      of `e instanceof Error && e.message.includes("LifecycleNotDefined")`. Update the doc comment
      above the function (~lines 954-961) to reference the stable code instead of the Rust variant
      name/message text.
- [x] **Update the pre-existing test** `tests/srs-client.test.ts`, `describe("getAllowedLifecycleTransitions", ...)`,
      the case `"returns null when WASM throws LifecycleNotDefined"` (~lines 1645-1653): it
      currently mocks `throw new Error("LifecycleNotDefined: record has no lifecycle")`, which
      passes today only because of the old message-text match and does **not** reflect the real
      WASM throw shape. Replace the mock with
      `Object.assign(new Error("record 'x' has no lifecycle defined on its Type"), { code: "lifecycle-not-defined" })`
      (the real Rust Display text + the `.code` field) so the test actually exercises the fix. Do
      not treat this test breaking as a pre-existing failure to work around — it is expected to
      need this update.
- [x] Add one more case to the same `describe` block: an error with an unrelated `.code` (e.g.
      `"not-found"`) is still rethrown. Leave the existing `"re-throws errors that are not
      LifecycleNotDefined"` and `"re-throws non-Error throws"` cases as-is — they remain valid
      against the new guard unmodified.

#### Acceptance Criteria

- [ ] `getAllowedLifecycleTransitions` returns `null` when the WASM call throws an `Error` with
      `code === "lifecycle-not-defined"`.
- [ ] Any other thrown error (different code, no code, or a non-`Error` throw) is still rethrown
      unchanged.
- [ ] `npm run typecheck` passes.
- [ ] **WASM smoke check:** after the bindings pin bump, loading `e2e/fixtures/gallery.srsj` and
      calling `get_allowed_lifecycle_transitions` on a lifecycle-bearing record — e.g.
      `00000000-0000-4000-8000-000000005801` ("Old superseded decision", type `governance/decision`,
      which has `lifecycleRef` set and carries `lifecycleState: "superseded"`, verified via
      `srs type list`/`srs record list` against an exploded copy of the fixture — still returns a
      populated `AllowedLifecycleTransitionsResult`, not an error. This proves the bindings bump
      didn't change the non-error path. Cover this with a unit test using the real bundle if
      practical, otherwise confirm manually before Stage 7.6.
- [ ] No regression in `GovernanceShell.svelte`'s immutable/editable detection for records that
      *do* have a lifecycle: the existing lifecycle-path tests in `tests/srs-client.test.ts`
      (`"returns the WASM payload cast as AllowedLifecycleTransitionsResult"`,
      `"passes the instance_id to the WASM method"`) still pass unmodified, and (per Stage 7.6)
      a record of type `governance/decision` (lifecycle-bearing) still shows its transitions and
      immutability state correctly in `GovernanceShell`, not just the lifecycle-less case.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update this plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#512)`).

Do not start the next phase until the milestone gate passes.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] WASM loads and all WASM API calls succeed against `gallery.srsj`
- [ ] Record `5ec00004-0000-4000-8000-000000000004` ("Exercises", type `governance/exercise`,
      which has no `lifecycleRef`) shows as editable (not immutable) in `GovernanceShell`,
      verified via dogfooding (Stage 7.6) against the live dev server with `gallery.srsj` loaded
- [ ] Record `00000000-0000-4000-8000-000000005801` ("Old superseded decision", type
      `governance/decision`, lifecycle-bearing, state `superseded`) still correctly shows as
      immutable (final state) in `GovernanceShell`, confirming no regression on the path that
      already worked

## Branch & PR

- Branch: `fix/512-lifecycle-not-defined-detection` (already created off `origin/main`, per
  `srs-web/CLAUDE.md` naming convention for human/agent-filed fixes).
- PR body must include `Closes #512`.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001) — this fix only changes which field of the
  already-thrown error is inspected; no new validation logic is added in TS.
- Verification Agent runs after the phase and before final sign-off.

## Assumptions

- `v0.1.0-build.499` is the latest published (non-draft) srs-rust release at plan time and
  contains the srs-rust#1338 fix (verified: tag `v0.1.0-build.497` points at the PR #1346 merge
  commit; `v0.1.0-build.499` is a strict descendant).
- No other srs-web call site needs the same fix to satisfy #512's acceptance criteria; other
  text-matching sites (e.g. the analogous srs-vscode#131 bug, in a different repo) are explicitly
  out of scope.
