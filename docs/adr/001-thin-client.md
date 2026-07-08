# ADR-001: srs-web is a thin WASM client — zero SRS semantics in TypeScript

- **Status:** accepted
- **Date:** 2026-06-07 (proposed), 2026-06-26 (accepted)
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

## Relationship to the capability-layering guide

This ADR is the srs-web end of the ecosystem-wide default path documented in
`srs-rust/docs/architecture/capability-layering.md`: a capability is built once as a
`srs-repository` service, exposed through a WASM binding, and srs-web consumes the
binding and renders the result. The canonical violation of this rule was a bespoke
client-side search filter (`DecisionLogView.svelte`) — semantics in a leaf client,
unreachable by the CLI or any other engine. Its corrected form is the portable `find`
capability (srs-rust EPIC #212).

## Residual TypeScript-semantics debt (to migrate behind bindings)

The following client-side logic still encodes SRS semantics in TypeScript and should be
pushed down into `srs-bindings` over time. None is new work for this ADR; it is recorded
here so it isn't mistaken for acceptable presentation logic:

- **Relation-chain traversal** — `orderByPrecedes` / `rebuildPrecedesChain` in
  `GuidesShell.svelte` follow and rebuild `precedes` chains in TS. This is graph
  ordering that belongs in a `srs-repository` service exposed as an ordered-relations
  binding.
- **Field-by-name lookup** — `getFieldValue` / `getStringField` / `findFieldId`
  (`governance/field-utils.ts`) resolve field values and IDs via a linear scan of the
  WASM-derived `fieldMeta` map, keyed by the package field name. The hardcoded
  `STATUS_FIELD_ID` UUID constant was removed in #86; the write path now uses the same
  name-based `findFieldId("status", fieldMeta)` pattern as the read path. The remaining
  debt is that the binding should eventually return fields addressable by name directly,
  eliminating the TS-side scan. (The governance **list pane** no longer uses this —
  its columns are now driven by the core DocumentView column spec, see
  [ADR-010](./010-view-driven-list-columns.md); the remaining callers are the
  inspector status/lifecycle (`GovernanceShell.svelte`), decision card display
  (`DecisionSummaryCard.svelte`), and export path (`decision-export-utils.ts`). The
  **filter** use in `DecisionLogView.svelte` was migrated to
  `find(repo, { excludeLifecycleStates })` in #118 — see ADR-022 in srs-rust.)
- **Hardcoded vocabularies** — the lifecycle `STATUS_OPTIONS` list is hardcoded in TS
  instead of derived from the type/lifecycle definition via a binding.
- **Relation type derivation** — `loadInstalledRelationTypes()` in `GovernanceShell.svelte`
  derives the installed relation types by parsing the output of `exportSrsj(repo)` rather
  than calling a dedicated WASM binding. This is an approved interim exception for the
  transitional period while `list_relation_types` is not yet exposed in `srs-bindings`
  (tracked as srs-rust#411). Once that binding is available, `loadInstalledRelationTypes`
  must be replaced with a direct `listRelationTypes(repo)` call and this entry removed.
  (Added in srs-web#160.)
