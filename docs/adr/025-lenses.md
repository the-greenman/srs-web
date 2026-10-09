# ADR-025: Lenses, one engine view of three panes over derived lenses

- **Status:** Accepted (2026-10-09, with [srs-web#553](https://github.com/the-greenman/srs-web/pull/553))
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
- **Link direction is in the label (presentation).** The engine gives one label per
  relation type, written for the source side, and no incoming label. A
  definition's `inverseType` names a key, and on the core package those keys
  (`part-of`, `source-of`, `follows`, `superseded-by`) are not installed types, so they
  carry no label. One generic, data-free rule therefore names the direction:
  - an outgoing group shows the engine label as is ("Depends on");
  - an incoming group shows the label of the installed type its `inverseType` names,
    when there is one, and otherwise the engine label followed by " this"
    ("Depends on this");
  - outgoing groups come first, then incoming ones.
  No per-relation wording is written in client code.
- Record labels are the core-resolved `displayLabel`. Type and field labels go through
  the shared `src/lib/labels.ts` (`humanise`, `fieldLabel`), the same module the editor
  forms use ([ADR-024](./024-one-record-reading-component.md)).
- A composition has no title in the model yet, so its label is its humanised `name`
  (gap 5).

### Context shows the record's own links

- Context reads the selected record's edges once with `neighbours` and no limit (the
  engine returns every edge), then buckets them by each edge's own relation type and
  direction. Which groups exist is decided by that record's edges, never by a
  repository-wide count. Outgoing groups come before incoming ones. Within each,
  installed types come in `listRelationTypes` order; a key the engine does not list
  sorts last, labelled `humanise(key)`.
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
- Elsewhere (type, composition, find and drawn sets), columns are label, type and
  state only, until the engine exposes field ids (gap 6). The owner's board-columns ruling (the
  type schema's first four short fields, by field id) is the target once gap 6 lands.
  No column is ever chosen by field name.
- **Tell apart by "Nothing"** shows labels only. It is a valid first-class choice,
  not a fallback to shared fields.
- The long-term home is an engine binding that returns default columns for a type.

### "Tell apart by" is presentation

- It groups only what the engine returned. It never filters, and never derives
  membership.
- On a paged set it says so ("100 of N") and groups the loaded page only.
- **No field option until the engine gives field ids** (gap 6). A field is named by
  its id (`by=field:<fieldId>`, ADR-023), and no binding returns one for a schema
  property or a `find` facet. `find`'s `facets.fields` is keyed by `Field.name`, so
  it is not used. The option list carries a `ponytail:` citing gap 6. When field ids
  arrive, field options come from the facets for every collection `find` can scope.
- The type and Everything lenses load through `find` (paged); outline items carry the
  record the container view returns.
- **Edge-to-set classification is presentation.** `splitByBoundary` is the one
  classifier: it splits edges the engine returned by whether their other end is in a
  set the viewer drew or the engine returned. It asserts no new relation fact, never
  filters or hides an edge, and is the only classifier by set membership in client code
  (`groupEdges` only buckets engine edges by their own relation type and direction). (The owner
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
  boards weak. It is the interim for sets with no container view until gap 6, not the
  target.
- **Name field options and columns by `Field.name`** (the key records and facets
  share). Two Types can share a name for different Fields, and a name is not a stable
  address. Rejected by the owner (2026-10-09): ask the engine for field ids (srs#931).
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
6. **No field id for a type-schema property or a `find` field facet.**
   the-greenman/srs#931 (spec RFC needed: RFC-039 retired `x-srs-field-id`). "Tell
   apart by" offers no field option, and boards outside a container view show label,
   type and state only.

Other trade-offs:
- "Tell apart by" is not available to agents over MCP until the engine has a group-by.
- Context has no type-filtered groups.
- The `set` lens is per browser. A shared link to `lens=set` does not show the sender's set.
