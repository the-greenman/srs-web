# Plan: Read view, a repository as a document a person can follow

## Summary

A person opening one of our repositories meets an engine view (Generic's three columns, or Lenses' panes) and cannot follow it (srs-web#670, SP-119, SP-48). The srs-lab Readers prototype (srs-lab#32, #33) showed the same repositories become followable as one column: open on the identity record; each page is a record's prose, then what its outline nests under it, in the author's order, each with its first line; drill down; group a level of more than 15 items. This plan brings that into srs-web as a built-in engine view, `read`, over existing bindings only.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | local /ship session |
| Web App Worker | local /ship session |
| Verification | reviewer subagent (stage 7) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | No SRS semantics in TS: nesting is the core's `parentInstanceId`, labels the core's `displayLabel` | accepted |
| [ADR-022](../docs/adr/022-built-in-views-and-editor-registry.md) | Read is one more `BUILT_IN_VIEWS` entry and its App branch; reached from Explore | accepted (list updated) |
| [ADR-023](../docs/adr/023-one-hash-address.md) | New key `read=<containerId>`; the shell-neutral `id` names the page | accepted (table updated) |
| [ADR-024](../docs/adr/024-one-record-reading-component.md) | Records read through `RecordProse`; its body choice moves to a pure helper so first lines use the same rule | accepted |
| [ADR-025](../docs/adr/025-lenses.md) | Walls grouped by `lens-distinctions` (`groupItems`, `splittingBy`); no new grouping | accepted |
| [ADR-027](../docs/adr/027-editor-layers.md) | Layer named per task below | accepted |
| [ADR-029](../docs/adr/029-read-view.md) | The Read view: one column over the outlines, its address, what it is not | proposed |

## Contracts

### WASM API surface

No new or changed WASM methods. Used: `repositoryNavigation`, `getContainerOutline` (`body`, `parentInstanceId`, `hasChildren`), `resolveContainerView` (member `displayLabel`, `record`, `sectionContainerId`), `getRecord`, `typeSchema`, and `get_instance` for notes (srs-rust#1379, landed; wrapped once as `getInstance`).

### TypeScript types

`Address.read?: string` (`read` key). `getInstance` returns `{ kind: "note"; note: NoteInstance } | { kind: "record"; record: SrsRecord } | null`.

## Scope

- **Headless** `src/lib/prose.ts`: `proseView(record, fields, composites)` (moved from `RecordProse.svelte`, unchanged behaviour) and `firstLine(text)`.
- **Headless** `src/lib/read/read-model.ts`: `frontDoor(repo)`, `readPage(repo, containerId, id)`, `openTarget(page, child)`.
  - Children of a page are the outline body entries whose `parentInstanceId` is the page, or null when the page is the container's anchor or identity.
  - A child with a `sectionContainerId` opens in that container.
  - A level with more than `WALL` (15) children is grouped by `splittingBy` over `collectionOptions`.
- **Client** `src/lib/srs-client.ts`: `getInstance`. `src/lib/method/narrative.ts` uses it instead of calling `repo.get_instance` directly.
- **Address** `src/lib/address.ts`: the `read` key, between `lens` and `id`.
- **Component** `src/lib/read/ReadPage.svelte`: heading, `RecordProse` or note sections, "Inside" list with first lines, grouped walls (`<details>`). A specimen on `/styleguide`.
- **Screen** `src/lib/read/ReadShell.svelte`: `AppShell` with main only, the shared toolbar actions, Back and the breadcrumb from the link trail, `pushAddress` on a click.
- **App / registry**: `BUILT_IN_VIEWS` gains `read`; App chooses Read for a `read` key; Generic's Explore group offers "Read" first.
- **Docs**: ADR-029; ADR-022 list; ADR-023 table.

**Out of scope:**

- Making Read the default landing (an owner decision, ADR-022). Asked in the PR.
- Link-based grouping and walks by relation category (srs#726).
- Lenses Focus reading notes through `getInstance` (its ADR-025 gap 3 comments are stale). Filed as a follow-up.

## Phases

### Phase 1: Headless model and address

**Goal:** a pure, tested page model on the real engine.

- [ ] `src/lib/prose.ts`; `RecordProse.svelte` calls `proseView`
- [ ] `getInstance` in srs-client; narrative.ts uses it
- [ ] `read-model.ts`
- [ ] `address.ts` `read` key; `tests/address.test.ts`
- [ ] `tests/read-model.wasm.test.ts` on `srs-spec.srs` and `muSrs.srsj`

#### Acceptance Criteria

- [ ] The front door is the identity record, and its children are the navigation sections in order.
- [ ] Opening a section moves to its section container; its children are that container's top-level body in order.
- [ ] A note page has its sections' text; a level of more than 15 children is grouped.

### Phase 2: Component, screen, wiring

**Goal:** Read is reachable from Explore and survives Back and reload.

- [ ] `ReadPage.svelte` plus a styleguide specimen
- [ ] `ReadShell.svelte`; App branch; `BUILT_IN_VIEWS`; Explore item
- [ ] ADR-029, ADR-022, ADR-023 edits

#### Acceptance Criteria

- [ ] On srs-context, srs-programme, muSrs and the spec, a person reaches every navigation section and drills two levels down by clicking.
- [ ] Back and reload land on the same page.
- [ ] No repository id, field name or relation key in the new code.

#### Testing

```bash
npm run typecheck && npm run lint && npm run build && npm test
```
