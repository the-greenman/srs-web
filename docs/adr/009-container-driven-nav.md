# ADR-009: Container-keyed sidebar navigation

- **Status:** accepted
- **Date:** 2026-07-05
- **Issue:** [srs-web#93](https://github.com/the-greenman/srs-web/issues/93) (interim); completed via [srs-web#98](https://github.com/the-greenman/srs-web/issues/98)
- **Supersedes (partial):** [ADR-006](./006-dynamic-dispatch-replaces-sections.md) — the section-list portion (type-keyed nav) is replaced; the typeId-keyed view dispatch within a section is retained.
- **Demotes:** [ADR-007](./007-unified-type-registry.md) — TYPE_REGISTRY is now presentation hints only; it no longer drives sidebar section appearance.

## Context

ADR-006 introduced `buildDynamicSections(records)`, which derives the sidebar from
`TYPE_REGISTRY` (always-visible entries) plus any unknown typeIds found in loaded records.
This is semantics in a leaf client: the TypeScript layer decides what appears in the nav
and how records are grouped. It mirrors a known antipattern from `DecisionLogView.svelte`
(a bespoke filter superseded by a service binding).

Containers already exist in the SRS data model and are exposed by `listContainers()` via
the WASM binding. A container captures exactly what a nav section means: a titled group of
records, with a root instance that defines its type and purpose.

## Decision

The sidebar section list is sourced from the `repository_navigation` WASM binding
(`repositoryNavigation()` in `srs-client.ts`), which returns the RFC-013 root container's
identity record plus precedes-ordered section roots. Each nav entry carries:
- `containerId` — from `section.sectionContainerId` (the stable selection key)
- `title` — from `section.displayLabel` (the WASM-resolved display label)
- `icon` — from `TYPE_REGISTRY[section.typeId]?.icon` (presentation hint only)
- `rootTypeId` — from `section.typeId`; used only for view dispatch

**Pre-RFC-013 fallback:** When `repository_navigation` returns non-empty `diagnostics`
(indicating `manifest.container` is absent), the sidebar falls back to `listContainers()`
with `getContainer()` calls. This fallback is removed once all repositories migrate to
RFC-013 root containers.

`TYPE_REGISTRY` is demoted to **presentation hints** (icon, optional custom view
component). It never determines what appears in the nav or how records are grouped.

`activeSection` (typeId) is replaced by `activeContainerId` (containerId) as the active
state key. `sectionRecords` (keyed by typeId) is replaced by `containerRecords` (keyed by
containerId), populated from `getContainer().memberInstanceIds`.

**Migration history:** srs-web#93 established `listContainers()` as the interim nav source.
srs-web#98 (Gate D, Phase 4) completed the migration to `repository_navigation`
(srs-rust#268) once that binding was available.

## Rationale

- **ADR-001 compliant.** Container IDs are structural metadata (opaque UUIDs passed to
  WASM), not SRS semantics. The nav is purely "which container is selected" — no record
  grouping logic lives in TypeScript.
- **Future-proof.** The nav source migrated from `listContainers()` to
  `repository_navigation` (srs-rust#268) with no architectural change — a source swap, as
  anticipated. `listContainers()` and `getContainer()` are retained as a pre-RFC-013
  fallback path.
- **No new WASM binding (interim).** The interim phase used existing `listContainers()` and
  `getContainer()` bindings. The completed migration uses `repository_navigation()` added
  in srs-web#98.
- **Simpler new-record flow.** Every new record created in a container section is
  automatically added to that container via `addContainerMember()`. The previous
  `decisionLogContainerId` special-case is eliminated.

## Consequences

**Positive:**
- Sidebar content driven by actual repository data, not hardcoded TS constants.
- A new governance type surfaces automatically as a container in the nav — no TS change needed.
- The `decisionLogContainerId` discovery boot path is removed; the shell is simpler.

**Negative / trade-offs:**
- Empty repositories with no containers show an empty sidebar. Repos must have containers
  configured (via `manifest.json` containerIndex and container files) for nav to populate.
  The `sample.srsj` test fixture is updated accordingly.
- An extra `getContainer()` WASM call per container at load time. For small repos
  (Release 1 scope: 3–5 containers), this is negligible.
- `sections.ts` / `buildDynamicSections()` is no longer called from `GovernanceShell.svelte`
  but is kept in the codebase (tested by unit tests) for backward-compatibility. It will be
  removed in a future cleanup issue.

## View dispatch

`TYPE_REGISTRY` is still used for view dispatch: when `activeContainer?.rootTypeId` is
found in `TYPE_REGISTRY`, the registered `view` component (e.g. `DecisionView`) is used
in `RecordDispatch.svelte`. This is presentation logic (which component to render), not
SRS semantics, and remains compliant with ADR-001.
