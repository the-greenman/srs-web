# ADR-001: srs-web is a thin WASM client — zero SRS semantics in TypeScript

- **Status:** accepted
- **Date:** 2026-06-07
- **Supersedes:** —
- **Superseded by:** —

## Context

srs-web is a browser-based governance editor for the SRS system. The SRS semantic engine — record creation, mutation, validation, relation management, lifecycle transitions, and `.srsj` serialisation — is already implemented in `srs-repository` (Rust) and exposed through the `srs-bindings` WASM module. A browser editor could alternatively re-implement these operations in TypeScript.

## Decision

srs-web holds **no SRS semantics in TypeScript**. All mutation, validation, lifecycle, relation, and serialisation operations are performed exclusively through the WASM API (`SrsRepository` from `srs-bindings`). The TypeScript layer is a presentation client only: it calls WASM methods, receives typed results, and renders them. It does not construct or interpret SRS record structures independently.

## Consequences

**Positive:**
- Semantic correctness is guaranteed by the Rust implementation — no drift between the WASM engine and the TS client.
- The WASM API acts as a stable contract; UI changes never risk corrupting the data model.
- Testing the semantic layer happens in Rust, which has the full test infrastructure.
- The TypeScript codebase stays small and focused on presentation concerns.

**Negative / trade-offs:**
- The editor requires the WASM build to be present (`wasm-pack build crates/srs-bindings --target web`). A fresh clone cannot run without this step.
- Round-trips through the WASM boundary add a small serialisation overhead. For governance editing (low-frequency mutations) this is negligible.
- New WASM bindings must be added to `srs-rust` before the UI can expose new operations — the UI cannot prototype ahead of the engine.

**Neutral:**
- The TypeScript types for WASM outputs are derived from the payload schemas in `srs-rust/crates/srs-cli/schemas/payload/`, keeping TS types in sync with the Rust contract.
