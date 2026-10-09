# ADR-025: Lenses, one engine view of three panes over derived lenses

- **Status:** proposed
- **Date:** 2026-10-09
- **Issue:** [srs-web#547](https://github.com/the-greenman/srs-web/issues/547), [srs-web#425](https://github.com/the-greenman/srs-web/issues/425) (navigation tree; re-scoped by this ADR)
- **Extends:** [ADR-009](./009-container-driven-nav.md) (navigation sections become lenses), [ADR-010](./010-view-driven-list-columns.md) (columns for sets with no container view)
- **Builds on:** [ADR-001](./001-thin-client.md) (thin client), [ADR-022](./022-built-in-views-and-editor-registry.md) (built-in view), [ADR-023](./023-one-hash-address.md) (address), [ADR-024](./024-one-record-reading-component.md) (reading)

## Context

Every repository opens in the generic explorer, whatever it holds. Relations are
visible only on the Map. Nothing answers "what links here". A selection has no
address. The `poc/ux-lenses` prototype passed three rounds of fresh-eyes review with a
three-pane lens model over four live corpora. #547 ports it into the app as a built-in
engine view ([ADR-022](./022-built-in-views-and-editor-registry.md)).

The capability-layering rule (`srs-rust/docs/architecture/capability-layering.md`) is
that clients add presentation, never semantics. Lenses must keep to it, while the
engine still lacks several bindings the view would like.

## Decision

### The model

Lenses answers three questions in three panes, each built once:

- **Collection**: the set. An outline (list) or a table.
- **Focus**: one thing. Modes: **Read** (through `RecordProse`,
  [ADR-024](./024-one-record-reading-component.md)), **Document** (the set as blocks,
  the selection highlighted), **Edit** in place (`SectionForm`; absent when read-only)
  and **As published** (the rendered Composition, read-only).
- **Context**: the record's links, grouped. It also shows which containers hold it
  ("In") and which compositions show it ("Shown in").

Four layouts arrange the panes: **trail**, **reader**, **board** and **graph**.

### Derived lenses only

A lens is presentation wiring, derived from engine data:

- one per depth-0 navigation section (`repositoryNavigation`, so ADR-009 sections
  become lenses);
- one per composition (`listDocumentViews`);
- one per type in use (`find` `facets.byType`);
- **Everything** (`find`);
- the viewer's drawn set.

No repository id, field name, relation key or namespace appears in client code or
decides behaviour. A lens carries no per-lens layout or "Tell apart by" default: the
defaults follow the collection kind only (outline: Nesting; every other kind: Type;
Context: Link type; layout: trail). Curated (hand-made) lenses wait for a
package-level lens definition, which needs a future srs spec RFC.

### Labels come from the engine

- Relation group labels are the engine's `RelationTypeInfo.label`
  (`listRelationTypes`). The client never parses a relation key into a label; it
  humanises the key only when the engine label is empty.
- Record labels are the core-resolved `displayLabel`. Type and field labels go through
  the shared `src/lib/labels.ts` (`humanise`, `fieldLabel`), the same module the editor
  forms use ([ADR-024](./024-one-record-reading-component.md)).
- A composition has no title in the model yet, so its label is its humanised `name`
  (gap 5).

### Context shows the record's own links

- Context reads the selected record's edges once with `neighbours` and no limit (the
  engine returns every edge), then buckets them by each edge's own relation type and
  direction. Which groups exist is decided by that record's edges, never by a
  repository-wide count. Installed types come in `listRelationTypes` order; a key the
  engine does not list sorts last, labelled `humanise(key)`.
- A group's "Show more" reveals the next page of the edges already loaded. There is no
  second read.
- There is no type-filtered group. A typed group would need the engine to filter by
  neighbour type; until then Context shows every neighbour of a link type.
