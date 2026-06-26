# ADR-005: Governance type IDs live in the SECTIONS config

**Status:** Superseded by [ADR-006](./006-dynamic-dispatch-replaces-sections.md)
**Date:** 2026-06-26
**Issue:** [srs-web#53](https://github.com/the-greenman/srs-web/issues/53)
**Supersedes:** —

## Context

`typeSchema(repo, typeId)` (srs-web#52) can derive a governance form's field definitions at
runtime — replacing the hardcoded `GOVERNANCE_FORMS` map. But it requires a `typeId` to call.

Two sources for the typeId were considered:

**Option A — SECTIONS config.** Add `typeId` and `typeVersion` to each entry in
`src/lib/governance/sections.ts`, alongside the existing `typeNamespace` and `typeName`.
The stable UUIDs come from the gallery package and are already present in `GOVERNANCE_FORMS`
today; this moves them to the canonical section descriptor, not duplicates them.

**Option B — Blueprint discovery.** Use `listBlueprints` + `blueprintSchema` to discover
governance types without hardcoding UUIDs. Requires a governance blueprint to exist in the
gallery package. No such blueprint exists: the gallery only defines three governance types
(article, decision, role) with no blueprint wrapping them.

**Option C — Minimal separate registry.** Keep a `GOVERNANCE_TYPE_IDS: Record<string, {typeId, typeVersion}>` map separate from SECTIONS. Same information as Option A but split across two files with no clear advantage.

## Decision

Use **Option A** (SECTIONS config). The `SECTIONS` constant already describes every section's
`typeNamespace` and `typeName`; `typeId` and `typeVersion` are the remaining fields needed to
fully describe a governance type anchor. They are stable package-level identifiers, not
application logic.

`typeId` is typed as optional in SECTIONS entries. Entries without a `typeId` (currently:
exercises, which has no type in the gallery package) are treated as read-only sections with no
create/edit form.

## Rationale

- **ADR-001 compliant.** Storing stable gallery package UUIDs in a TypeScript config object is
  structural metadata, not SRS semantics. The UUIDs do not encode any business rules — they are
  opaque identifiers passed verbatim to the WASM layer.
- **Minimal footprint.** No new file, no new abstraction. SECTIONS already exists as the single
  source of truth for section metadata.
- **Blueprint discovery (Option B) is not feasible** without a governance blueprint in the
  gallery package. If one is added in a future package release, the call site in App.svelte can
  be migrated to blueprint-based discovery without changing this decision (ADR-003 already
  establishes that pattern for guides).

## Consequences

- Any future governance type added to the gallery package must also be added to SECTIONS with
  its typeId. This is a one-line change per new type.
- Sections without a `typeId` remain read-only (consistent with current behaviour for
  "exercises" which has no GOVERNANCE_FORMS entry today).
- If a governance blueprint is ever added to the gallery package, discovery can migrate to
  the ADR-004 convention-join pattern; SECTIONS typeIds would become optional fallbacks.
