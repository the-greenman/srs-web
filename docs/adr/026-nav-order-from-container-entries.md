# ADR-026: Navigation order comes from the container's entry order, never from `precedes`

- **Status:** Accepted (executes a recorded ruling; no new normative meaning)
- **Date:** 2026-10-22
- **Issue:** [srs-web#554](https://github.com/the-greenman/srs-web/issues/554)
- **Supersedes (partial):** [ADR-009](./009-container-driven-nav.md): the ordering clause only ("precedes-ordered section roots"). The container-keyed selection, the `TYPE_REGISTRY` demotion and the pre-RFC-013 fallback stand.
- **Builds on:** [ADR-001](./001-thin-client.md) (thin client), [ADR-025](./025-lenses.md) (lenses extend ADR-009)
- **Ruling:** RFC-043 (`dataModelRevision` 8) and the owner ruling of 2026-10-09: "`precedes` is semantic order. A container orders its members within its own boundary (RFC-043). srs-web ADR-009 needs a successor."

## Context

ADR-009 sources the sidebar from `repositoryNavigation()`, described as "the RFC-013
root container's identity record plus precedes-ordered section roots". That was true of
the data model when it was written. RFC-043 changed it: a container's `memberInstanceIds`
is an ordered list of entries, and that entry order is the layout of the container. The
`precedes` relation remains, but it states semantic order between instances (what comes
before what in meaning), not where something is shown.

A client that follows ADR-009 literally orders navigation by the wrong relation.
srs-web#122 asks the engine for precedes-ordered container members, and would build that
wrong thing if left as written.

## Decision

1. **Navigation order is the container's entry order.** Wherever the client lists a
   container's members (sidebar sections, a section's records, any lens that follows
   containment), the order shown is the order the engine returns for the container's
   entries. The client does not re-sort it.
2. **`precedes` is never read for presentation.** The client does not walk, sort by or
   merge a `precedes` chain to decide what appears first. If a view needs a different
   order it asks for it through a view or composition declared in the data, not through
   client code.
3. **A container orders its members within its own boundary.** A member's position is
   relative to its siblings in that container only. The client does not derive a global
   order across containers.
4. **The engine owns the order.** Per ADR-001 and the capability-layering rule, ordering
   is resolved by the Rust engine behind `repositoryNavigation()` and the container
   bindings. The client adds no ordering semantics of its own.

## Consequences

- srs-web#122 is re-scoped: it must ask for container members in entry order, not
  precedes order. Any engine call that returns precedes-sorted members for presentation
  is the wrong source.
- Editor operations that maintain a `precedes` chain (`src/lib/editor/document-ops.ts`)
  keep doing so for semantic order; they must also place the new entry in the container,
  since that is what the reader sees. Reviewing those operations against this ADR is
  follow-up work and is not part of this change.
- ADR-009 gains a pointer to this ADR; its other decisions are unchanged.
