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
shipped in published release `v0.1.0-build.499`. The WASM binding now throws a real
`js_sys::Error` carrying a stable `.code` field (`"lifecycle-not-defined"` for this variant,
`RepositoryError::code()` in `srs-repository/src/error.rs`). This plan bumps the bindings pin to
that release and switches the catch branch to check `e.code` instead of matching message text,
per ADR-048 rule 6 (identifier over label in outputs) — exactly what the issue asks for and
explicitly rules out another text-matching patch.

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
message → `js_sys::Error` with `.code`/`.details`), as of srs-rust `v0.1.0-build.497`+. This plan
bumps the pinned bindings build consumed by `scripts/ensure-bindings.mjs` to pick that up.

### TypeScript types

No new payload type needed. The WASM-thrown error already surfaces as a JS `Error`-like object
with `.code: string` — this plan narrows the `catch (e: unknown)` branch to check `e.code` with a
runtime guard (`e && typeof e === "object" && "code" in e`), not a new generated type.

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

- [ ] Fetch `v0.1.0-build.499`'s `srs-bindings-web.tar.gz.sha256` asset from srs-rust releases;
      update `scripts/ensure-bindings.mjs` `DEFAULT_URL` and `SHA256` to that release.
- [ ] Run `node scripts/ensure-bindings.mjs --force` to refresh local bindings against the new pin.
- [ ] In `src/lib/srs-client.ts`, change `getAllowedLifecycleTransitions`'s catch branch to check
      the thrown value's `.code === "lifecycle-not-defined"` (with a safe runtime type guard)
      instead of `e instanceof Error && e.message.includes("LifecycleNotDefined")`. Update the
      comment above it to reference the stable code instead of the Rust variant name/message text.
- [ ] Add a unit test (co-located with existing `srs-client` tests) that mocks
      `repo.get_allowed_lifecycle_transitions` to throw an error shaped like the WASM binding's
      real throw (`Object.assign(new Error(...), { code: "lifecycle-not-defined" })`) and asserts
      the function returns `null`; add a second case with an unrelated code asserting the error
      is rethrown.

#### Acceptance Criteria

- [ ] `getAllowedLifecycleTransitions` returns `null` when the WASM call throws an error with
      `code === "lifecycle-not-defined"`.
- [ ] Any other thrown error (different code, or no code at all) is still rethrown unchanged.
- [ ] `npm run typecheck` passes.
- [ ] No regression in `GovernanceShell.svelte`'s immutable/editable detection for records that
      *do* have a lifecycle.

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
- [ ] A record whose Type has no lifecycle defined shows as editable (not immutable) in
      `GovernanceShell`, verified via dogfooding (Stage 7.6) against the live dev server

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
