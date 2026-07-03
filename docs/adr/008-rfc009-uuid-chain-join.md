# ADR-008: UUID-chain join replaces containerType string matching

**Status:** Accepted
**Date:** 2026-07-03
**Issue:** [srs-web#97](https://github.com/the-greenman/srs-web/issues/97)
**Supersedes:** [ADR-004](004-blueprint-view-convention-join.md)

## Context

ADR-004 adopted a string-convention join for blueprint↔view discovery:
```ts
view.namespace === blueprint.namespace && view.containerType === blueprint.name
```
At the time, `BlueprintSummary` did not expose `rootTypes: ExactTypeRef[]`, making the
authoritative UUID join infeasible without an extra WASM call.

RFC-009 (SRS spec) explicitly marks `containerType` as a "hint only" field. The authoritative
join is the UUID chain:
```
Container.rootInstanceIds → Record.typeId → DocumentView.rootTypeRefs
```

Two problems emerged from the ADR-004 approach:
1. `documentViewsForBlueprint()` in `discovery.ts` filters by `containerType === blueprint.name`,
   which fails when a document view has `rootTypeRefs` but omits `containerType`.
2. `GovernanceShell.svelte` discovered the decision-log container via
   `listContainers(repo, { containerType: "decision-log" })` — a string join that the RFC
   marks non-authoritative and which silently returns nothing when `containerType` is absent.

The existing WASM API already provides what is needed:
- `DocumentViewSummary.rootTypeRefs?: ExactTypeRef[]` is returned by `list_document_views`.
- `ContainerListFilter.rootInstanceId` is already available in `listContainers()`.
- The blueprint schema (`blueprintSchema()`) returns the root type UUID directly.

## Decision

### Blueprint↔view discovery (`discovery.ts`)

Replace the `BlueprintSummary` first-arg with `rootTypeId: string`:

```ts
export function documentViewsForBlueprint(
  rootTypeId: string,
  views: DocumentViewSummary[]
): DocumentViewSummary[] {
  return views.filter(
    (v) => v.rootTypeRefs?.some((r) => r.typeId === rootTypeId) ?? false
  );
}
```

Callers (`GuidesShell.svelte`) obtain the `rootTypeId` from `blueprintSchema(repo, blueprint.id)`
via the existing `rootTypeId(schema)` helper in `blueprint-utils.ts`. The call to
`blueprintSchema()` is moved before view discovery in the boot sequence.

### Container discovery in `GovernanceShell.svelte`

Replace `listContainers(repo, { containerType: "decision-log" })` with:

```ts
const dlSection = dynamicSections.find(
  (s) => s.typeName === DECISION_LOG_TYPE_NAME && s.typeNamespace === DECISION_LOG_TYPE_NAMESPACE
);
if (dlSection) {
  const dlRecords = sectionRecords[dlSection.typeId] ?? [];
  const rootRecord = dlRecords[0];
  if (rootRecord) {
    const containers = listContainers(repo, { rootInstanceId: rootRecord.instanceId });
    decisionLogContainerId = containers[0]?.containerId ?? null;
  }
}
```

`dynamicSections` (built by `buildDynamicSections` from TYPE_REGISTRY + loaded records) and
`sectionRecords` are synchronously populated by `loadSectionRecords()` before this block runs
in `onMount()`. The two new constants `DECISION_LOG_TYPE_NAMESPACE` and `DECISION_LOG_TYPE_NAME`
are added to `type-registry.ts`.

## Consequences

**Positive:**
- Compliant with RFC-009: the join uses the authoritative UUID chain, not the hint field.
- Document views that correctly populate `rootTypeRefs` but omit `containerType` are now
  discoverable (e.g., the `guide-body-view` after the muSrs.srsj fixture is updated).
- GovernanceShell container discovery is robust even if `containerType` is absent or wrong.
- ADR-001 compliant: UUID-chain join is presentation-layer filtering of WASM metadata.

**Negative / trade-offs:**
- Document views in fixtures must now carry `rootTypeRefs`. The `muSrs.srsj` fixture needs
  `rootTypeRefs` added to the guide document view entry.
- `GuidesShell.svelte` must call `blueprintSchema()` before view discovery, adding one WASM
  call to the boot sequence. This call was already present after view discovery; it is
  reordered, not added.
- The `containerType` field on views and containers becomes unused for discovery; it remains
  in the data model as a "hint" per RFC-009.

**Neutral:**
- `BlueprintSummary.rootTypes` extension in srs-rust (deferred) would further simplify the
  caller, but is not required now that `blueprintSchema()` provides the root type UUID.

## Alternatives Rejected

**Keep ADR-004 string join:** Violates RFC-009; breaks when `containerType` is absent. The
motivation to defer (BlueprintSummary lacking rootTypes) no longer applies now that
`blueprintSchema()` provides the root type UUID synchronously.

**Add `rootTypes: ExactTypeRef[]` to BlueprintSummary (srs-rust change):** Correct and desirable
long-term, but requires a srs-rust WASM binding change. Not needed for this fix because
`blueprintSchema()` already returns the root type UUID. Deferred.

**Filter `listDocumentViews` by `rootTypeId` on load:** Possible (WASM supports this filter),
but would require changing the load call signature and break the separation between loading
and pairing. The in-memory filter in `documentViewsForBlueprint` is simpler and testable.

## Follow-ups

- When `BlueprintSummary` is extended to carry `rootTypes: ExactTypeRef[]`, the
  `blueprintSchema()` call in `GuidesShell.svelte` can be replaced by reading from the summary
  directly, eliminating one WASM call.
