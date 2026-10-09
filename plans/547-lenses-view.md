# Plan: Lenses view — three panes, Tell apart by, drawn sets, one address (srs-web#547)

> Stage 2 of /ship. Plan only. Worktree `~/dev/.wt/srs-web/547-lenses-view`, branch `feat/547-lenses-view`, off `origin/main` d067737 (0 commits behind at planning time).
> Prototype: branch `poc/ux-lenses` (`/home/greenman/dev/semanticops/srs-web-wt-ux-lenses`, commits 32e87a0..f96ecc2 on d067737). Design: `plans/ux-lenses.md` there (§2, §7, §8). Reviews: two fresh-eyes rounds (scratchpad `shots/critique.md`, `critique2/critique.md`); round 3 (f96ecc2) answered most round-2 findings.
> Answers: SP-47, SP-19 (and the suggested SP-48). Story: the-greenman/semanticops.com#22. Owner merges.

---

## Owner rulings (2026-10-09, walked one at a time)

| # | Decision | Ruling | ADR |
|---|---|---|---|
| D1 | Entry point | Built-in engine view beside the explorer (Explore > Lenses, Go > Explorer back); not a registry editor; works on read-only links | ADR-022 (supersedes ADR-002) |
| D2 | Address | Generalise `essay/address.ts` to `src/lib/address.ts` now; Essay and Lenses on it; this PR narrows #426 | ADR-023 |
| D3 | Reading a record | Extract `src/rendering/RecordProse.svelte`; Lenses Read and Document blocks use it; Governance fallback and explorer inspector adopt it in a #137 follow-up | ADR-024 |
| D4 | Navigation tree | Collection's outline is the one tree; re-scope #425 to extend it | ADR-025 |
| D5 | ADR structure | Four ADRs, one rule each: 022 built-in views and editor registry, 023 one hash address and one history, 024 one record reading component, 025 Lenses | — |
| D6 | Board columns | Container view's ColumnSpec where present; else the type schema's first four short fields in declared order, by field id; "Nothing" = label only; engine default-columns binding is the long-term home | ADR-025 (extends ADR-010) |
| D7 | Tell apart by | Presentation over engine-returned data only; paged sets say so; `HUB_LINKS` a named presentation default; engine group-by later for agents | ADR-025 |
| D8 | Back | One history: following a link pushes the address; the trail is `history.state`, shown with Breadcrumb; trail Back = browser Back | ADR-023 |
| D9 | Lens ids | `nav:`, `comp:`, `type:`, `find`, `set`; `pkg:` reserved; prefixes never change; unknown id falls back without error | ADR-025 |
| — | PR split | Two PRs: A = Phases 0–5 (`Refs #547`), B = Phases 6–8 (`Closes #547`) | — |

Where this plan's text below says "ADR-022 (Lenses)" or "ADR-023", read the table above: Lenses is ADR-025.

## Decisions for the owner (as presented)

Each decision below would be painful to reverse once it ships. Each has a recommendation. Phase 0 records the answers before any code is written. Where you have not answered, the recommendation is the default.

### D1. Entry point: how a person reaches Lenses in the real app

Today App renders `GenericSrsShell` when `editorMode === "generic"`, and otherwise the `EDITORS` entry `usableEditor()` returns. Registry availability is keyed on `entryTypeId` (ADR-002, `registry.ts` header: "Availability is keyed on UUID identity"). `offeredEditors` is `[]` while the document is read-only (`App.svelte:148`, ADR-021). So a registry editor disappears for `?open=` links.

| Option | Trade-offs |
|---|---|
| **A. A built-in engine view beside Generic.** `editorMode` gains a second reserved value, `"lenses"`, exempt from the `usableEditor` gate like `"generic"`. Generic's nav "Explore" group gets a "Lenses" item. Lenses has Go > Explorer back (the Essay pattern). | The registry keeps one meaning: package editors keyed on an entry type. Lenses works on every repository, read-only links included, because it reads engine structures only. App gains one branch. LensShell reuses `EditorShellProps`, so it is still type-checked against the same contract. |
| B. An `EDITORS` entry with an optional `entryTypeId`, "always available". | One list of shells, but it breaks the registry's stated invariant (availability keyed on a type UUID). It also needs a special case to survive read-only, where `offeredEditors` is empty. The picker's "Package editors" group would list an engine view as a package editor. |
| C. Lenses is the default landing (replaces Generic as first view). | Answers SP-48 fully, but the issue scopes it out ("No current shell is replaced"). It needs its own owner decision after use. |

ADRs: ADR-002 (mode selection gains a built-in view), ADR-014 (precedent: static nav items for engine-level tools, not content), ADR-021 (read-only is a document state, not a shell mode), ADR-001.
**Recommendation: A.** The registry stays honest, and read-only links get Lenses too. C becomes a later one-line change (the initial `editorMode`) once the owner has used it.

### D2. Address: the prototype's own hash vs one shared address module (#426)

The prototype writes `#repo=&lens=&id=&by=&ctxby=` with `history.replaceState` and reads it only at mount. So browser Back does not walk selections, and `repo=` exists only for the POC corpora. The essay has `src/lib/essay/address.ts` (`#e=&p=&z=`, `pushState`). #426 asks for `src/lib/address.ts` holding `{containerId, instanceId, …}`, used by every shell.

| Option | Trade-offs |
|---|---|
| **A. Generalise now.** Move `essay/address.ts` to `src/lib/address.ts`: one `Address` type with essay keys (`e`, `p`, `z`) and lens keys (`lens`, `id`, `by`, `ctxby`); one `parseAddress`/`formatAddress`. Essay imports it unchanged in behaviour. Lenses pushes on selection, replaces on a distinction change, and listens to `hashchange`. This PR **narrows #426**: the module, the Lenses address and Essay on it land here; the Generic, Governance and Guides fixes stay in #426. | One address scheme from day one, no second parser. It touches Essay imports, which is a small, test-covered change (`tests/address.test.ts`). It does not fix Generic's middle/right divergence; that remains #426's job. |
| B. Lenses keeps its own hash parser in `src/lib/lens/`; #426 unifies later. | Smallest diff now, but two address parsers is the drift the owner rule forbids, and agents learn two schemes. |
| C. Close #426 here by also moving Generic, Governance and Guides onto the address. | Closes the issue, but adds four shells' selection rewiring to an already large PR, and the issue says no current shell is replaced. |

ADRs: none govern the hash today (ADR-021 governs `?open=`/`?repo=` query params and must keep the hash intact). Proposed ADR-023 below.
**Recommendation: A, narrowing #426.** The PR body says "Narrows #426 (address module + Lenses + Essay); Generic/Governance/Guides remain." Hash keys stay readable so an agent can write them.

