# ADR-013: Repository-level tool sections in the governance nav

- **Status:** accepted
- **Date:** 2026-07-17
- **Issue:** [srs-web#221](https://github.com/the-greenman/srs-web/issues/221)
- **Extends:** [ADR-009](./009-container-driven-nav.md) — does not supersede it

## Context

ADR-009 establishes that the sidebar nav is driven by SRS containers from the
`repository_navigation()` WASM binding. Every section in the "Governance" NavGroup corresponds
to a container ID from the repository data.

The migration registry (srs-rust#461) introduces repository-level operations that are not
record containers: `available_migrations()` and `apply_migration(id)` operate on the
repository as a whole, not on a typed container of records. Placing these operations in the
container-keyed nav would be semantically wrong and architecturally confusing.

Two placement options were considered:

1. **A settings/admin page accessible from the Topbar** — familiar from web apps, but the
   srs-web topbar is sparse and currently has no concept of a settings route.
2. **A sibling NavGroup "Repository" below the "Governance" container list** — visually
   adjacent to governance content, semantically distinct via the group label, no new routing
   primitive required.

## Decision

Repository-level tool sections (operations that apply to the whole repository, not to a
content container) are surfaced as a separate **NavGroup** below the container-driven
"Governance" NavGroup. Each repo-level tool is a `NavItem` within that group.

The "Repository" NavGroup's items are **statically defined in code** (not data-driven from the
WASM repo navigation). This is acceptable because repository-level tools are a fixed,
finite set of engine capabilities, not user-defined content sections.

`activeView` state (`"governance" | "migrations"`) controls which panel is rendered in the
`{#snippet main()}` area. Selecting a container in the Governance NavGroup resets
`activeView = "governance"`; selecting a Repository NavItem sets `activeView = "<tool-id>"`.

## Rationale

- **ADR-001 compliant.** The "Repository" NavGroup is a static shell structure with no SRS
  semantics in TypeScript. The items invoke WASM methods; they do not re-implement any
  semantic logic.
- **Extends ADR-009 cleanly.** The container-keyed nav for content sections is unchanged.
  The new group is a peer, not a replacement.
- **Precedent only for repo-level tools.** This pattern must not be used for content
  sections. If a new governance content type is introduced, it must still appear as a
  container in the "Governance" NavGroup via `repository_navigation()`.
- **Simple state model.** `activeView` is a single discriminated string. No new routing
  primitive, no URL change, no Svelte router dependency.

## Constraints

- Items in the "Repository" NavGroup must only invoke WASM repository-level methods —
  never record CRUD, container membership, or any container-keyed operation.
- The "Repository" NavGroup must not be data-driven from the WASM API without a new ADR.
  Adding new items requires a code change to `GovernanceShell.svelte`.
- The pattern applies to the governance editor shell only. The Guides editor shell has no
  such group unless a separate ADR approves it.

## Consequences

**Positive:**
- Repository health/admin operations are discoverable without a separate route or modal.
- The shell pattern is simple — a second `NavGroup` and a conditional render.

**Negative / trade-offs:**
- The "Repository" NavGroup is statically coded — a new repo-level tool requires a code
  change, not just a new WASM binding.
- `activeView` state adds a new branch in the main conditional render. As more tools are
  added, this conditional grows; consider extracting into a view-dispatch map if there are
  ever more than three items.
