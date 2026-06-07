# Agent Definitions — srs-web

Agent roles for use in srs-web plan files. For the shared Rust-side roles (Bindings Worker, Repository Service Worker, Architecture Reviewer, Plan Reviewer, Verification Agent), see [srs-rust/plans/agents.md](https://github.com/the-greenman/srs-rust/blob/main/plans/agents.md).

---

## Lead Integrator

- **Owns:** Architecture decisions, sequencing, final integration, public API consistency, and review.
- **Write scope:** Workspace configuration, cross-repo wiring, final cleanup.
- **Coordination:** Merges worker outputs, resolves API disagreements, enforces ADR-001. Freezes the WASM binding API names (from srs-rust B6/B7/B8) before the srs-web edit forms (B9) consume them.
- **Does not:** Implement features directly — delegates to workers and reviews their output.

---

## Web App Worker

- **Owns:** TypeScript/TS source in srs-web — components, forms, rendering, routing, WASM glue.
- **Write scope:** `srs-web/**` only. No changes to `srs-rust/`, `srs/`, or `srs-vscode/`.
- **Constraints:**
  - **ADR-001 is the hard constraint:** no SRS semantics in TypeScript. Every mutation, validation, lifecycle transition, relation operation, and serialisation call goes through the WASM API. If a capability doesn't exist in the WASM API, file a `srs-rust` issue — do not implement it in TS.
  - Follow the WASM method signatures frozen by the Lead Integrator.
  - `npm run typecheck` must pass after every change.
  - Port repeatable-field and field-group widget logic from `srs-vscode/src/webview/forms.ts` rather than reinventing it.
- **Returns:** changed file paths and a short behaviour summary.

---

## Verification Agent (srs-web)

- **Owns:** Test runs and behaviour verification for srs-web.
- **Write scope:** None (read-only unless explicitly asked to patch tests).
- **Deliverables:**
  - `npm run typecheck` output.
  - `npm run build` output.
  - Confirm WASM loads and `loadRepo(srsj)` succeeds against `gallery.srsj`.
  - Confirm round-trip: load → mutate → `export_srsj()` → reload → same record count.
  - Report any broken imports, type errors, or runtime JS errors.

---

## Architecture Reviewer (srs-web)

- **Owns:** Reviewing plans and diffs against ADR-001 and the srs-web architectural rules. Read-only.
- **Write scope:** None — produces findings only.
- **Reviews for, in priority order:**
  1. ADR-001 violations: SRS semantics re-implemented in TypeScript.
  2. WASM API drift: TS types inconsistent with the payload schemas from `srs-rust/crates/srs-cli/schemas/payload/`.
  3. Scope creep: work outside `srs-web/**`.
  4. Incomplete plans: missing acceptance criteria, missing tests, missing dependency declarations.
- **Constraints:** Every finding cites the specific ADR or rule violated, with `blocking` / `should-fix` / `nit` severity.
