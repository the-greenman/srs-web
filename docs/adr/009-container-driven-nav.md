# ADR-009: Container-keyed sidebar navigation

- **Status:** accepted
- **Date:** 2026-07-05
- **Issue:** [srs-web#93](https://github.com/the-greenman/srs-web/issues/93)
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

The sidebar section list is sourced from `listContainers(repo, {})` (interim: all
containers; future: a navigation-taxonomy selector). Each nav entry carries:
- `containerId` — the stable selection key (replaces the typeId key of ADR-006)
- `title` — from the container record (e.g., "Decision Log", "Articles")
- `icon` — from `TYPE_REGISTRY[rootTypeId]?.icon` (presentation hint only)
- `rootTypeId` — derived from the container's root instance; used only for view dispatch

`TYPE_REGISTRY` is demoted to **presentation hints** (icon, optional custom view
component). It never determines what appears in the nav or how records are grouped.

`activeSection` (typeId) is replaced by `activeContainerId` (containerId) as the active
state key. `sectionRecords` (keyed by typeId) is replaced by `containerRecords` (keyed by
containerId), populated from `getContainer().memberInstanceIds`.

## Rationale

- **ADR-001 compliant.** Container IDs are structural metadata (opaque UUIDs passed to
  WASM), not SRS semantics. The nav is purely "which container is selected" — no record
  grouping logic lives in TypeScript.
- **Future-proof.** When `repository_navigation` service (srs-rust#266) is available,
  the nav source can migrate from `listContainers()` to the navigation service output
  with no architectural change — it is a source swap, not a schema change.
- **No new WASM binding.** `listContainers()` and `getContainer()` are already in
  `srs-client.ts`. The source migration requires only a rewire in `GovernanceShell.svelte`.
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
