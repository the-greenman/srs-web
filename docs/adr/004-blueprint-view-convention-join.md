# ADR-004: Blueprint↔view discovery uses a string-convention join

**Status:** Accepted
**Date:** 2026-06-25
**Issue:** [srs-web#43](https://github.com/the-greenman/srs-web/issues/43)
**Supersedes:** —

## Context

An editor component (e.g. `GuidesShell.svelte`) must discover:
1. Which blueprint to use for authoring records into a container.
2. Which document view to use for rendering/exporting that container.

Before this ADR, GuidesShell hardcoded both as UUID string literals (`GUIDE_BLUEPRINT_ID`,
`GUIDE_VIEW_ID`). This breaks when blueprints or views are updated and the UUIDs change, and it
cannot be reused by a second editor.

Two join strategies were considered:

**Option A — String-convention join.** A document view belongs to a blueprint when
`view.namespace === blueprint.namespace && view.containerType === blueprint.name`. This is a
frontend discovery convenience that reads summary metadata returned by `listBlueprints` and
`listDocumentViews` (WASM methods).

**Option B — UUID-based join (RFC-009 typed anchor).** A document view belongs to a blueprint
when `view.rootTypeRefs` contains an `ExactTypeRef` matching one of `blueprint.rootTypes`. This
is the authoritative typed link in the SRS spec (RFC-009 Change E + Change A). However,
`BlueprintSummary` (returned by `list_blueprints`) currently exposes only `root_type_count:
usize`, not the actual `rootTypes: ExactTypeRef[]`. Without the Blueprint's rootTypes in the
summary, the UUID join cannot be computed from the summary data alone.

## Decision

Use **Option A** (string-convention join) implemented as two pure-TS helpers in
`src/lib/discovery.ts`:

```ts
export function documentViewsForBlueprint(
  blueprint: BlueprintSummary,
  views: DocumentViewSummary[]
): DocumentViewSummary[] {
  return views.filter(
    (v) => v.namespace === blueprint.namespace && v.containerType === blueprint.name
  );
}

export function findBlueprint(
  blueprints: BlueprintSummary[],
  namespace: string,
  name: string
): BlueprintSummary | null {
  return blueprints.find((b) => b.namespace === namespace && b.name === name) ?? null;
}
```

The join is isolated in one helper function; switching to the UUID join (Option B) when
`BlueprintSummary` exposes rootTypes requires changing only `documentViewsForBlueprint`.

This decision is ADR-001 compliant: filtering WASM-returned summary metadata by string equality
is presentation logic, not SRS semantics. It is ADR-003 compliant: the join is a frontend
discovery convenience; blueprint authoring and view rendering remain decoupled.

## Consequences

**Positive:**
- No new WASM binding required.
- The join is isolated in a single, pure, unit-tested function — easy to upgrade when
  `BlueprintSummary` exposes `rootTypes`.
- `GuidesShell.svelte` contains no hardcoded UUID literals.
- Reusable by future editors: any component that knows its `{namespace, name}` can discover
  its blueprint and views programmatically.

**Negative:**
- The string join depends on `containerType` being authored correctly on document views.
  If a view omits `containerType` but uses `rootTypeRefs`, it will not be discovered until
  the UUID join is implemented (tracked as a follow-up).

## Alternatives Rejected

**Option B (UUID join):** correct per RFC-009, but not feasible until `BlueprintSummary` carries
`rootTypes: ExactTypeRef[]`. Filed as a follow-up for when the srs-rust summary is extended.

## Follow-ups

- When `BlueprintSummary` is extended to carry `rootTypes`, update `documentViewsForBlueprint`
  to use UUID-based matching as the primary path, with string fallback.
- `BlueprintPicker` component (select among multiple blueprints) — deferred until a second
  blueprint editor exists.
