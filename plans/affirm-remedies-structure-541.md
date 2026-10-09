# Plan: Method editor, show and affirm remedies, clusters and personas (#541, slice 1 of semanticops.com#34)

## Summary
The method editor (MethodShell, #526) lets the owner decide problems only. This adds remedies shown under the problems they `answers`, and the same decide actions (Affirm, Edit and affirm, Set aside, Restore, Comment) on remedies, clusters and personas, all through the existing `forkRecord` / `moveToContainer` paths. Answers SP-42, SP-12.

## Agent Assignments
| Role | Agent |
|---|---|
| Lead Integrator | ship-web session |
| Web App Worker | ship-web session |
| Verification | Verification Agent (srs-web) |

## Architecture Decisions
| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | No SRS semantics in TS: every write is `forkRecord` / container add/remove / `updateRecord`; the board only groups what the engine returns | proposed |
| Owner decision 2026-10-09 | Option A: the engine re-points carried relations to existing `derived-from` counterparts (srs-rust#1377). srs-web does NOT re-point links itself (rejects TS orchestration). Slice 1 ships without it; the "(suggested) drops" criterion moves to srs-web#546 | decided |
| Fork scope finding | Forking a cluster/persona forks that record only: `fork_subtree` forks the arrangement subtree in the TARGET container (Affirmed, flat); Suggestions is flat too (verified with `srs record fork` on a copy of srs-programme) | verified |
| Carry modes | remedy `outgoing` (issue text; epic `implements` links are owner-made later), cluster and persona `all` (keeps the domain `contains` and objective `addresses` edges). One table `CARRY` in method-document.ts; to be revisited with srs-rust#1377 | decided |

## Contracts
### WASM API surface
No new or changed binding: `fork_record` (with `targetContainer`, `carryRelations`), `add/remove_container_member`, `update_record`, `list_relations` all exist. Stage 1.5: no dependency for this scope.
### TypeScript types
`MethodRemedy`, `MethodLink`, `MethodProblem.remedies`, `MethodCluster.status/createdBy`, `MethodModel.remedies/clusters/personas` in `src/lib/method/method-document.ts`; presentation shapes only.

## Scope
- `buildBoard`: remedies (type edd84bf8-..., relation `com.semanticops.method/answers`, remedy -> problem) listed under each problem, never copied; status per decision container; a Suggested original with an Affirmed fork (`derived-from`) is hidden behind the fork for remedies, clusters and personas (as problems); problem cluster/persona resolve to the affirmed fork.
- New components with styleguide specimens first: `LinkedRecord` (title + status + opener) and `RemedyCard` (title, status, move, does not fix, falsifier, return when).
- MethodShell: select a remedy, cluster or persona (board cluster heading, problem detail "Held by", "Cluster", "Remedies"); inspector shows it with the same ActionBar menu (primary Affirm; Set aside / Edit in the menu), Discussion via InstanceNotes.
- `affirmRecord` generalises `affirmProblem`. `methodWriteGuard` is container based, so it covers the new kinds; a test pins that.
**Out of scope:** re-pointing links on affirm (srs-rust#1377, srs-web#546); linking as owner (slice 2); ranking; editing domains/trade-offs/principles; remedies answering no problem are not browsable in this slice.

## Phases
### Phase 1: model
- [ ] constants, buildBoard changes, `affirmRecord`, vitest cases (remedy under problem, no copy, hidden original, cluster/persona fork canonical, guard)
### Phase 2: specimens and components
- [ ] LinkedRecord, RemedyCard, css, index export, README rows, Styleguide section + fixtures
### Phase 3: shell
- [ ] MethodShell generalisation, board cluster heading, e2e in e2e/method-editor.spec.ts (remedy shown; affirm a remedy; negative: Affirm disabled without an Affirmed container)
### Acceptance
- typecheck, lint, build, test, e2e pass; dogfood on a local copy of srs-programme.
