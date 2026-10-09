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

- one per navigation section (`repositoryNavigation`, so ADR-009 sections become lenses);
- one per composition;
- one per type in use;
- **Everything** (`find`);
- the viewer's drawn set.

No repository id, field name, relation key or namespace appears in client code or
decides behaviour. Labels are humanised from engine output only. Curated
(hand-made) lenses wait for a package-level lens definition, which needs a future srs
spec RFC.

### D4: one navigation tree

Collection's outline is the one navigation tree. #425 is re-scoped to extend it
(filter, keyboard, persisted expansion) and then adopt it in Generic and Governance.
No second tree component is built.

### D6: board columns (extends ADR-010)

- Where the set has a container view, columns are its `ColumnSpec` (ADR-010 unchanged).
- Elsewhere (type, composition, find and drawn sets), columns are the type schema's
  first four short fields, in the author's declared order, matched by field id. No
  field is chosen by name.
- **Tell apart by "Nothing"** shows labels only. It is a valid first-class choice,
  not a fallback to shared fields.
- The long-term home is an engine binding that returns default columns for a type.
  The client choice is marked `ponytail:` naming that upgrade.

### D7: "Tell apart by" is presentation

- It groups only what the engine returned. It never filters, and never derives
  membership.
- On a paged set it says so ("100 of N") and groups the loaded page only.
- The inside/outside-the-set split works the same way over returned edges.
- The hub guard's threshold is a named presentation default, `HUB_LINKS`.
- Agents get "tell apart by" only when the engine gains a group-by. Until then it is
  a view setting, not a capability.

### D9: lens ids are a public contract

The `lens=` key of the address ([ADR-023](./023-one-hash-address.md)) holds a lens id:

| Id | Lens |
|---|---|
| `nav:<sectionContainerId>` | a navigation section |
| `comp:<compositionId>` | a composition |
| `type:<typeId>` | a type in use |
| `find` | Everything |
| `set` | the viewer's drawn set (per viewer, in `localStorage` keyed by repository id) |
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

## Consequences

**Positive:**
- Lenses works on every repository with no package and no client knowledge of its
  content.
- Board columns stay schema-driven and id-based, keeping ADR-010's reason.
- Links to a lens and a record survive reload and are writable by agents.

**Negative / trade-offs:**

The client works around eight engine gaps. Each workaround is marked `ponytail:` with
its gap number, and each gap is a future srs-rust issue answering SP-05:

1. No binding returns a whole Composition with its sections. The client reads the
   JSON render projection instead, and renders every composition once to learn its
   container.
2. Rendered output has no per-record anchors. "As published" cannot highlight the
   selection, and Document mode builds its own blocks one level deep.
3. No relation-usage counts per relation type. The client reads every relation once
   per load to hide unused types.
4. A Tier-0 note's text cannot be read through the record binding. Focus says "A note;
   its text is not shown here."
5. `neighbours` has no type filter and no paging over all edges. Typed Context groups
   read up to 10 000 edges and filter in TypeScript; all-edges caps at 500.
6. Compositions have no title. The client humanises the composition `name`.
7. `find` returns no select-field value facets. The client reads each member type's
   schema to offer "Tell apart by" a field.
8. `find` has no projection with field values. The Everything lens calls `getRecord`
   per hit.

Other trade-offs:
- "Tell apart by" is not available to agents over MCP until the engine has a group-by.
- The `set` lens is per browser. A shared link to `lens=set` does not show the sender's set.
