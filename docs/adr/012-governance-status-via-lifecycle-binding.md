# ADR-012: Governance status is read and written through the lifecycle WASM binding

- **Status:** accepted
- **Date:** 2026-07-07
- **Supersedes:** —
- **Superseded by:** —

## Context

Per [srs-rust ADR-022](../../srs-rust/docs/adr/022-governance-status-is-lifecycle-state.md)
(cross-repo reference), governance `status` is SRS lifecycle state — not an ordinary field.
This ADR records the concrete consequence for the srs-web codebase.

The governance editor contained the following TypeScript-layer SRS semantics that violate
[ADR-001](./001-thin-client.md) and the capability-layering guide:

- `src/lib/governance/lifecycle.ts` — hardcoded `LIFECYCLE_TRANSITIONS` transition graph and
  `IMMUTABLE_STATES` set, used to validate moves client-side.
- `src/lib/governance/field-utils.ts` — `STATUS_FIELD_ID` UUID constant, used to write status
  as a raw field value via `updateRecord`.

The `set_lifecycle_state` WASM binding existed in `srs-bindings` and was unused.

## Decision

The governance editor reads and writes decision status exclusively through the lifecycle WASM
bindings:

- **Query:** `get_allowed_lifecycle_transitions(repoPath, recordId)` returns the current state,
  allowed next states, and immutability flag. The UI renders this result; it does not consult
  any local transition table.
- **Write:** `set_lifecycle_state(repoPath, recordId, targetState)` performs the transition.
  The UI does not call `updateRecord` for status changes.

`lifecycle.ts` (transition tables, immutability constants) and the `STATUS_FIELD_ID` constant
are deleted. No TypeScript encodes the transition graph.

## Consequences

**Positive:**
- Eliminates the last hardcoded-vocabulary item from the ADR-001 residual debt list.
- The UI automatically reflects any future changes to a type's lifecycle definition without a TS
  code change.
- The web editor and the CLI (`srs-gov`) enforce the same transition graph — they both call the
  same Rust service.

**Negative / trade-offs:**
- The allowed-transitions WASM binding (srs-rust#375) must be present before this migration can
  ship. The UI cannot be updated independently of the engine.

**Neutral:**
- Immutability gating (srs-web#86) and hidden-status filtering (srs-web#118) read the
  `immutable` flag and current state from the `get_allowed_lifecycle_transitions` result —
  no separate field-value query is needed.

## Display-only exception (srs-web#179)

`DecisionSummaryCard.svelte` (list-row badge) and `decision-export-utils.ts` (export formatter)
read status via `repo.get_field_value_by_name(instanceId, "status")` rather than
`get_allowed_lifecycle_transitions`. This is an approved exception for display-only contexts
where calling the lifecycle binding per list row would be prohibitively expensive (one round-trip
per record). These callers do **not** write status and do not gate any control flow on the value.
The lifecycle binding remains the sole write path and the authority for immutability gating.
