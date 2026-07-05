# ADR-007: Unified type registry consolidates display hints and view components

**Status:** Accepted (partially superseded by [ADR-009](./009-container-driven-nav.md))
**Date:** 2026-06-26
**Issue:** [srs-web#71](https://github.com/the-greenman/srs-web/issues/71)
**Amends:** [ADR-006](./006-dynamic-dispatch-replaces-sections.md) (consequence: single-file registration)
**Partially superseded by:** [ADR-009](./009-container-driven-nav.md) — `TYPE_REGISTRY` is demoted to **presentation hints only** (icon, view component). It no longer drives sidebar section appearance or nav structure; containers from `listContainers()` are now the nav source.

## Context

ADR-006 introduced two typeId-keyed maps:

1. `KNOWN_TYPE_CONFIG` in `sections.ts` — display hints (label, icon, typeName, typeNamespace, typeVersion).
2. `VIEW_REGISTRY` in `RecordDispatch.svelte` — view component per typeId.

Registering a new known governance type therefore requires editing two files. Epic #30 commits to "a new decision type ships as a package with **zero TS change**" for unknown types, but for *known* types (those with custom views) the two-file requirement creates an error-prone surface: a developer can add a type to `KNOWN_TYPE_CONFIG` without adding its view to `VIEW_REGISTRY`, silently falling back to `RecordView`.

## Decision

Consolidate both maps into a single `TYPE_REGISTRY` exported from `src/lib/governance/type-registry.ts`.

```typescript
export interface TypeRegistryEntry {
  label: string;
  icon: string;
  typeName: string;
  typeNamespace: string;
  typeVersion: number;
  view?: typeof RecordView;  // absent = falls back to RecordView in RecordDispatch
}

export const TYPE_REGISTRY: Record<string, TypeRegistryEntry> = { ... };
```

`buildDynamicSections()` derives the sidebar section list from `TYPE_REGISTRY` entries (replacing `KNOWN_TYPE_CONFIG`). `RecordDispatch.svelte` reads `TYPE_REGISTRY[record.typeId]?.view ?? RecordView` (replacing `VIEW_REGISTRY`).

`DECISION_TYPE_ID` moves to `type-registry.ts` (it is type metadata, not section-discovery logic).

## Rationale

- **ADR-001 compliant.** `TypeRegistryEntry` stores display hints and a view component reference — no SRS semantics. The `view` field is a TS reference to a Svelte component, not business logic. `typeVersion` is a structural metadata value (an opaque integer) passed verbatim to `typeSchema(repo, typeId, typeVersion)` at the WASM boundary — srs-web does not interpret or validate it, exactly as it treats `typeId` (an opaque UUID). Hardcoding these stable gallery package values in a TypeScript config is the same ADR-001 trade-off already accepted in the predecessor `KNOWN_TYPE_CONFIG` and in ADR-005.
- **Single edit point.** Adding a new known governance type now requires exactly one new entry in `type-registry.ts`. The `view` field is optional: omitting it produces the `RecordView` fallback automatically, so unknown types (discovered from loaded records) are unaffected.
- **No WASM API change.** This is a pure TS/Svelte refactor.
- **Consistent type.** `view?: typeof RecordView` matches the existing cast pattern (`as unknown as typeof RecordView`) already used in `VIEW_REGISTRY` — no new Svelte type imports required.

## Consequences

- **ADR-006 consequence updated:** "Registering a custom view requires adding one entry to `VIEW_REGISTRY` in `RecordDispatch.svelte`" → "Registering a known type and/or custom view requires adding one entry to `TYPE_REGISTRY` in `type-registry.ts`."
- `sections.ts` becomes a pure section-discovery module: `buildDynamicSections()` + `SectionConfig` interface. It no longer exports `KNOWN_TYPE_CONFIG` or `DECISION_TYPE_ID`.
- `RecordDispatch.svelte` no longer maintains its own map; it reads from `TYPE_REGISTRY`.
- Consumers of `DECISION_TYPE_ID` (`App.svelte`) update their import path to `type-registry.js`.
- Unknown types (discovered from loaded records) continue to surface automatically via `buildDynamicSections()` with a derived label and the `RecordView` fallback — no change to that behaviour.