### D3. Focus "Read" vs the existing reading components (one way per goal)

Today records are read in three ways. `RecordDispatch` → `RecordView` → `Card`/`CardField` is a labelled field card, and needs the `fieldMeta` context only GovernanceShell sets (ADR-013 negative). Generic's inspector is a raw `name: value` dump. `RecordReading` wraps `RecordDispatch`. The prototype's Focus `read` snippet is a fourth: prose with no labels for the body, chips for short values, composites as tables. Both reviews found it is what fixes "you never know whether you are reading or administering".

| Option | Trade-offs |
|---|---|
| A. Port Focus's read snippet as-is inside `Focus.svelte`; file a convergence follow-up. | Smallest diff, but a fourth reading implementation, buried in a lens component no one else can import. |
| **B. Extract it once as `src/rendering/RecordProse.svelte`** (props: `record`, `fields`, `composites`, `heading`; no context dependency). Focus uses it for Read and for every Document block. Adoption by `RecordDispatch`'s fallback and Generic's inspector is a follow-up under #137. | The reading component lives in the rendering layer, where #137 says record detail converges. No context requirement, so it works outside GovernanceShell (avoids ADR-013's trap). Governance and Generic are not touched in this PR, so no regression risk there. |
| C. Focus renders through `RecordDispatch`/`RecordView` now. | One way immediately, but it brings back the labelled-form look the reviews rejected. It also needs `setFieldMetaContext` inside LensShell. |

ADRs: ADR-006/007 (TYPE_REGISTRY view dispatch still wins for registered types later), ADR-013, ADR-001.
**Recommendation: B.** File one srs-web follow-up: "RecordDispatch fallback and Generic inspector read through RecordProse (#137)".

### D4. Collection outline vs the #425 NavTree

#425 specifies a `NavTree` built from `repositoryNavigation` plus `getContainerOutline`. It has collapse by depth, a filter, keyboard navigation and persisted expansion, and replaces Generic's and Governance's lists. The prototype's `Collection` list mode is an outline from the same two bindings, with one-level expand, group headings ("Tell apart by"), checkboxes and a table mode.

| Option | Trade-offs |
|---|---|
| **A. One component: `Collection` list mode is the outline.** Comment on #425 to re-scope it: "extend `Collection`'s outline with filter, keyboard and persisted expansion, then adopt it in Generic and Governance". | One tree. This PR does not grow by #425's features. #425's later work extends a component that already has a consumer. |
| B. Build #425's NavTree inside this PR and have Collection wrap it. | One tree too, but this PR then carries #425's filter, keyboard and persistence work. |
| C. Two components (Collection outline and NavTree). | The duplication the owner rule names. |