- "In" lists the containers that hold the record (`containersForInstance`).
- "Shown in" lists only what `documentViewsForContainer` returns for those containers
  (on `gallery.srsj`, an Articles record shows `articles-and-roles`).
  A composition whose container section is fixed is not returned by that binding, so
  it is missing from "Shown in" until gap 1 (srs-rust#1378) lands. The client never
  renders compositions to find their containers.

### One navigation tree

Collection's outline is the one navigation tree. #425 is re-scoped to extend it
(filter, keyboard, persisted expansion) and then adopt it in Generic and Governance.
No second tree component is built.

### Board columns follow the container view, else the type schema (extends ADR-010)

- Where the set has a container view, columns are its `ColumnSpec` (ADR-010
  unchanged). The Collection table is the ADR-010 list pane for Lenses: same column
  source, rendered with `LogTable`.
- Elsewhere (type, composition, find and drawn sets), columns are the type schema's
  first four short fields, in the author's declared order (`x-srs-order`), keyed by the
  engine's `Field.name` (the schema exposes no field id; RFC-039). No field name is a
  literal in client code; none is chosen by name.
- **Tell apart by "Nothing"** shows labels only. It is a valid first-class choice,
  not a fallback to shared fields.
- The long-term home is an engine binding that returns default columns for a type.
  The client choice is marked `ponytail:` naming that upgrade.

### "Tell apart by" is presentation

- It groups only what the engine returned. It never filters, and never derives
  membership.
- On a paged set it says so ("100 of N") and groups the loaded page only.
- The field options come from the engine: `find(…, { facets: true })`'s
  `facets.fields` (one facet per closed string field, keyed by `Field.name`) for type,
  Everything and navigation-section collections. The engine returns at most 25 field
  facets. Closed multiselect fields are included; a record with several values is
  grouped under each. Composition and drawn-set collections offer no field option.
- The type and Everything lenses load through `find` (paged); outline items carry the
  record the container view returns.
- **Edge-to-set classification is presentation.** `splitByBoundary` is the one
  classifier: it splits edges the engine returned by whether their other end is in a
  set the viewer drew or the engine returned. It asserts no new relation fact, never
  filters or hides an edge, and is the only edge classifier in client code. (The owner
  ruled this presentation with "Tell apart by" on 2026-10-09; the question included
  "splits links into inside or leaving the set".)
- The hub guard's threshold is a named presentation default, `HUB_LINKS`.
- Agents get "tell apart by" only when the engine gains a group-by. Until then it is
  a view setting, not a capability.

### Lens ids are a public contract

The `lens=` key of the address ([ADR-023](./023-one-hash-address.md)) holds a lens id:

| Id | Lens |
|---|---|
| `nav:<sectionContainerId>` | a navigation section |
| `comp:<compositionId>` | a composition |
| `type:<typeId>` | a type in use |
| `find` | Everything |
| `set` | the viewer's drawn set (per viewer, `localStorage` key `srs-web.lens-set.<repositoryId>`) |
| `pkg:<lensDefinitionId>` | **reserved** for package-defined lenses |

- Prefixes never change meaning once shipped.
- An unknown or unresolvable id falls back to the first lens, with no error. `set` on
  a browser that holds no set falls back the same way and shows a notice.

## Alternatives considered

- **Curated per-repository lenses in client code.** They read well in the prototype,
  but they put repository ids in the client. Rejected; kept as reference on
  `poc/ux-lenses` and in `plans/ux-lenses.md` §3.
- **A second navigation tree (#425 `NavTree`) beside Collection.** Two trees. Rejected.
- **Strict ADR-010: title, type and state columns only.** The first review found such
  boards useless. Rejected.
- **Push "Tell apart by" into `find` before shipping.** One answer for every client,
  but it blocks #547 on srs-rust work. Deferred to the engine group-by.
- **Client workarounds that compute relation results** (a repository-wide relation
  usage count, type-filtered groups over thousands of edges, rendering every
  composition to find its container), with a dated exception to ADR-001. Rejected by
  the owner (2026-10-09): the gaps are filed and the workarounds removed. There is no
  exception to ADR-001.

## Consequences

**Positive:**
- Lenses works on every repository with no package and no client knowledge of its
  content.
- No relation semantics live in TypeScript: every relation result is the engine's.
- Board columns stay schema-driven and id-based, keeping ADR-010's reason.
- Links to a lens and a record survive reload and are writable by agents.

**Negative / trade-offs:**

These engine gaps limit Lenses. The numbers are canonical: every `ponytail:` in
`src/lib/lens` and `src/rendering/RecordProse.svelte` that names a gap cites it as
"ADR-025 gap N" with the issue.

1. **No Composition read by id with its sections, and no "which compositions show
   this instance".** srs-rust#1378. The composition lens reads the JSON render
   projection as a stand-in; "Shown in" misses compositions with a fixed container
   section.
2. **No per-record anchors in rendered composition output.** srs-rust#1288. "As
   published" cannot highlight or scroll to the selection, and Document mode builds
   its own blocks one level deep.
3. **A Tier 0 note cannot be read through WASM.** srs-rust#1379. Focus says "A note;
   its text is not shown here."
4. **`find` hits carry no field values.** srs-rust#1380. The Everything and type
   lenses call `getRecord` once per hit.
5. **A Composition has no display title.** the-greenman/srs#928 (spec RFC needed).
   The client humanises the composition `name`.

Other trade-offs:
- "Tell apart by" is not available to agents over MCP until the engine has a group-by.
- Context has no type-filtered groups.
- The `set` lens is per browser. A shared link to `lens=set` does not show the sender's set.
