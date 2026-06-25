# Plan: srs-web#52 — WASM client wrappers for new bindings

## Summary

`srs-rust#181` added four new read-only WASM bindings to `SrsRepository`: `containers_for_instance`, `type_schema`, `list_blueprints`, and `document_views_for_container`. These are required by the dynamic blueprint/view discovery pipeline (srs-web#43, #53, #54) that drives the Decision Logger v1 editor. This plan exposes them through the existing `srs-client.ts` typed facade, keeping zero SRS semantics in TypeScript (ADR-001).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude |
| Web App Worker | claude |
| Verification | claude |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS — wrappers only | proposed |

No new ADR required: adding wrappers is a direct application of ADR-001 (delegate to WASM, normalise output, return typed result). All four methods follow the identical pattern already established by `listContainers`, `blueprintSchema`, `renderDocumentView`, etc.

---

## Contracts

### WASM API surface

The four bindings exist in `srs-rust#181` (closed). No new srs-rust issue needed.

Binding return shapes (from `srs-rust/crates/srs-bindings/src/lib.rs`):
- `containers_for_instance(instance_id)` → `ContainerSummary[]` (same shape as `list_containers`)
- `type_schema(type_id, type_version?)` → `{ schema: object, diagnostics: string[] }`
- `list_blueprints()` → `{ summaries: BlueprintSummary[], diagnostics: string[] }`
- `document_views_for_container(container_id)` → `DocumentView[]` (full view objects, not summaries)

### TypeScript types

New types to add to `srs-client.ts` (in the WASM module types section):
- `ExactTypeRef` — `{ typeId: string; typeVersion: number }`
- `BlueprintSummary` — `{ id, namespace, name, version, description, rootTypeCount, sourcePackage? }`
- `BlueprintListResult` — `{ summaries: BlueprintSummary[]; diagnostics: string[] }`
- `TypeSchemaResult` — `{ schema: Record<string, unknown>; diagnostics: string[] }`
- `DocumentSection` — section object shape from `DocumentView.sections[]`
- `DocumentView` — full view object (id, namespace, name, version, description, containerType?, rootTypeRefs?, sections, format?, createdAt)

---

## Scope

- Extend `SrsRepository` interface with four new WASM method signatures.
- Add TypeScript types for all four binding return shapes.
- Add four typed wrapper functions following the established pattern.
- Add unit tests in `tests/srs-client.test.ts` that mock `SrsRepository` and verify wrappers call the correct methods and return normalised results.

**Out of scope:**
- Consumer wiring (srs-web#43 blueprint↔view discovery — separate issue).
- Any new WASM bindings in srs-rust.
- `list_document_views` wrapper (separate binding with a filter — deferred to the consumer that needs it).

---

## Phases

### Phase 1: Extend srs-client.ts + unit tests

**Goal:** `srs-client.ts` exposes all four new WASM bindings as typed wrapper functions, covered by unit tests that pass without a WASM build.

**Agent:** Web App Worker

#### Tasks

- [x] Add four WASM method signatures to `SrsRepository` interface.
- [x] Add `ExactTypeRef`, `BlueprintSummary`, `BlueprintListResult`, `TypeSchemaResult`, `DocumentSection`, `DocumentView` types.
- [x] Add `containersForInstance(repo, instanceId)` wrapper returning `ContainerSummary[]`.
- [x] Add `typeSchema(repo, typeId, typeVersion?)` wrapper returning `TypeSchemaResult`.
- [x] Add `listBlueprints(repo)` wrapper returning `BlueprintListResult`.
- [x] Add `documentViewsForContainer(repo, containerId)` wrapper returning `DocumentView[]`.
- [x] Write `tests/srs-client.test.ts` with one test per wrapper.

#### Acceptance Criteria

- [x] All four wrappers exist and are exported from `srs-client.ts`.
- [x] `npm run typecheck` passes.
- [x] `npm run test` (vitest) passes — unit tests cover each wrapper with a mock SrsRepository.
- [x] No SRS semantics in TypeScript — wrappers are pure façades.

#### Testing

```bash
npm run typecheck
npm test
```

#### Milestone gate

1. Acceptance criteria above checked.
2. `npm run typecheck` + `npm test` green.
3. Commit with message referencing the issue (`feat(srs-client): add WASM wrappers for blueprints, typeSchema, containersForInstance, documentViewsForContainer (#52)`).

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes (all unit tests green)
- [ ] `npm run build` succeeds
- [ ] Four new wrappers exported: `containersForInstance`, `typeSchema`, `listBlueprints`, `documentViewsForContainer`
- [ ] No SRS semantics in TypeScript (ADR-001 compliance)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- All four bindings delegate directly to WASM — no semantic logic in TS.

## Assumptions

- `srs-rust#181` bindings are available in the wasm build artifact (`srs_bindings.js`). Unit tests mock them; e2e tests are outside this plan's scope.
- The `document_views_for_container` binding returns full `DocumentView` objects (not summaries). This is confirmed by the Rust doc-comment.
