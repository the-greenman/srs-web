# Lenses: an interface model for srs-web that is not confusing

Status: Integrated by #547; §3 curated lenses are reference only. (Was: POC design, branch `poc/ux-lenses`.) The rules that bind the integration are ADR-022 to ADR-025 and `plans/547-lenses-view.md`; where this document differs, they win.
Inputs: a read of srs-web at 2141000 and a data survey of four live corpora (spec, muSrs, srs-programme, semanticops.com source), 2026-10-09.

## 1. Why it is confusing today (grounded)

1. Everyone lands in **GenericSrsShell**, a four-surface engine explorer (Document / Structure / Records / Map), whatever the repo is. Specialised shells (Governance, Guides, Essay, Method) are only chosen on `repo create` or a deep link.
2. Mode switching is one-way. Only Essay has "Go > Explorer" back; Governance/Guides/Method exit only via "Open another", which closes the document.
3. Generic's nav rail mixes four unrelated axes: Documents (compositions, labelled with package namespaces), Structure (containers), Explore (tool modes), Package editors (apps).
4. Relations are invisible except on the Map SVG. The inspector promises "fields and relations" and shows fields. Nothing answers "what links here".
5. Lists, record detail and forms each exist in 3–5 copies (RecordsView / LogTable / Card list / MethodBoard / BlockStack; field dump / Card / RecordReading; RecordForm / SectionForm). The same record looks and edits differently per shell.
6. Selection is per-shell, per-surface and has no address (#426). Switching anything loses your place.
7. Engine vocabulary leaks: "composition", `containerType`, tier marks, raw field names, "Clear record focus".
8. The frame is unified (3 panes, global widths) but the *meaning* of each pane changes per shell.

The four corpora are shaped differently (book / graph / outline / site) yet share ~15 data features every view must handle (long markdown fields, selects, list strings, inline composite refs, anchored containers, precedes vs arranged order, custom relation types, hub records, lifecycle, createdBy, tags). A generic explorer shows the features; a user wants the shape.

## 2. First principles

A person using any SRS repository is always asking one of three questions:

| Question | Pane | Backed by |
|---|---|---|
| **Where am I working?** a collection I move through | Collection | a container outline, a composition's sections, a type query, a facet of find |
| **What is this?** one thing, read or edited whole | Focus | rendered composition of a container, a record as reading/form, a note |
| **What is around it?** what links here and there, grouped by meaning | Context | neighbours grouped by relation type and direction, containers it belongs to, compositions that show it, provenance (derived-from, sourceRefs, createdBy) |

Everything the current shells do is one of these three, dressed differently. The unit that chooses *how* each pane is populated and labelled is a **Lens**.

### Lens

A Lens is presentation-only wiring (capability layering: no semantics in the client):

```ts
interface Lens {
  id: string;               // stable within the repo
  label: string;            // user words: "Essays", "The case", "Roadmap", "Pages"
  collection:               // what pane 1 lists
    | { kind: "outline"; containerId: string }                 // container members, arranged order + depth
    | { kind: "composition"; compositionId: string; containerId?: string }
    | { kind: "type"; typeId: string; groupBy?: fieldName; lifecycle?: string[] }
    | { kind: "navigation" };                                  // root container nav sections
  focus:                    // how pane 2 shows the selected thing
    | { kind: "reading" }   // record fields through typeSchema (labels, aiGuidance, long md collapsed)
    | { kind: "document"; compositionId?: string }            // render the container the record anchors
    | { kind: "form" };     // edit
  context: ContextGroup[];  // ordered groups; each = relation type + direction + label (+ optional type filter)
  layout: "trail" | "reader" | "board" | "graph";
}
```

Lenses come from two places, same type:

- **Derived lenses** (always present, zero config): one per root-container navigation section ("outline" of that section's container), one per composition ("composition"), one per type with records ("type"), one "Everything" (find with facets). Labels are the container/composition/type titles the engine already resolves (displayLabel), never namespaces.
- **Curated lenses** (per repository or per package): hand-declared. For the POC they live in a JSON map keyed by `repositoryId`. The right home is a package-level definition (`com.semanticops.ui/lens`, a presentation object beside Composition and Theme) so a package author ships its lenses with its types and the repo picks them up like compositions. That is a later RFC, not a POC concern.

Default context groups when a lens declares none: every installed relation type, both directions, labelled by the relation type's name, plus "In" (containers) and "Shown in" (compositions). Relation types used zero times are hidden. So the context pane is useful on day one for any repo and gets *curated* labels ("Evidence", "Challenged by", "Answers") only where a lens says so.

### Switching lenses keeps your place

The selected record is the fixed point. Switching lens re-roots the Collection to a collection that contains it (first container it belongs to under the new lens, or its type), re-renders Focus in the new focus kind, and swaps the Context groups. Nothing is lost. The address is `#lens=<id>&id=<instanceId>` (answers #426: one URL per selection; agents can set it).

### Layouts are arrangements of the same three panes

| Layout | Collection | Focus | Context | Fits |
|---|---|---|---|---|
| **trail** (default) | left list/outline | centre | right, grouped | essays, governance, programme problems |
| **reader** | left outline (collapsible, thin) | wide centre, rendered composition, in-place editing | context as footer per block or hover | spec, guides, site pages |
| **board** | full-width table/grid (columns from the composition's view, ADR-010) | drawer | drawer | roadmap, problem funnel, inventory |
| **graph** | left list | centre = RelationGraph focused on selection | right list of the same edges | concept dependencies, claim web |

The frame already exists (AppShell grid, resize, drawers). What changes: the panes get *one* Collection component, *one* Focus component and *one* Context component, parameterised by the lens. The five shells become curated lenses plus, where they genuinely need a bespoke writing surface (Essay BlockStack), a custom Focus component registered by type.

## 3. Lenses per corpus (what the POC demonstrates)

### muSrs (graph: claims ⇄ evidence ⇄ problems; stewardship)
- **The case** — collection: container "The case" (claims in order); focus: reading; context: Evidence (`evidences` ←, source/quotation), Challenged by (`challenges` ←), Depends on (`depends-on` →), Answers (`answers` →, problem), Refines (`refines` ↔), Authored by. Layout trail.
- **Research** — collection: type `argument/source` grouped by `source_kind`; focus: reading; context: Quotes pulled (`derived-from` ←, quotation), Supports (`evidences` →, claim), Challenges (`challenges` →), Problems raised (`derived-from` ←, problem). This is "browse my research and see what quotes I have pulled from it".
- **Problem grid** — collection: composition `problem-grid-document` (12 glyph containers); layout board with persona/scale/kind columns; context: Scoped by boundary, Answered by claim, Sources.
- **Stewardship** — collection: container "Stewardship" filtered to agent → standing-job (contains); focus reading; context: Runs (`derived-from` ← run-report), Authorised by role.
- **Guides** — collection: container "Guides" with nested guide containers; layout reader (render `guide-body-view`). This replaces the GuidesShell: same data, outline + rendered page + edit a section in place.
- Essays: the essay package is installed but has zero records here. The Essay lens is the same trail (collection: type essay; focus: custom BlockStack surface; context: References/Pinned as context groups) and is shown against the explorations repo when content exists.

### srs spec (book + concept graph + ledger)
- **Specification** — collection: navigation (9 Parts → Part container members in precedes order); layout reader; focus document (`spec-document-view` for the Part container); context: Prerequisites (`depends-on` →), Contains, Invariants of this concept.
- **Concepts** — collection: type `spec/concept`; layout graph on `depends-on` (cycles stay visible); context: Contains (mechanism/invariant/example), Required by (`depends-on` ←).
- **Decisions** — collection: type `spec/rfc-decision` with lifecycle filter; layout board (status, phase, date columns); context: Refines/Supersedes chain, RFC that carried it.

### srs-programme (outline + funnel + work log)
- **Roadmap** — collection: outline of container "SemanticOps roadmap" (the one corpus using `depth`); layout trail; context: Serves objective, Requires contract, Assessed by (reality_state inline).
- **Problems** — collection: containers Suggestions / Affirmed / Set aside as three columns (board); context: Held by persona, Concerns pole, Comments, Derived from (the Suggestions twin), Answered by remedy/epic. createdBy chip (human/ai) on each card.
- **Work log** — collection: Wave containers, units in precedes order with lifecycle; focus reading; context: Findings (contains →), Carried context, Depends on unit.

### semanticops.com source (site)
- **Pages** — collection: navigation (6 pages); layout reader with the page composition rendered; focus: a block's lede/body edited in place; context: Shown in, Prerequisite concept.
- **Inventory** — collection: by type (principle, concept, section…) as a board with the type's fields as columns.
- **Concept map** — graph on the 13 `depends-on` edges (the Model page's reading order).

Four corpora, thirteen lenses, three components, four layouts. No new Rust: everything above is served by `repositoryNavigation`, `resolveContainerView`, `getContainerOutline`, `listDocumentViews`/`renderDocumentView`, `find`, `neighbours`, `containersForInstance`, `documentViewsForContainer`, `typeSchema`, `listRelationTypes`.

## 4. Component set

```
src/lib/lens/
  lens.ts              Lens types; deriveLenses(repo); curated lens maps for the POC corpora
  LensShell.svelte     the three panes in one of four layouts; owns selection + hash address
  LensSwitcher.svelte  segmented control / menu at the top of Collection; curated first, derived under "More"
  Collection.svelte    outline | list | table(board) | sections — one component, mode from lens.collection + layout
  Focus.svelte         reading (typeSchema-labelled fields, long md collapsed, inline composite as table) | document (rendered composition) | form (SectionForm)
  Context.svelte       grouped neighbours (bounded `neighbours`), "In", "Shown in", provenance; click = navigate, keeps lens
  ContextGroup.svelte  one group: label, count, cards
```

Reuses: AppShell, Panel, Card, RelationGraph, SectionForm, PreviewPane, MarkdownText, Tag/TagChip, ActorChip, Toolbar. Retires (eventually): GenericSrsShell's four surfaces, Governance/Guides/Method nav, RecordReading vs Card vs field-dump split.

## 5. What the POC is and is not

Is: a hidden route `/lens` that opens any `.srs`/`.srsj` through the real WASM engine, shows derived lenses for any repo and curated lenses for the four surveyed corpora, with all four layouts, lens switching that keeps selection, and an address in the hash. Read-only except the Focus "form" kind (SectionForm) to prove editing fits.

Is not: a replacement of App.svelte's open/save/agent plumbing, a package-level Lens definition, or a visual redesign. Styles use existing tokens; new specimens for Collection/Focus/Context go on `/styleguide` as the project rule requires.

## 6. Open questions for the owner

1. Lens definitions: client JSON for now; should they become a package-level presentation object (beside Composition/Theme) via RFC? My recommendation: yes, after the POC proves the three-pane model, because the people who know the labels ("Evidence", "Challenged by") are the package authors.
2. Does Essay keep a bespoke Focus surface (yes, I think: BlockStack is a writing tool), with References/Pinned becoming Context groups?
3. Default landing: the first curated lens if any, else the "navigation" lens in reader layout. Never the engine explorer.

## 7. Owner note (2026-10-09): boundary, distinction, relationship

The owner's working pattern, stated while using the tool: "draw a boundary, create distinctions, then see relationships. A boundary defines the set I want to see. A distinction defines what I want to tell apart: sometimes all fields are just fields, sometimes I want types of fields; sometimes types of containers, sometimes just nesting." The lineage is systems science: looking for systems within systems.

Mapping onto the lens model, to carry into the next iteration (not the current build):

| Owner's word | In the interface | Today's lens field |
|---|---|---|
| **Boundary** — the set in view | Collection pane: a container, a composition's sections, a type query, a find facet, or a hand-drawn selection | `lens.collection` |
| **Distinction** — the axis you split the set by, or deliberately ignore | a *distinguish-by* control on every pane: none (flat), type, container kind, nesting depth, lifecycle, a select field, createdBy, relation type | new: `lens.distinguish` (per pane); `groupBy` is its first instance |
| **Relationship** — what crosses or stays inside the boundary | Context pane and graph layout; edges are shown as inside the set vs crossing out of it | `lens.context`, layout `graph` |

Consequences: (1) "no distinction" must be a first-class choice — a flat list of things with their fields, no type chips, is a valid lens, not a degraded one; (2) the same set under two distinctions is the "same data, different view" the owner asked for, so switching distinction keeps boundary and selection; (3) a boundary should be drawable ad hoc (multi-select → "treat as a set"), and saving one is how a curated lens is born; (4) the graph layout should colour edges by inside/crossing rather than by relation type by default. Public-facing copy stays in plain words (set, tell apart, links), per the project's vocabulary rule.

## 8. Programme integration (2026-10-09)

Recorded in srs-programme (PR the-greenman/srs-programme#34, Suggestions layer, awaiting owner affirmation):
- **SP-48** (suggested, agent:analyst): every repository opens as the same engine view. Cluster "Seeing and arranging the group's meaning"; concerns the Perspective tension, pole Zoom out held too long.
- **Remedy** (suggested, agent:remedy-scout): open every repository through lenses. Answers SP-48 and the affirmed SP-47 (boundaries fixed by where files sit) and SP-19 (writers see structure agents need, not their own).
- Evidence comments on SP-47, SP-19, SP-14, SP-05. Source: `source-documents/srs-web-lenses-2026-10-09/assessment.md`.

Path into the roadmap once affirmed (Focus 1 ranks objective 1, agent-supported writing, P0, epic semanticops.com#29):
1. A new story under #29, "Work in any repository through lenses", answering SP-48. It takes over two open pieces of story #22 (srs-web#425 NavTree becomes the Collection outline; srs-web#426 selection address is the lens address), one way per goal.
2. srs-web issues per pane, each `Answers: SP-48`: shell + Collection, Focus modes, Context, distinction control, landing on a lens. srs-web#137 (converge Governance and Guides) is answered by making them curated lenses.
3. srs-rust issues for the six engine gaps, each `Answers: SP-05` (gaps 1 and 2 also SP-24), parented to the same story so they inherit its priority.
4. Parked muDemocracy.org#83 (generic semantic content editor) is a source, not an import: the site lens is its answer once the story exists.
5. Later, an RFC for lens definitions in packages (Door 2), only after Focus modes are proven.

Dogfood target inside the programme itself: a "Problems" board lens over Suggestions, Affirmed and Set aside, told apart by createdBy, with the owner's fork-to-Affirmed as its one action. That surface answers SP-48 and the affirmed "Agent feedback accumulates faster than it can be read".