ADRs: ADR-009 (nav from `repository_navigation`; Collection's navigation lenses use exactly that), ADR-020 (shared components, `data-part`).
**Recommendation: A.**

### D5. A new ADR

The work sets new constraints: a built-in engine view, derived-only lenses with no repository ids in client code, a lens id scheme that is part of a public address, and client-side "Tell apart by" over loaded sets. It also extends ADR-009 (sections become lenses) and ADR-010 (columns for sets with no container view).
**Recommendation: two ADRs, drafted below:** ADR-022 (Lenses) and ADR-023 (one hash address). ADR-023 can be folded into ADR-022 if you want one file. It is separate because #426 and Essay depend on it, not on Lenses.

### D6. Board columns for sets that have no container view (ADR-010)

ADR-010: list columns come from `resolveContainerView(...).columns` (`ColumnSpec`); "keep hardcoded fields as a fallback" was rejected. The prototype follows this for outline lenses. For type, composition, find and drawn sets it picks columns in TS. `typeColumns` uses the type schema's first four non-markdown, non-text fields. `sharedFields` uses the fields every record carries, under "Nothing".

| Option | Trade-offs |
|---|---|
| **A. `ColumnSpec` where a container view exists; elsewhere the type schema's first four short fields in schema order (author-declared order), recorded as an ADR-010 extension in ADR-022.** Drop `sharedFields`: "Nothing" means label only, which design §7 calls a valid first-class choice. | Every set gets a usable board. The choice is schema-driven, never name-based, so it keeps ADR-010's reason (no name-based semantics) even though the client picks the count. |
| B. Strict ADR-010: title, type and state columns only, unless a container view exists. | Purest, but the review found boards of only TYPE and STATUS useless (critique round 1, "The case" board). |
| C. A new engine binding: default columns for a type. | Right long-term home. Not needed to ship; can follow if two clients need it. |

**Recommendation: A**, with `ponytail:` on `typeColumns` naming C as the upgrade.

### D7. "Tell apart by" as client-side grouping (capability layering)

`groupItems` groups already-loaded items by type, lifecycle, `createdBy`, container or a select field value. `splitByBoundary` splits edges by membership of the loaded set. `skipHubs` applies a 50-link threshold. The capability-layering test is "if two clients could ever disagree, the logic is in the wrong place".

| Option | Trade-offs |
|---|---|
| **A. Presentation, recorded as such in ADR-022.** It groups only what the engine returned, never filters or derives membership. On a paged set it says it groups the loaded page ("100 of N"). | Ships now, and is the same class as ADR-018's presentation-layer filter. If agents need "tell apart by" over MCP, the engine needs a group-by, so follow-up gap 7 (select facets) is the first step. |
| B. Push grouping into `find` (group-by axis) before shipping. | One answer for every client, but it blocks this issue on srs-rust work. |

**Recommendation: A.** The hub threshold is a presentation default, kept as a named constant (`HUB_LINKS`).

### D8. The link trail's Back vs browser Back

The issue wants "a link trail with Back" and "Back and reload work". The prototype has an in-app trail (`trail` state, its own Back) and no browser history. Two Backs that can disagree are two ways to do one goal.

| Option | Trade-offs |
|---|---|
| **A. One history.** Following a link `pushState`s the address. The trail is the recent followed entries kept in `history.state`, shown with `Breadcrumb`. The trail's Back calls `history.back()`. Picking from the Collection clears the trail (it starts a new walk) but still pushes. | Browser Back and the visible Back always agree, and reload keeps the trail via `history.state`. Slightly more code than the prototype. |
| B. Keep the separate in-app trail; browser Back walks hash changes independently. | Smallest port, but two histories. |

**Recommendation: A.**

### D9. Lens ids are a public contract

The hash's `lens=` value is what links, reloads and agents use. Proposed scheme: `nav:<sectionContainerId>`, `comp:<compositionId>`, `type:<typeId>`, `find`, `set`. All are engine UUIDs or fixed words, with no repository ids in code. Package-defined lenses (a later RFC) take a new prefix, `pkg:<lensDefinitionId>`, so existing links never change meaning. `set` is the viewer's own drawn set, held in `localStorage` per repository id (per-viewer convenience). On another browser it falls back to the first tab and shows a notice.
**Recommendation: adopt this scheme in ADR-022 and do not change prefixes later.** An unknown or unresolvable `lens=` falls back to the first lens without error.

---

## Summary

Every repository opens in the generic explorer, whatever it holds. Relations are visible only on the Map. Nothing answers "what links here". The same record reads and edits differently in each editor, and a selection has no address (assessment `srs-programme/source-documents/srs-web-lenses-2026-10-09/assessment.md`). The `poc/ux-lenses` prototype has passed three rounds of fresh-eyes review and proved the three-pane lens model over four live corpora.

This plan ports it into the real app as an additive **Lenses** view beside the explorer. It covers:
- derived lenses only;
- Collection / Focus / Context panes;
- "Tell apart by";
- drawn sets with a hub guard;
- one hash address shared with Essay;
- four layouts, specimens and tests.

No WASM changes. The eight engine gaps stay client workarounds marked `ponytail:`, each tied to a proposed srs-rust follow-up.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | /ship orchestrating session (thin orchestrator: no unit work) |
| Web App Worker | Sonnet agent per phase, on this worktree only |
| Architecture Reviewer (srs-web) | Sonnet agent, read-only, after Phase 0 (ADR drafts) and before each push |
| Verification Agent (srs-web) | Sonnet/Haiku agent, read-only, at every milestone gate |
| Fresh-eyes Reviewer (srs-web) — **new role** | Sonnet agent that has not seen the design, read-only, Phase 5 and Phase 8 |

**New role to add to `plans/agents.md` in Phase 0** (the prototype's three review rounds used it; agents.md has no such role):

> **Fresh-eyes Reviewer (srs-web)**
> - **Owns:** Judging a UI change as a first-time user. It runs the dev server and Playwright against named fixtures, completes a task list written by the Lead Integrator, and reports where it hesitated, got lost, or saw engine vocabulary. Screenshots go to the session scratchpad.
> - **Write scope:** none in the repo (scratchpad only).
> - **Must not:** read the plan or design doc before the run; propose code.
> - **Returns:** per-task WORKED / PARTLY / FAILED with screenshots, the single biggest confusion, and console errors.

## Architecture Decisions

Every srs-web ADR (001–021) was read. Below: how each one bears on this plan.

| ADR | Bearing on this plan | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Hard constraint. Every read goes through existing `srs-client.ts` bindings, and every write is `updateRecord` via `SectionForm`. Eight engine gaps stay `ponytail:` workarounds, not TS semantics (see Out of scope). | accepted, governs |
| [ADR-002](../docs/adr/002-editor-mode-selection.md) | Explicit mode selection. D1-A adds a built-in view reached explicitly; no auto-detection. | accepted, extended by ADR-022 |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | "As published" renders a Composition (document view); Edit uses the type schema, never the view. | accepted, respected |
| ADR-004 / ADR-005 | Superseded; no bearing. | superseded |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) / [ADR-007 type registry](../docs/adr/007-unified-type-registry.md) | Lenses add no TYPE_REGISTRY entries. RecordProse is the fallback reader; a registered view can take over via RecordDispatch later (D3). | accepted, respected |
| [ADR-007 CSS themes](../docs/adr/007-frontend-css-themes.md) | Preview CSS only; Focus "As published" renders markdown through `MarkdownView`, not the preview iframe. No bearing. | accepted |
| [ADR-008](../docs/adr/008-rfc009-uuid-chain-join.md) | Composition ↔ container joins come from engine bindings (`documentViewsForContainer`, render projection `containerId`), never string matching. | accepted, respected |
| [ADR-009](../docs/adr/009-container-driven-nav.md) | Navigation-section lenses come from `repositoryNavigation`. Containers from data, never TS constants. | accepted, extended by ADR-022 |
| [ADR-010](../docs/adr/010-view-driven-list-columns.md) | Board columns: `ColumnSpec` where a container view exists; schema-order extension elsewhere (D6). | accepted, extended by ADR-022 |
| ADR-011 / ADR-015 / ADR-016 / ADR-017 | OAuth worker, binary storage, exploded trees, refresh tokens: no bearing (Lenses never touches storage; Save stays App's). | accepted |
| [ADR-012](../docs/adr/012-governance-status-via-lifecycle-binding.md) | Lifecycle is shown read-only as `Tag`. Lenses offers no transitions, and Edit never writes status as a field. | accepted, respected |
| [ADR-013](../docs/adr/013-repo-context.md) | RecordProse takes props, not the repo context, so it renders outside GovernanceShell (D3). | accepted, respected |
| [ADR-014](../docs/adr/014-repository-tool-sections.md) | Precedent for a static nav item for an engine-level surface: the "Lenses" item in Generic's Explore group. | accepted, precedent |
| [ADR-018](../docs/adr/018-picker-srs-discovery.md) | Precedent for presentation-layer grouping/filtering over engine output (D7). | accepted, precedent |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | Specimens for every pane on `/styleguide`, rendered in default and demo themes. `lens.css` in the `components` layer; no scoped `<style>`. | accepted, governs |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | The prototype's glyph buttons (`+`, `−`, `←`, `→`) become `IconButton` + Lucide. Component tokens on `:root`. `data-part` rows for the lens components. `Select`/`Checkbox`/`Breadcrumb`/`ActionMenu` reused. | accepted, governs |
| [ADR-021](../docs/adr/021-open-from-url.md) | Lenses is available on read-only documents; Edit is hidden and the read-only repo refuses writes underneath. Query-param clearing must keep the hash. | accepted, respected |
| ADR-022 (new) | Lenses: one engine view of three panes over derived lenses | proposed (Phase 0) |
| ADR-023 (new, or folded into 022) | One hash address for every shell | proposed (Phase 0) |

### Draft ADRs (for Phase 0; not written yet)

**ADR-022: Lenses — one engine view of three panes over derived lenses.**
srs-web gains a built-in engine view, *Lenses*, beside the generic explorer. It is reached from Generic's Explore group and returns by Go > Explorer, and it is not a registry editor. It answers three questions in three panes, each built once: Collection (the set), Focus (one thing: Read, Document, Edit in place, read-only As published) and Context (the record's links, grouped).
- A *lens* is presentation wiring, derived from engine data only: one per navigation section, composition and used type, plus Everything and the viewer's drawn set.
- No repository ids, field names or relation keys appear in client code.
- Lens ids are `nav:|comp:|type:<uuid>`, `find` and `set`; `pkg:` is reserved for package-defined lenses after an RFC.
- "Tell apart by" and the inside/outside-the-set split are presentation over engine-returned items and edges. They never filter or derive membership.
- Board columns are `ColumnSpec` where a container view exists, else the type schema's first short fields in schema order.

Extends ADR-002, ADR-009 and ADR-010. Rejected: a registry entry with no entry type (breaks the registry invariant and vanishes on read-only), and curated per-repository lenses in client code (repository ids in the client).

**ADR-023: One hash address for every shell.**
- `src/lib/address.ts` is the only parser and formatter of the URL hash. It owns one `Address` with essay keys `e`, `p`, `z` and lens keys `lens`, `id`, `by`, `ctxby`.
- A selection change pushes a history entry. A view-setting change (a distinction) replaces it. Shells react to `hashchange`, so Back, reload and an agent writing the hash all go through one path.
- The query string stays reserved for boot links (ADR-021), which must preserve the hash when they clear themselves.
- Shells not yet on the address (Generic, Governance, Guides) move to it under #426.

---

## Contracts

### WASM API surface

**No new or changed WASM methods.** Every call the prototype makes exists on `origin/main`'s `srs-client.ts`: `repositoryNavigation`, `getContainerOutline`, `resolveContainerView`, `getContainer`, `containersForInstance`, `listContainers`, `listDocumentViews`, `documentViewsForContainer`, `renderDocumentView`, `find`, `listRecords`, `listTypes`, `getRecord`, `typeSchema`, `neighbours`, `listRelations`, `listRelationTypes`, `updateRecord`, `repositoryId`. The eight engine gaps are follow-ups (Out of scope), not dependencies.

`src/lib/read-only.ts` needs no change: Lenses adds no binding, and its only write is `update_record`, already classified.

### TypeScript types

No new WASM-output types. Lens types (`Lens`, `Collection`, `Focus`, `ContextGroupDef`, `Item`, `FocusData`, `ContextItem`, …) are client presentation types in `src/lib/lens/`. `Address` in `src/lib/address.ts` gains the lens keys.

---

## Scope

- A built-in **Lenses** view in App, reached from Generic (Explore > Lenses) and leaving by Go > Explorer. It works on editable and read-only documents (D1).
- **Derived lenses only:** navigation sections, compositions, used types, Everything, and My set. No curated lenses and no repository ids in code.
- **Collection** (list/outline and table), **Focus** (Read via `RecordProse`, Document, Edit in place, As published), **Context** (groups by link type, Nothing, inside/outside the set; In; Shown in; link trail with Back).
- **Tell apart by** on Collection (nothing, type, nesting, container, state, created by, select field) and Context (link type, nothing, inside/outside).
- **Draw a set:** Select mode with checkboxes and shift-range, "Show as a set", "Add everything these link to" with the hub guard and the skipped-hub list.
- **One address:** `src/lib/address.ts` shared with Essay. Lens, record and distinctions are in the hash. Back, reload (after restore) and `hashchange` all work (D2, D8).
- **Four layouts:** trail, reader, board, graph.
- Styleguide specimens for every pane, in both themes.
- Unit tests for lens building, distinctions and the boundary split; one e2e spec against `e2e/fixtures/srs-spec.srs`.
- Port `plans/ux-lenses.md` into this worktree as the design reference. Its §3 is the reference for the hand-made lenses that are not ported.

**Out of scope:**

- Hand-made (curated) lenses, and lens definitions in packages (needs an srs RFC, Door 2). The prototype's `curatedLenses` stay as reference on `poc/ux-lenses` and in `plans/ux-lenses.md` §3. Do not delete that branch.
- An essay writing surface in Focus; Essay stays its own shell.
- Replacing or changing the Generic, Governance, Guides, Essay or Method shells (only Generic gains a nav item).
- Lenses as the default landing (D1-C).
- Generic, Governance and Guides moving onto the shared address (#426 remainder).
- NavTree filter, keyboard and persisted expansion (#425, re-scoped onto Collection by D4).
- `RecordDispatch` and the Generic inspector adopting `RecordProse` (#137 follow-up, D3).
- Lifecycle transitions and relation creation from Lenses.
- **Engine gaps.** Proposed srs-rust follow-ups, each `Answers: SP-05`, parented to story semanticops.com#22. **Not filed by this plan;** the Lead Integrator files them at the docs stage after owner sign-off.

| # | Gap (issue list) | Proposed srs-rust title | Client workaround it removes (kept with `ponytail:`) |
|---|---|---|---|
| 1 | No binding returns a whole Composition with its sections | `get_composition: one Composition with its sections and resolved container (service + CLI + WASM + MCP)` | `lens-data.ts` `loadCollection` "composition" reads the JSON render projection as a stand-in. `compositionsByContainer` renders **every** composition once to learn its container (`lens-data.ts:149`, `:350`). |
| 2 | Rendered output carries no per-record anchors | `render_composition: emit the instance id of every rendered block (anchors)` | "As published" cannot highlight or scroll to the selection (`lens-data.ts:392`). Document mode composes its own blocks from records, one level deep, through the generic reader (`loadContainerBlocks`, `lens-data.ts:315`). |
| 3 | No relation-usage counts per relation type | `relation_type_usage: count relations per installed relation type` | `defaultContext` reads every relation once per load to hide unused types (`lens.ts:84`). |
| 4 | Notes cannot be read through the record binding | `Read a Tier-0 note's text through the record read binding (or a note read binding)` | `tryRecord` swallows the `getRecord` throw. Focus shows "A note; its text is not shown here." |
| 5 | `neighbours` has no type filter and no all-edges paging | `neighbours: filter by neighbour type and page over all edges` | Typed Context groups read up to 10 000 edges and filter in TS (`lens-data.ts:442`). `allEdges` caps at 500 (`:467`). |
| 6 | Compositions have no title | `Composition display title resolved by the core` (may need an srs spec change first; check before filing) | `compositionTitle` humanises the composition `name` for lens labels and "Shown in". |
| 7 | `find` returns no select-field value facets | `find: select-field value facets` | `selectFields` reads each member type's `typeSchema` to offer "Tell apart by <field>" (`lens-data.ts:225`). |
| 8 | `find` has no projection with field values | `find: optional projection with field values, lifecycle and createdBy` | The Everything lens calls `getRecord` per hit (`lens-data.ts:187`). |

srs-web follow-ups to file at the docs stage (`Answers: SP-48` once affirmed, else "No affirmed problem yet"):
- "RecordDispatch fallback and Generic inspector read through RecordProse" (comment on #137).
- A comment re-scoping #425 onto `Collection` (D4).
- #426 narrowed, in the PR body (D2).
- "Lenses as the default landing" (D1-C), parked for an owner decision.
- "Field display label vs description in `typeSchema` output". Prototype `fieldLabel` heuristic; confirm whether it is an engine gap before filing.

---

## Port map (prototype → this branch)

**Port, not rewrite.** Workers copy each file from `poc/ux-lenses` (`git -C /home/greenman/dev/semanticops/srs-web-wt-ux-lenses show f96ecc2:<path>`) and apply only the listed changes.

| Prototype file | Fate | Changes on the way in |
|---|---|---|
| `src/lib/lens/lens.ts` | port | **Drop** `curatedLenses`, `problemContext`, `Collection.outline.also` and `Lens.columns` (curated-only). Keep `deriveLenses`, `defaultContext`, `humanise`, `relationLabel`, `ctx`, types. Lens ids as D9. Keep `ponytail:` at `defaultContext` and add "→ gap 3". |
| `src/lib/lens/lens-distinctions.ts` | port | Keep `collectionOptions`, `groupItems`, `splitByBoundary`, `skipHubs`, `HUB_LINKS`, `NOT_SET`. **Drop** `sharedFields` (D6-A). |
| `src/lib/lens/lens-data.ts` | port | Keep every read. `typeColumns`: add `ponytail:` naming D6-C. Every existing `ponytail:` gains its gap number (1, 2, 5, 7, 8). Remove the `lens.columns` branch in `loadCollection` "outline" (columns = `view.columns`). |
| `src/lib/lens/Collection.svelte` | port | Raw `<select>` → `Select`. Checkbox → `Checkbox`. `+`/`−` expand toggles → `IconButton` (Lucide `chevron-right`/`chevron-down`, label "Expand …"/"Collapse …"). Add `data-part`s (`head`, `by`, `set-bar`, `group`, `row`, `toggle`). Header comment says "grouping over loaded items" (D7). |
| `src/lib/lens/Focus.svelte` | port + extract | Move the `read` snippet and its `view()` helper to **`src/rendering/RecordProse.svelte`** (D3). Keep the "long field" `ponytail:` there. Focus keeps mode control, blocks, document and edit. `onEdit` is absent when `readOnly`. The "A note" text stays (gap 4). |
| `src/lib/lens/Context.svelte`, `ContextGroup.svelte` | port | `+` (add to set) → `IconButton` (Lucide `plus`). In/out arrows → Lucide `arrow-left`/`arrow-right` (`aria-hidden`), with text "links here"/"links out" as the accessible name. `Select` for "Tell apart by". `data-part`s. |
| `src/lib/lens/LensSwitcher.svelte` | port | Prop `curated` → `tabs`. Tabs are the navigation-section lenses plus My set; compositions, types and Everything go under "More lenses" (ActionMenu, unchanged grouping). With no navigation sections, the first composition or type lens becomes the only tab. |
| `src/lib/lens/LensShell.svelte` | port, rewired | Props: `EditorShellProps` + `readOnly?`, `onSaveCopy?` (the Generic props for read-only). Toolbar actions from a new `src/lib/lens/toolbar-actions.ts` (`lensActions`): Save, exports, Packages, Wide, Agents, **Go > Explorer**, Open another, all via `shell-actions.ts`. Address via `$lib/address.ts` (D2, D8): push on selection, replace on distinction, `hashchange` listener, trail in `history.state`, `Breadcrumb` for the trail. Replace local `version` with the `documentRevision` prop (App's observed repo already bumps it on every write, agent writes included). Layout control → `Select`. On destroy, remove lens keys from the hash. Board, graph and set code arrive in Phases 6–7. |
| `src/lib/lens/LensPoc.svelte` | **drop** | App is the opener. |
| `src/main.ts` (`/lens` route) | **drop** | No hidden route. |
| `.gitignore` (`public/poc/*.srs`) | **drop** | No POC corpora. |
| `src/styles/components/lens.css` | port | Reads component and semantic tokens only; new component tokens on `:root` in `tokens-components.css` if any colour is needed (ADR-020 b). No `@media` today; if one is added it must be in `BREAKPOINTS` with `/* bp: */`. |
| `src/styles/index.css` | port | One `@import` line, `layer(components)`. |
| `src/Styleguide.svelte`, `src/styleguide/fixtures.ts` | port | `fx.lensCurated` → `fx.lensTabs` (derived-shaped). Add specimens listed per phase. Every Frame carries its own `sg-lens-*` testid, so `styleguide.spec.ts`'s `sg-frame` count (5) is unchanged. |
| `tests/lens-distinctions.test.ts` | port | Drop the `sharedFields` case if present. |
| `tests/styles-tokens.test.ts` | port | Add `src/lib/lens` to `SHELL_FILES`; `src/rendering/RecordProse.svelte` is covered by the rendering scan if one exists, else add it. |
| `plans/ux-lenses.md` | port | Add a status line: "Integrated by #547; §3 curated lenses are reference only." |

**`ponytail:` handling:**
- The eight engine-gap ponytails are kept, each naming its gap number.
- Three are kept as deliberate presentation limits, with no follow-up:
  - Focus "long field" heuristic (moves to RecordProse);
  - `loadContainerBlocks` one level deep (also gap 2);
  - `LensShell` `containersForInstance` per member while "Container" is chosen.
- One unmarked corner cut is **fixed** in the port, because the issue requires it: the hash was replaceState-only and read only at mount.

---

## Phases

PR split: see "Too big for one PR" at the end. Phases 0–5 are **PR A** (`Refs #547`, narrows #426). Phases 6–8 are **PR B** (`Closes #547`). Push branches only; review, then open the PR; the owner merges.

### Phase 0: Decisions, ADRs, role

**Goal:** Owner answers to D1–D9 recorded; ADR-022/023 accepted as drafted or amended; the new role in `agents.md`.

**Agent:** Lead Integrator (writes); Architecture Reviewer (reviews the ADRs).
**Write scope:** `plans/547-lenses-view.md`, `plans/agents.md`, `docs/adr/022-lenses.md`, `docs/adr/023-one-hash-address.md`.

#### Tasks
- [ ] Record the owner's answers inline under each Dn ("Owner: …").
- [ ] Write ADR-022 (and ADR-023 unless folded) from the drafts above. Add "Extended by ADR-022" lines to ADR-002, ADR-009 and ADR-010.
- [ ] Add "Fresh-eyes Reviewer (srs-web)" to `plans/agents.md`.
- [ ] Architecture Reviewer pass over the ADRs (blocking / should-fix / nit).

#### Acceptance Criteria
- [ ] Every Dn has an owner answer or an explicit "default taken".
- [ ] ADRs cite ADR-001 and state the rejected alternatives.

#### Testing
```bash
npm run lint
```

#### Milestone gate
Owner sign-off on D1, D2, D3 at minimum (the rest default). Commit `docs: lenses ADRs and plan decisions (#547)`.

### Phase 1: One hash address

**Goal:** `src/lib/address.ts` is the only hash parser; Essay uses it with unchanged behaviour; lens keys round-trip.

**Agent:** Web App Worker.
**Write scope:** `src/lib/address.ts` (new, moved), `src/lib/essay/address.ts` (deleted), `src/lib/essay/EssayShell.svelte` (import path only), `tests/address.test.ts`.

#### Tasks
- [ ] `git mv src/lib/essay/address.ts src/lib/address.ts`. Widen `Address` with `lens?`, `instanceId?` (`id`), `by?`, `ctxBy?` (`ctxby`). `formatAddress` writes keys in a fixed order and omits empty ones.
- [ ] Update EssayShell's import. No behaviour change.
- [ ] `tests/address.test.ts`: import from `$lib/address.js`.

#### Acceptance Criteria
- [ ] `grep -rn "essay/address" src tests` is empty.
- [ ] Essay deep links (`#e=&p=&z=`) behave as before.

#### Testing (named)
- `tests/address.test.ts`: existing "round-trips" and "tolerates junk"; new "round-trips lens keys" (`#lens=nav:…&id=…&by=type&ctxby=boundary`), "essay and lens keys coexist", "unknown keys are ignored".
```bash
npm run typecheck && npm run lint && npm test
npm run e2e -- essay-editor essay-comments
```

#### Milestone gate
All four commands pass. Mark tasks `[x]`. Commit `refactor(address): one hash address module shared by essay and lenses (#547, #426)`.

### Phase 2: Lens model and data (pure modules)

**Goal:** Derived lenses, data loaders and distinctions ported and tested against the real engine; no UI yet.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/lens.ts`, `src/lib/lens/lens-data.ts`, `src/lib/lens/lens-distinctions.ts`, `tests/lens-distinctions.test.ts`, `tests/lens-model.wasm.test.ts` (new).

#### Tasks
- [ ] Port the three modules per the port map (drop curated, drop `sharedFields`, ponytail gap numbers).
- [ ] `lens-model.wasm.test.ts`: the real engine via the `editor-install.wasm.test.ts` pattern (copy bindings aside, `initSync`). It opens `e2e/fixtures/srs-spec.srs` from bytes (the WASM archive loader) and asserts `deriveLenses` and loaders. It is skipped without bindings, and fails in CI without them, like the existing wasm tests.

#### Acceptance Criteria
- [ ] `grep -rnE "[0-9a-f]{8}-[0-9a-f]{4}-" src/lib/lens` finds no UUID literals.
- [ ] No field name, relation key or namespace literal in `src/lib/lens` decides behaviour. Labels are humanised from engine output only.
- [ ] Every `ponytail:` in `src/lib/lens` names a gap number or a stated presentation limit.

#### Testing (named)
- `tests/lens-distinctions.test.ts` (ported):
  - `groupItems` by nothing, type, field, multiselect, "Not set" last;
  - `splitByBoundary`;
  - `skipHubs` at and above `HUB_LINKS`;
  - `collectionOptions` offers Nesting only for outlines, and State or Created by only when present.
- `tests/lens-model.wasm.test.ts`:
  - "derives one nav lens per depth-0 navigation section of srs-spec (9)";
  - "derives one comp lens per composition (4)";
  - "derives type lenses ordered by record count";
  - "lens ids are prefixed engine ids";
  - "defaultContext hides relation types with no relations";
  - "loadCollection outline returns members in arranged order with depth";
  - "loadGroup depends-on out returns a concept's prerequisites with total";
  - "loadGroup with a type filter keeps only that type".
```bash
npm run typecheck && npm run lint && npm test
```

#### Milestone gate
Pass. Commit `feat(lens): derived lenses, loaders and distinctions (#547)`.

### Phase 3: Panes, RecordProse, specimens

**Goal:** Collection, Focus, Context, ContextGroup, LensSwitcher and RecordProse exist as presentation components with specimens in both themes.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/{Collection,Focus,Context,ContextGroup,LensSwitcher}.svelte`, `src/rendering/RecordProse.svelte` (new), `src/styles/components/lens.css`, `src/styles/index.css`, `src/styles/tokens-components.css` (only if a token is needed), `src/Styleguide.svelte`, `src/styleguide/fixtures.ts`, `docs/adr/020-icon-set-and-component-token-api.md` (part table rows only), `tests/styles-tokens.test.ts`, `tests/Collection.test.ts`, `tests/Focus.test.ts`, `tests/Context.test.ts`, `tests/RecordProse.test.ts` (new).

#### Tasks
- [ ] Port the five components per the port map. Extract `RecordProse` (D3). Swap glyphs for `IconButton` + Lucide. Verify each icon name exists in `node_modules/@lucide/svelte/dist/icons/`.
- [ ] Port `lens.css` and the import. Add `src/lib/lens` to `SHELL_FILES`.
- [ ] Specimens (`#lenses` section):
  - switcher with nav tabs + More;
  - Collection outline under Nesting with Select on and a set of 2;
  - Collection list told apart by a select field;
  - Collection table;
  - Focus Read (RecordProse);
  - Focus Document with the selected block;
  - Focus "As published" (markdown);
  - Focus Edit (SectionForm in place);
  - Context by link type with In and Shown in;
  - Context by Nothing;
  - Context inside/outside;
  - trail Breadcrumb with Back.
- [ ] Add `data-part` rows for Collection, Focus, Context, LensSwitcher and RecordProse to ADR-020 (c).

#### Acceptance Criteria
- [ ] No `<style>` block in `src/lib/lens/*` or `RecordProse.svelte`; the tokens test passes.
- [ ] No glyph-as-icon buttons remain. Every control has an accessible name.
- [ ] Specimens render in default and demo themes with no console errors.

#### Testing (named)
- `tests/RecordProse.test.ts`:
  - "first markdown field is the unlabelled body";
  - "short values render as one chip line";
  - "empty fields and aiGuidance are never shown";
  - "an inline composite renders as a table";
  - "the field equal to displayLabel is not repeated".
- `tests/Collection.test.ts`:
  - "group headings carry counts";
  - "Nothing shows labels only";
  - "shift-click checks a range";
  - "expand toggle is an IconButton with a name".
- `tests/Focus.test.ts`:
  - "Edit absent when onEdit absent";
  - "clicking a block selects it";
  - "As published offered only when published".
- `tests/Context.test.ts`:
  - "empty groups hidden";
  - "inside/outside shows both groups";
  - "add-to-set is an IconButton";
  - "skipped hubs listed with an add each".
```bash
npm run typecheck && npm run lint && npm test
npm run e2e -- styleguide
```

#### Milestone gate
Pass. Commit `feat(lens): Collection, Focus, Context panes and RecordProse with specimens (#547)`.

### Phase 4: LensShell in the real app (trail and reader layouts)

**Goal:** A person opening any repository can go Explore > Lenses, use trail and reader layouts with Read, Document, Edit and As published, follow links with one history, reload after restore, and return with Go > Explorer.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/LensShell.svelte`, `src/lib/lens/toolbar-actions.ts` (new), `src/App.svelte`, `src/lib/generic/GenericSrsShell.svelte` (one nav item and one prop), `tests/lens-toolbar-actions.test.ts` (new), `tests/GenericSrsShell.test.ts` (one case).

#### Tasks
- [ ] Port LensShell per the port map without board, graph or set code; `layouts` is `["trail", "reader"]` in this phase.
- [ ] `lensActions(h, s)` from `shell-actions.ts` helpers, plus `{id: "explorer", group: "go", label: "Explorer"}` as Essay has it.
- [ ] App wiring:
  - `"lenses"` is a reserved `editorMode` beside `"generic"`; the gating `$effect` exempts it;
  - a new `{:else if editorMode === "lenses"}` branch, before `{:else if !activeEditor}`, mounts LensShell with the same props Generic gets plus `onDocumentMutation`, `documentProvider` and `onOpenExplorer`;
  - after any successful load, `parseAddress(location.hash).lens` selects `"lenses"`;
  - `?repo=…&editor=lenses` works through `pendingEditor`.
- [ ] Generic: `onOpenLenses?: () => void` prop and an Explore-group item "Lenses" (`data-testid="open-lenses"`).
- [ ] Address behaviour (D8):
  - picking or following pushes;
  - a distinction replaces;
  - `hashchange` re-applies lens, id and distinctions;
  - the trail is in `history.state`, and trail Back is `history.back()`.
- [ ] Read-only: no Edit, `onSaveCopy` in Document. The read-only notice line reuses Generic's `Notice` pattern.

#### Acceptance Criteria
- [ ] Explore > Lenses opens the first navigation-section lens; Go > Explorer returns to Generic with the document still open.
- [ ] Opening `/?open=<srs>` (read-only) still offers Lenses, and it has no Edit.
- [ ] Edit in place marks the document unsaved ("Unsaved changes" via `documentDirty`); Save works as in Generic.
- [ ] Browser Back after following two links returns through both, and the visible trail agrees.
- [ ] Writing `#lens=…&id=…` to `location.hash` selects that lens and record (the agent path).
- [ ] No regression in Generic, editor mode and open-url behaviour.

#### Testing (named)
- `tests/lens-toolbar-actions.test.ts`:
  - "Explorer is in Go";
  - "Save absent when read-only";
  - "Save a copy present only when read-only";
  - "Wide toggles shell".
- `tests/GenericSrsShell.test.ts`: "Explore group offers Lenses when onOpenLenses is given".
```bash
npm run typecheck && npm run lint && npm test
npm run e2e -- navigation editor-mode open-url shell-layout mobile-layout
```

#### Milestone gate
Pass. Commit `feat(lens): Lenses view in the app — trail and reader, one address (#547)`.

### Phase 5: End-to-end and PR A review

**Goal:** One e2e spec proves the PR A journey against `srs-spec.srs`. A fresh-eyes run and the reviewers pass, and PR A is pushed for review.

**Agent:** Web App Worker (spec); Verification Agent; Fresh-eyes Reviewer; Architecture Reviewer.
**Write scope:** `e2e/lenses.spec.ts` (new), `e2e/helpers.ts` (an `openLenses(page)` helper only).

#### Tasks
- [ ] `e2e/lenses.spec.ts` ("lenses — srs-spec"), opening `e2e/fixtures/srs-spec.srs` through `#srsj-file`:
  1. Explore > Lenses shows `lens-shell` with 9 section tabs.
  2. Pick a Part, then a concept: Focus Read shows its title; Context shows a "Depends on →" group with a count.
  3. Follow a prerequisite: the trail shows two items; browser Back returns to the first concept with the trail emptied.
  4. "Tell apart by" Type groups the Collection and the hash gains `by=type`.
  5. Reader layout, then Document: the selected block is highlighted.
  6. Edit a concept's title in place, then Cancel: nothing is unsaved. Edit, then Save: "Unsaved changes" shows.
  7. Reload, then `restore-session`: Lenses reopens on the same lens and record.
  8. Go > Explorer: `generic-srs-shell` is visible.
  9. No `pageerror` events during the run.
- [ ] Fresh-eyes run (srs-spec, plus muSrs via the local corpus if available):
  - read a Part;
  - find a concept's prerequisites and come back;
  - tell the Part's records apart by type;
  - edit one block and cancel.
- [ ] Architecture review of the diff, then the Lead Integrator reviews it (DRY at the right layer first) and pushes the branch.

#### Acceptance Criteria
- [ ] `npm run e2e -- lenses` green locally, twice in a row (no flake).
- [ ] `npm run e2e -- large-repo` still green (the composition scan on first Context load stays within its timeouts).
- [ ] No blocking findings open.

#### Testing
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- lenses large-repo styleguide
```

#### Milestone gate
Pass. Commit `test(lens): end-to-end journey on the spec fixture (#547)`. Push. Open PR A after review: `Refs #547`, "Narrows #426: …", the D4 comment on #425.

### Phase 6: Board and graph layouts (PR B)

**Goal:** Board (Collection table, Focus and Context in the drawer) and graph (RelationGraph focused on the selection, edges told apart inside vs leaving the set) work on every lens.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/LensShell.svelte`, `src/styles/components/lens.css`, `src/Styleguide.svelte`, `src/styleguide/fixtures.ts`, `tests/lens-graph.test.ts` (new).

#### Tasks
- [ ] Port the board and graph branches and the `graph` derivation from prototype LensShell. Columns per D6-A.
- [ ] The graph legend uses the Context group names: one naming source (`contextDefs` labels) for list and graph. This answers critique round 2 ("Depends On" vs "Required by").
- [ ] Specimens: board with grouped rows; graph with the inside/leaving legend.

#### Acceptance Criteria
- [ ] The board never shows a column no row has a value in. On a type lens, columns come from the type schema; on a nav lens, from `ColumnSpec`.
- [ ] The graph is never blank for a record with links (it falls back to all edges).

#### Testing (named)
- `tests/lens-graph.test.ts`:
  - "edge labels reuse the Context group label for that relation and direction";
  - "under inside/outside, edges are relabelled by set membership".
```bash
npm run typecheck && npm run lint && npm test
npm run e2e -- lenses styleguide
```

#### Milestone gate
Pass. Commit `feat(lens): board and graph layouts (#547)`.

### Phase 7: Draw a set with the hub guard (PR B)

**Goal:** A person selects records, shows them as "My set", adds everything they link to without pulling in hubs, and tells the set's links apart inside vs leaving.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/LensShell.svelte`, `src/lib/lens/Collection.svelte`, `src/lib/lens/Context.svelte`, `e2e/lenses.spec.ts`, `tests/Context.test.ts`.

#### Tasks
- [ ] Port the working set: `localStorage` key `lens-set:<repositoryId>`, every access in try/catch (D9).
- [ ] Port `addAll` (it works from the checked records, else the focused one), `skipHubs`, the skipped list, and the `set` lens.
- [ ] Once shown, the "Show as a set" button reads "Update the set (N)". The set bar stays pinned while Select is on (critique round 2).
- [ ] `lens=set` on a browser with no stored set falls back to the first tab with an info `Notice`.

#### Acceptance Criteria
- [ ] "Add everything" never adds a record with more than `HUB_LINKS` links. Each skipped hub is listed with its own add control.
- [ ] Context "Inside or outside the set" splits by the shown set.

#### Testing (named)
- `e2e/lenses.spec.ts`, new test "draw a set":
  - check two concepts and show the set;
  - Add everything grows it and lists any skipped hubs;
  - "Tell apart by" Type groups it;
  - Context inside/outside shows both groups.
- `tests/Context.test.ts`: "Add everything label names the checked count".
```bash
npm run typecheck && npm run lint && npm test
npm run e2e -- lenses
```

#### Milestone gate
Pass. Commit `feat(lens): draw a set with the hub guard (#547)`.

### Phase 8: Docs, review, follow-ups (PR B close)

**Goal:** Docs current, a fresh-eyes round on all four layouts, follow-ups filed after owner sign-off, PR B pushed for review.

**Agent:** Lead Integrator; Fresh-eyes Reviewer; Verification Agent; Architecture Reviewer.
**Write scope:** `plans/ux-lenses.md`, `plans/547-lenses-view.md`, `src/lib/components/README.md` (a pointer row to `src/lib/lens` and `RecordProse` only), `docs/adr/022-lenses.md` (consequences only).

#### Tasks
- [ ] Fresh-eyes round:
  - board on spec Decisions (a type lens);
  - graph on concepts;
  - draw a set on concepts;
  - read-only `?open=` link to the spec fixture.
- [ ] Fix blocking confusions in scope; record the rest as follow-ups.
- [ ] File the srs-rust gap issues and srs-web follow-ups from Out of scope, each parented to semanticops.com#22. Search for duplicates first (repo rule).
- [ ] Record what was learned in srs-context (the `srs-context` skill) before finishing.

#### Acceptance Criteria
- [ ] Every `ponytail:` in `src/lib/lens` and `RecordProse` points at a filed issue or a stated limit.
- [ ] PR body: `Closes #547`, the "Mode · Cell · Door" line if required, ADR links, follow-up list.

#### Testing
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- lenses large-repo styleguide navigation editor-mode open-url
```

#### Milestone gate
Pass. Commit `docs(lens): design reference, ADR consequences, follow-ups (#547)`. Push. Open PR B after review.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes, including `lens-model.wasm.test.ts` on the real bindings
- [ ] WASM loads and every Lenses call succeeds against `e2e/fixtures/srs-spec.srs` (e2e `lenses`) and `gallery.srsj` (manual: Explore > Lenses opens with no error)
- [ ] `npm run e2e -- lenses large-repo styleguide navigation editor-mode open-url essay-editor` green
- [ ] No UUID, field-name, relation-key or namespace literal in `src/lib/lens` decides behaviour
- [ ] Lenses is reachable from Generic, returns by Go > Explorer, and works read-only without Edit
- [ ] Back, reload-after-restore and an externally written hash all land on the same lens, record and distinctions
- [ ] Every pane has a specimen in both themes
- [ ] No existing shell's behaviour changed (beyond Generic's one nav item)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` and to each phase's write scope; anything outside is reported, not edited.
- No SRS semantics in TypeScript (ADR-001). A missing capability is a `ponytail:` workaround tied to a gap row, never new TS logic. If a phase seems to need a new binding, stop and report.
- No WASM binding changes, so there is nothing to freeze. The Lead Integrator freezes the `Address` keys (Phase 1) and lens id prefixes (Phase 2) before UI phases consume them.
- Port, not rewrite: copy from `poc/ux-lenses` at f96ecc2 and apply only the port-map changes. Any deviation is noted in the phase commit message.
- Architecture Reviewer runs before each push. Verification Agent runs every milestone gate. Fresh-eyes Reviewer runs in Phases 5 and 8.
- Agents push branches only. The Lead Integrator reviews the diff, then opens the PR. The owner merges.
- Do not delete or rebase `poc/ux-lenses`: it is the reference for hand-made lenses.

## Assumptions

- `origin/main` keeps the bindings the prototype uses; the prototype adds no `srs-client.ts` change, so it applies cleanly on d067737.
- `e2e/fixtures/srs-spec.srs` (704 records, 9 navigation sections, 4 compositions, 94 `depends-on`) stays the published spec bundle. The `muSrs.srsj` fixture has only `precedes` relations and no navigation sections, so it cannot exercise Context.
- App's `observeWrites` wrapper makes every Lenses `updateRecord` mark the document dirty with no extra wiring. App's `readOnlyRepo` refuses writes underneath the hidden Edit.
- The URL hash survives App's `?open=` and `?repo=` clearing (`history.replaceState(…, withoutOpenParam(location.href))` keeps the fragment). Phase 4 verifies this.
- Rendering every composition once for "Shown in" (gap 1) is acceptable on the spec (4 compositions). `large-repo` guards this.

## Too big for one PR

The issue scope is about 3,600 prototype lines plus the address move, App wiring, a RecordProse extraction, specimens and tests. Proposed split, same issue and branch lineage:
- **PR A (Phases 0–5):** ADRs, the address module (narrows #426), lens model and data, the three panes with RecordProse, the Lenses view in the app with trail and reader layouts, Read, Document, Edit and As published, "Tell apart by", and the e2e journey. It delivers the core answer to SP-47 and SP-19.
- **PR B (Phases 6–8):** board and graph layouts, drawing a set with the hub guard, a fresh-eyes round, docs and the follow-up filing. `Closes #547`.

If the owner wants one PR, phases run in the same order, and Phase 5's push waits for Phase 8.
