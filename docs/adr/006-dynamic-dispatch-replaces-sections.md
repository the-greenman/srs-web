# ADR-006: Dynamic section discovery and typeId-keyed view dispatch

**Status:** Accepted
**Date:** 2026-06-26
**Issue:** [srs-web#54](https://github.com/the-greenman/srs-web/issues/54)
**Supersedes:** [ADR-005](./005-governance-typeids-in-sections-config.md)

## Context

ADR-005 added typeIds to the static `SECTIONS` array so `typeSchema()` could be called
at load time. However, `SECTIONS` is still a hardcoded list: adding a new governance type
to the gallery package requires a TypeScript change in `sections.ts`. This violates the
goal that "adding a new type via package surfaces a section + view with no TS change."

Two points of hardcoding were identified:

1. **Section list** — `SECTIONS` in `sections.ts` enumerates types with human-readable string keys
   ("articles", "decisions", "roles", "exercises"). New types require a new entry.
2. **View dispatch** — `RecordDispatch.svelte` uses a `typeName ===` switch to select the view
   component. New types require a new branch.

### Options considered

**Option A — Records-first section discovery + typeId-keyed view registry.**
`listRecords(repo, {})` returns all records with `typeId`, `typeName`, `typeNamespace`,
`typeVersion`. Sections are derived from the returned records plus a `KNOWN_TYPE_CONFIG` map
(display hints for well-known types). Unknown types surface automatically. `RecordDispatch`
uses a `VIEW_REGISTRY: Record<typeId, Component>` map; the fallback is `RecordView`.

**Option B — Blueprint-based discovery (ADR-004 pattern).**
Requires a governance blueprint in the gallery package. No such blueprint exists today.
Deferred to a future issue; Option A does not prevent this migration later.

**Option C — Keep SECTIONS; add a dynamic extension mechanism.**
Hybrid: known types stay in SECTIONS, unknown types are appended at load time. This is
essentially what Option A does, but Option A makes the list entirely dynamic and removes
the human-readable string key in favour of the typeId UUID.

## Decision

Use **Option A**: replace `SECTIONS` with `KNOWN_TYPE_CONFIG` (typeId-keyed display hints)
and `buildDynamicSections(records)` (derives the section list from loaded records plus
KNOWN_TYPE_CONFIG). Replace the `typeName ===` switch in `RecordDispatch.svelte` with
`VIEW_REGISTRY: Record<string, Component>` keyed by typeId, falling back to `RecordView`.

The `activeSection` state in `App.svelte` is now a typeId UUID (or `null` before load),
not a human-readable string. `sectionSchemas` is keyed by typeId accordingly.

## Rationale

- **ADR-001 compliant.** typeId comparisons are structural metadata (opaque UUIDs passed to
  WASM), not SRS semantics. `KNOWN_TYPE_CONFIG` stores display hints only; no business rules.
- **Zero-TS-change extensibility.** A new governance type appearing in `listRecords()` output
  automatically surfaces in the sidebar with a derived label and the fallback `RecordView`.
  Registering a custom view requires only adding one entry to `VIEW_REGISTRY` in
  `RecordDispatch.svelte`.
- **No WASM API change needed.** `listRecords(repo, {})` already returns `typeId` on each
  record. No new binding is required.
- **KNOWN_TYPE_CONFIG preserves stable UX.** The three well-known types (article, decision,
  role) always appear in the sidebar even in an empty repo (pre-load fixture), maintaining
  the navigation.spec.ts baseline.

## Consequences

- `SectionKey` is now `string` (typeId UUID) instead of a literal union. Code that compared
  `activeSection === "decisions"` is replaced with `typeId === DECISION_TYPE_ID`.
- `sectionSchemas` is keyed by typeId UUID. The human-readable `"decisions"` key is gone.
- `ExerciseView.svelte` is no longer imported by `RecordDispatch`. The exercise type has no
  typeId in the gallery package. It remains in the codebase but is not registered; follow-up
  issues track adding the exercise type to the gallery package.
- Blueprint-based discovery (ADR-004 pattern) remains the long-term goal for governance types
  if a governance blueprint is added to the gallery package. This ADR does not prevent that.
- `RecordDispatch.svelte` is wired into the rendering path via `RecordReading.svelte`
  (completed in [srs-web#70](https://github.com/the-greenman/srs-web/issues/70)). The
  VIEW_REGISTRY is now live: selecting a record routes to the type-specific view or falls
  back to `RecordView` for unknown types. `RecordReading` no longer renders fields
  directly — it delegates to `RecordDispatch` and retains only the back-button navigation.
