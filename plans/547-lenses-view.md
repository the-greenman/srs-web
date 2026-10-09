# Plan: Lenses view — three panes, Tell apart by, drawn sets, one address (srs-web#547)

> Stage 2 of /ship. Plan only. Worktree `~/dev/.wt/srs-web/547-lenses-view`, branch `feat/547-lenses-view`, off `origin/main` d067737 (0 commits behind at planning time).
> Prototype: branch `poc/ux-lenses` (`/home/greenman/dev/semanticops/srs-web-wt-ux-lenses`, commits 32e87a0..f96ecc2 on d067737). Design: `plans/ux-lenses.md` there (§2, §7, §8), ported into this branch in Phase 0. Reviews: two fresh-eyes rounds (scratchpad `shots/critique.md`, `critique2/critique.md`); round 3 (f96ecc2) answered most round-2 findings.
> Plan review round 1 (Architecture Reviewer 1–15, Plan Reviewer 1–15, comments on #547) is resolved in this revision, with owner ruling D10.
> Plan review round 2 (Architecture Reviewer 1–10, Plan Reviewer 1–12) is resolved in this revision. The owner's D6 follow-up ruling (ask the engine for field ids) is applied: srs#931 filed, ADR-025 gap 6.
> Answers: SP-47, SP-19 (SP-48 is suggested, not affirmed). Story: the-greenman/semanticops.com#22. Owner merges.

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
| D10 | Engine gaps (2026-10-09) | "Remove the client workarounds that compute relation results; file the gaps now; no ADR-001 exception." Context groups come from the selected record's own edges; no type-filtered groups; "Shown in" lists only what `documentViewsForContainer` returns | ADR-025 |
| D6 follow-up (2026-10-09) | Field ids | "Ask the engine for field ids." The request is the-greenman/srs#931 (RFC needed: RFC-039 retired `x-srs-field-id` from the type-schema projection as a spec decision). `by=field:<fieldId>` stays the grammar. Until the binding lands, "Tell apart by" offers no field option, and boards use `ColumnSpec` (which carries `fieldId`) where a container view exists, else label, type and state columns only | ADR-025 (gap 6) |
| — | PR split | Two PRs: A = Phases 0–5 (`Refs #547`), B = Phases 6–8 (`Closes #547`) | — |

**D6 follow-up, why srs and not srs-rust.** RFC-039 (Accepted, Rev 6) states "`x-srs-field-id` is retired … Phase B removes it from the editor-facing projection" (srs-rust 8e488bac). Bringing a field id back into the projection or the facets amends an accepted RFC, so it is a spec change (srs#931, `requires-spec-rfc`); no implementation issue follows until it is accepted. Until then the D6 schema-order columns (D6-A for sets with no container view) are suspended: those boards show label, type and state only.

## Decisions for the owner (as presented)

Each decision below would be painful to reverse once it ships. Each has a recommendation. Phase 0 records the answers before any code is written. Where you have not answered, the recommendation is the default.

### D1. Entry point: how a person reaches Lenses in the real app

Today App renders `GenericSrsShell` when `editorMode === "generic"`, and otherwise the `EDITORS` entry `usableEditor()` returns. Registry availability is keyed on `entryTypeId` (ADR-002, `registry.ts` header: "Availability is keyed on UUID identity"). `offeredEditors` is `[]` while the document is read-only (`App.svelte:148`, ADR-021). So a registry editor disappears for `?open=` links.

| Option | Trade-offs |
|---|---|
| **A. A built-in engine view beside Generic.** `editorMode` gains a second reserved value, `"lenses"`, exempt from the `usableEditor` gate like `"generic"`. Generic's nav "Explore" group gets a "Lenses" item. Lenses has Go > Explorer back (the Essay pattern). | The registry keeps one meaning: package editors keyed on an entry type. Lenses works on every repository, read-only links included, because it reads engine structures only. App gains one branch. LensShell reuses `EditorShellProps`, so it is still type-checked against the same contract. |
| B. An `EDITORS` entry with an optional `entryTypeId`, "always available". | One list of shells, but it breaks the registry's stated invariant (availability keyed on a type UUID). It also needs a special case to survive read-only, where `offeredEditors` is empty. The picker's "Package editors" group would list an engine view as a package editor. |
| C. Lenses is the default landing (replaces Generic as first view). | Answers SP-48 fully, but the issue scopes it out ("No current shell is replaced"). It needs its own owner decision after use. |

ADRs: ADR-002 (superseded by ADR-022, which records the registry and adds built-in views), ADR-014 (precedent: static nav items for engine-level tools, not content), ADR-021 (read-only is a document state, not a shell mode), ADR-001.
**Recommendation: A.** The registry stays honest, and read-only links get Lenses too. C becomes a later one-line change (the initial `editorMode`) once the owner has used it.

### D2. Address: the prototype's own hash vs one shared address module (#426)

The prototype writes `#repo=&lens=&id=&by=&ctxby=` with `history.replaceState` and reads it only at mount. So browser Back does not walk selections, and `repo=` exists only for the POC corpora. The essay has `src/lib/essay/address.ts` (`#e=&p=&z=`, `pushState`). #426 asks for `src/lib/address.ts` holding `{containerId, instanceId, …}`, used by every shell.

| Option | Trade-offs |
|---|---|
| **A. Generalise now.** Move `essay/address.ts` to `src/lib/address.ts`: one `Address` type with essay keys (`e`, `p`, `z`), the shell-neutral selected-instance key `id`, and lens keys (`lens`, `by`, `ctxby`); one `parseAddress`/`formatAddress` plus `pushAddress`/`replaceAddress`/`readTrail`. Essay imports it unchanged in behaviour. Lenses pushes on selection and replaces on a distinction change; App owns the one `popstate` listener that chooses the shell. This PR **narrows #426**: the module, the Lenses address and Essay on it land here; the Generic, Governance and Guides fixes stay in #426. | One address scheme from day one, no second parser. It touches Essay imports, which is a small, test-covered change (`tests/address.test.ts`). It does not fix Generic's middle/right divergence; that remains #426's job. |
| B. Lenses keeps its own hash parser in `src/lib/lens/`; #426 unifies later. | Smallest diff now, but two address parsers is the drift the owner rule forbids, and agents learn two schemes. |
| C. Close #426 here by also moving Generic, Governance and Guides onto the address. | Closes the issue, but adds four shells' selection rewiring to an already large PR, and the issue says no current shell is replaced. |

ADRs: none govern the hash today (ADR-021 governs `?open=`/`?repo=` query params and must keep the hash intact). Recorded as [ADR-023](../docs/adr/023-one-hash-address.md).
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
**Ruled: four ADRs, one rule each** (D5 in the rulings table): ADR-022 built-in views and the editor registry, ADR-023 one hash address and one history, ADR-024 one record reading component, ADR-025 Lenses. The address is separate because #426 and Essay depend on it, not on Lenses.

### D6. Board columns for sets that have no container view (ADR-010)

ADR-010: list columns come from `resolveContainerView(...).columns` (`ColumnSpec`); "keep hardcoded fields as a fallback" was rejected. The prototype follows this for outline lenses. For type, composition, find and drawn sets it picks columns in TS. `typeColumns` uses the type schema's first four non-markdown, non-text fields. `sharedFields` uses the fields every record carries, under "Nothing".

| Option | Trade-offs |
|---|---|
| **A. `ColumnSpec` where a container view exists; elsewhere the type schema's first four short fields in schema order (author-declared order), recorded as an ADR-010 extension in ADR-025.** Drop `sharedFields`: "Nothing" means label only, which design §7 calls a valid first-class choice. | Every set gets a usable board. The choice is schema-driven, never name-based, so it keeps ADR-010's reason (no name-based semantics) even though the client picks the count. |
| B. Strict ADR-010: title, type and state columns only, unless a container view exists. | Purest, but the review found boards of only TYPE and STATUS useless (critique round 1, "The case" board). |
| C. A new engine binding: default columns for a type. | Right long-term home. Not needed to ship; can follow if two clients need it. |

**Recommendation: A**, with `ponytail:` on `typeColumns` naming C as the upgrade.

### D7. "Tell apart by" as client-side grouping (capability layering)

`groupItems` groups already-loaded items by type, lifecycle, `createdBy`, container or a closed field value. `splitByBoundary` splits edges by membership of the loaded set. `skipHubs` applies a 50-link threshold. The capability-layering test is "if two clients could ever disagree, the logic is in the wrong place".

| Option | Trade-offs |
|---|---|
| **A. Presentation, recorded as such in ADR-025.** It groups only what the engine returned, never filters or derives membership. On a paged set it says it groups the loaded page ("100 of N"). | Ships now, and is the same class as ADR-018's presentation-layer filter. If agents need "tell apart by" over MCP, the engine needs a group-by. Field options wait for engine field ids (D6 follow-up, srs#931). |
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
**Recommendation: adopt this scheme in ADR-025 and do not change prefixes later.** An unknown or unresolvable `lens=` falls back to the first lens without error.

### D10. Engine gaps: client workarounds or filed issues (ruled 2026-10-09)

Plan review round 1 (Plan Reviewer, blocking 1) found three prototype workarounds that compute relation results in TypeScript: a repository-wide relation-usage count (`defaultContext`), type-filtered Context groups that read up to 10 000 edges and filter them, and rendering every composition to learn its container (`compositionsByContainer`).
**Ruled:** remove them, file the gaps now, no ADR-001 exception.
- Context groups come from the selected record's own edges: one `neighbours` call with no limit, grouped by relation type and direction.
- No type-filtered Context groups.
- "Shown in" lists only the compositions `documentViewsForContainer` (`compositions_for_container`) returns. Compositions with a fixed container section are missing from "Shown in" until srs-rust#1378 lands. On `srs-spec.srs` that binding returns no composition for any of its 20 containers, so "Shown in" is empty there until then.

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

No WASM changes. No relation semantics in TypeScript (D10): the engine gaps are filed (ADR-025 gaps 1–6), and the client never computes a relation result.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | /ship orchestrating session (thin orchestrator: no unit work) |
| Web App Worker | Sonnet agent per phase, on this worktree only |
| Architecture Reviewer (srs-web) | Sonnet agent, read-only, after Phase 0 (ADR drafts) and before each push |
| Verification Agent (srs-web) | Sonnet/Haiku agent, read-only, at every milestone gate |
| Fresh-eyes Reviewer (srs-web) | Sonnet agent that has not seen the design, read-only, Phases 5 and 8 |

See [agents.md](agents.md) for role definitions (the Fresh-eyes Reviewer role was added there in 8a8580f).

## Architecture Decisions

Every srs-web ADR (001–021) was read. Below: how each one bears on this plan.

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Hard constraint. Every read goes through existing `srs-client.ts` bindings; every write is `updateRecord` via `SectionForm`. No TypeScript relation semantics remain (D10): Context groups the engine's `neighbours` result, "Shown in" is `documentViewsForContainer`, and the gaps are filed issues (ADR-025 gaps 1–6). `srs-client.ts` is unchanged. | accepted, governs |
| [ADR-002](../docs/adr/002-editor-mode-selection.md) | Explicit mode selection, already replaced by the #338 editor registry. ADR-022 records the registry and adds built-in views (D1). | superseded by ADR-022 |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | "As published" renders a Composition (document view); Edit uses the type schema, never the view. | accepted, respected |
| ADR-004 / ADR-005 | Superseded; no bearing. | superseded |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) / [ADR-007 type registry](../docs/adr/007-unified-type-registry.md) | Lenses add no TYPE_REGISTRY entries. RecordProse is the fallback reader; a registered view can take over via RecordDispatch later (D3, ADR-024). | accepted, respected |
| [ADR-007 CSS themes](../docs/adr/007-frontend-css-themes.md) | Preview CSS only; Focus "As published" renders markdown through `MarkdownView`, not the preview iframe. No bearing. | accepted |
| [ADR-008](../docs/adr/008-rfc009-uuid-chain-join.md) | Composition ↔ container joins come from engine bindings (`documentViewsForContainer`), never string matching. The prototype's `namespace/name` type filter on Context groups is dropped (D10). | accepted, respected |
| [ADR-009](../docs/adr/009-container-driven-nav.md) | Navigation-section lenses come from `repositoryNavigation`. Containers from data, never TS constants. | accepted, extended by ADR-025 |
| [ADR-010](../docs/adr/010-view-driven-list-columns.md) | Board columns: `ColumnSpec` (with its `fieldId`) where a container view exists; elsewhere label, type and state only until field ids are exposed (D6 follow-up, ADR-025 gap 6). The Collection table is the ADR-010 list pane for Lenses. | accepted, extended by ADR-025 |
| ADR-011 / ADR-015 / ADR-016 / ADR-017 | OAuth worker, binary storage, exploded trees, refresh tokens: no bearing (Lenses never touches storage; Save stays App's). | accepted |
| [ADR-012](../docs/adr/012-governance-status-via-lifecycle-binding.md) | Lifecycle is shown read-only as `Tag`. Lenses offers no transitions, and Edit never writes status as a field. | accepted, respected |
| [ADR-013](../docs/adr/013-repo-context.md) | RecordProse takes props, not the repo context, so it renders outside GovernanceShell (D3). | accepted, respected |
| [ADR-014](../docs/adr/014-repository-tool-sections.md) | Precedent for a static nav item for an engine-level surface: the "Lenses" item in Generic's Explore group. | accepted, precedent |
| [ADR-018](../docs/adr/018-picker-srs-discovery.md) | Precedent for presentation-layer grouping/filtering over engine output (D7). | accepted, precedent |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | Specimens for every pane on `/styleguide`, rendered in default and demo themes. `lens.css` in the `components` layer; no scoped `<style>`. | accepted, governs |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | Glyph buttons become `IconButton` + Lucide. Component tokens on `:root`. `data-part` rows for the lens components. See "Reused components". | accepted, governs |
| [ADR-021](../docs/adr/021-open-from-url.md) | Lenses is available on read-only documents; Edit is hidden and the read-only repo refuses writes underneath. Query-param clearing must keep the hash. | accepted, respected |
| [ADR-022](../docs/adr/022-built-in-views-and-editor-registry.md) (new) | Built-in engine views sit outside the editor registry, listed in `BUILT_IN_VIEWS` (D1); supersedes ADR-002 | proposed |
| [ADR-023](../docs/adr/023-one-hash-address.md) (new) | One hash address and one history for every shell; `id` is the shell-neutral selection key (D2, D8) | proposed |
| [ADR-024](../docs/adr/024-one-record-reading-component.md) (new) | One component for reading a record as prose; one shared label module (D3) | proposed |
| [ADR-025](../docs/adr/025-lenses.md) (new) | Lenses: one engine view of three panes over derived lenses; canonical engine-gap list (D4, D6, D7, D9, D10) | proposed |

---

## Contracts

### WASM API surface

**No new or changed WASM methods.** Every call exists on `origin/main`'s `src/lib/srs-client.ts`: `repositoryNavigation`, `getContainerOutline`, `resolveContainerView`, `getContainer`, `containersForInstance`, `listContainers`, `listDocumentViews`, `documentViewsForContainer`, `renderDocumentView`, `find`, `listTypes`, `getRecord`, `typeSchema`, `neighbours`, `listRelationTypes`, `updateRecord`. `listRelations` (D10) and `listRecords` (the type lens loads through `find`) are no longer used by Lenses.

**No `srs-client.ts` change.** The engine's `find` already returns `facets.fields`, but keyed by `Field.name` with no field id, so Lenses does not use it until ADR-025 gap 6 (srs#931) lands; the typed pass-through returns with that binding.

`src/lib/read-only.ts` needs no change: Lenses adds no binding, and its only write is `update_record`, already classified.

### Bindings and fixture facts (checked 2026-10-09 on build.502)

- Bindings: `scripts/ensure-bindings.mjs` pins `v0.1.0-build.502`. At that tag `CURRENT_DATA_MODEL_REVISION = 9` (`srs-repository/src/field_type_migration_service.rs`), so revision 9 is supported.
- Archive loader: `loadRepoFromArchive(bytes)` in `src/lib/srs-client.ts` wraps the static `SrsRepository.load_archive`; `loadRepo(srsj)` wraps `SrsRepository.load`. The wasm tests initialise a private copy of the bindings (`initSync`, the `tests/editor-install.wasm.test.ts` pattern) and call those statics directly: `mod.SrsRepository.load_archive(readFileSync("e2e/fixtures/srs-spec.srs"))` and `mod.SrsRepository.load(readFileSync("e2e/fixtures/gallery.srsj", "utf8"))`.

**`e2e/fixtures/srs-spec.srs`** (`dataModelRevision` 9):

| Fact | Value |
|---|---|
| Identity entry (not a navigation section, so not a lens) | `9288ed3d-dba7-4a3a-9fbb-a77ff919816c` |
| Depth-0 navigation sections with a `sectionContainerId` | 9. Lens ids `nav:` + `2ea344e1-f64e-4817-99f7-fe1b1e4046ce` Reading this specification, `752dad23-8a6d-44e5-98c9-f081d2cc634e` Foundations, `2da5d723-f09f-4acf-9b86-a99745193ee5` Instances, `96965ce5-ad64-45b1-8d74-eccc6773db5e` Structure, `97838af7-50f8-4da2-9d8f-d7dbf9296c80` Distribution, `fdb7d202-f9a5-4c8f-a2a8-d6c79add89ce` Presentation, `a7b772f2-0093-4ccc-8050-0f7831421eaf` Extensions, `1dc2ab2d-7873-4179-8a40-d591e9c90bb0` Conformance, `618920ec-c417-4f91-acce-c5ea79b743f2` Governance |
| Compositions (`listDocumentViews`, in order) | 6: `3a000001-0000-4000-a000-000000000001` spec-document-view, `3a000003-0000-4000-a000-000000000003` rationale-document-view, `3a000004-0000-4000-a000-000000000004` unified-document-view, `3a000005-0000-4000-a000-000000000005` spec-glossary, `7a000001-0000-4000-a000-000000000001` rfc-document-view, `7a000002-0000-4000-a000-000000000002` rfc-decision-log |
| Concept type / decision type | `2a000004-0000-4000-a000-000000000004` / `6a000004-0000-4000-a000-000000000004` (54 decisions) |
| Journey concept | `006a853f-7e58-4842-85e4-ad75d4b0fe5d` "Package", in Part: Distribution (container `97838af7-…`); `depends-on` out to `873099c5-093d-4684-8c36-46f813847c1a` "Field" (in Part: Foundations) and `9bccaa53-6d98-4ca9-967b-fb27ec6e72d5` "Type" |
| Hub record (most edges) | `580cfe0e-b23e-4215-a3c4-22cbd0526810` "Extensions" (concept), 41 edges: more than `NEIGHBOUR_PAGE` (20), fewer than `HUB_LINKS` (50). No record in the fixture exceeds `HUB_LINKS`, so the hub guard is unit-tested, not e2e-tested |
| `find` `facets.fields` | not used until gap 6 (keyed by `Field.name`, no field id) |
| Relations | 941 files; 94 `depends-on` |
| "Shown in" | `compositions_for_container` returns nothing for any of its 20 containers, so "Shown in" is empty here (D10) |

**`e2e/fixtures/gallery.srsj`** (`dataModelRevision` 8; the app migrates it in memory on open, the wasm test loads it as is):

| Fact | Value |
|---|---|
| "Shown in" positive case | record `ad159754-2edd-4bf8-a70f-a29a617e5809` "What this is" is in containers `4e4c9501-2709-4220-bb47-486f6f78a937` (Limoma) and `f7562aa3-98c7-44be-b4c5-5474df6441f2` (Articles); `documentViewsForContainer(Articles)` returns composition `78b11038-e5d8-4269-9982-fe5c459802b2` (articles-and-roles) |

### TypeScript contracts

The Lead Integrator freezes these before the phase that consumes them (Coordination Rules). Prototype names change where shown.

**Imported types** (existing, unchanged): `SrsRepository`, `SrsRecord`, `Actor`, `TypeSummary`, `DocumentView`, `RelationTypeInfo`, `UpdateRecordInput` from `src/lib/srs-client.ts`; `ToolbarAction` from `src/lib/components/menu-action.ts`; `ShellState` from `src/lib/shell-context.svelte.ts`; `FieldFormDef` from `src/lib/governance/types.ts`; `CompositeFormDef` from `src/lib/editor/blueprint-fields.ts`; `BreadcrumbItem` from `src/lib/types.ts`.

**Fields are named by field id, and none is offered yet.** The address grammar is `by=field:<fieldId>`. No binding returns a field id for a type-schema property or a `find` field facet (RFC-039 retired `x-srs-field-id`), so until ADR-025 gap 6 (srs#931) lands Lenses builds no field option, groups by no field, and selects no board column by field. No field name is used to select anything.

**`src/lib/address.ts`** (moved from `src/lib/essay/address.ts`, Phase 1). It validates all three Lenses keys in one place:

```ts
/** Lens ids (ADR-025). `pkg:` is reserved. */
export type LensId = `nav:${string}` | `comp:${string}` | `type:${string}` | `pkg:${string}` | "find" | "set";
/** Collection "Tell apart by". */
export type CollectionBy =
  | "none" | "type" | "nesting" | "container" | "state" | "created-by" | `field:${string}`;
/** Context "Tell apart by". */
export type ContextBy = "link-type" | "none" | "boundary";

export const LENS_ID = /^(?:(?:nav|comp|type|pkg):[^\s&#=]+|find|set)$/;
export const COLLECTION_BY = /^(?:none|type|nesting|container|state|created-by|field:[^\s&#=]+)$/;
export const CONTEXT_BY = /^(?:link-type|none|boundary)$/;

export interface Address {
  essayId?: string;     // e
  paragraphId?: string; // p
  zoomId?: string;      // z
  lens?: LensId;        // lens   (dropped unless LENS_ID matches)
  instanceId?: string;  // id     (shell-neutral selected instance, ADR-023)
  by?: CollectionBy;    // by     (dropped unless COLLECTION_BY matches)
  ctxBy?: ContextBy;    // ctxby  (dropped unless CONTEXT_BY matches)
}

/** Tolerates junk, ignores unknown keys, accepts ":" raw or as %3A, drops invalid lens/by/ctxby values. */
export function parseAddress(hash: string): Address;
/** "" or "#…"; keys in the order e, p, z, lens, id, by, ctxby; empty values omitted; URLSearchParams encoding (":" → %3A). */
export function formatAddress(a: Address): string;

export interface TrailEntry { id: string; label: string }
/** history.pushState({ trail } | null, "", formatAddress(a) || pathname + search); no-op when hash and trail are unchanged. Fires no event. */
export function pushAddress(a: Address, trail?: TrailEntry[]): void;
/** history.replaceState with the same arguments. Fires no event. */
export function replaceAddress(a: Address, trail?: TrailEntry[]): void;
/** The trail in `state` (default history.state), or [] when absent or malformed. */
export function readTrail(state?: unknown): TrailEntry[];
```

**Events: one listener, owned by App** (ADR-023). `pushState`/`replaceState` fire nothing. Back, Forward, a pasted link and a script writing `location.hash` all fire `popstate` (a fragment navigation fires `popstate` before `hashchange`), so App listens to `popstate` only:

```ts
// src/App.svelte
let address = $state<Address>(parseAddress(location.hash));
let addressState = $state<unknown>(history.state); // carries the trail
function onPopState() {
  address = parseAddress(location.hash);
  addressState = history.state;
  if (appState !== "loaded") return;
  if (address.lens) editorMode = "lenses";
  else if (editorMode === "lenses") editorMode = "generic";
}
// <svelte:window onpopstate={onPopState} />; the same lens check runs once after every successful load.
```

LensShell takes `address: Address` and `addressState: unknown` as props and re-applies them in one `$effect` (lens, `instanceId`, `by`, `ctxBy`, and `readTrail(addressState)`). It never adds a window listener. Its own pushes do not change the props, so there is no loop. If the e2e test "an externally written hash selects lens and record" shows a browser that does not fire `popstate` on a `location.hash` write, App adds `hashchange` to the **same** `onPopState` handler; no other listener is added. EssayShell keeps its existing `onpopstate={applyAddress}` until #426 moves it onto App's prop (stated in ADR-023).

**Trail navigation: one rule.** Every trail move is `history.go(-n)`, where `n` is the number of entries between the current one and the target. Back is `n = 1`. A Breadcrumb item `i` (0 = oldest) calls `history.go(-(trail.length - i))`.

**`src/lib/lens/lens-distinctions.ts`** (Phase 2; imports the grammar types from `address.ts`):

```ts
export interface ByOption { value: CollectionBy; label: string }
export const NOT_SET = "Not set";
export const HUB_LINKS = 50;

/** No field options: ponytail: ADR-025 gap 6 (srs#931); field options come back with field ids. */
export function collectionOptions(items: Item[], outline: boolean): ByOption[];
/** Groups loaded items; created-by groups by actor id. A `field:<fieldId>` value is treated as the kind default until gap 6 (no field grouping). */
export function groupItems(
  items: Item[],
  by: CollectionBy,
  opts?: { containersOf?: (id: string) => string[] }
): Item[];
/** The one edge-to-set classifier (ADR-025): edges whose other end is in the set vs leaving it. */
export function splitByBoundary<E extends { id: string }>(
  edges: E[],
  inSet: ReadonlySet<string>
): { inside: E[]; outside: E[] };
export function skipHubs<T extends { id: string }>(
  items: T[],
  links: (id: string) => number,
  max?: number // HUB_LINKS
): { add: T[]; skipped: T[] };
```

**`src/lib/lens/lens.ts`** (Phase 2):

```ts
export type Layout = "trail" | "reader" | "board" | "graph";
export type Collection =
  | { kind: "outline"; containerId: string }
  | { kind: "composition"; compositionId: string }
  | { kind: "type"; typeId: string }
  | { kind: "ids"; ids: string[] }
  | { kind: "find" };
export type Focus = { kind: "read" } | { kind: "document" | "published"; compositionId?: string };
export interface Lens { id: LensId; label: string; collection: Collection; focus: Focus }
export interface ContextGroupDef { relationType: string; direction: "in" | "out"; label: string }

/** nav lenses (depth-0 sections with a sectionContainerId; the identity entry is not a section), comp lenses (listDocumentViews order), type lenses (facets.byType by count), find; plus `set` when `set` is non-empty. */
export function deriveLenses(repo: SrsRepository, set?: string[]): Lens[];
/**
 * One group per (relationType, direction) present in `edges`: installed types in listRelationTypes order,
 * out before in, labelled from RelationTypeInfo.label (humanise(key) when empty); a key listRelationTypes
 * does not return sorts last, labelled humanise(key).
 */
export function defaultContext(edges: ContextItem[], types: RelationTypeInfo[]): ContextGroupDef[];
/** Kind-derived defaults only (outline → "nesting", else "type"). */
export function defaultBy(c: Collection): CollectionBy;
```

Dropped from the prototype: `curatedLenses`, `problemContext`, `ctx`, `relationLabel`, `humanise` (moves to `src/lib/labels.ts`), `Collection` kind `navigation` and `outline.also`, `Lens.columns`/`by`/`ctxBy`/`layout`/`context`, `ContextGroupDef.types`, `By`, `CtxBy`.

**`src/lib/lens/lens-data.ts`** (Phase 2):

```ts
export const PAGE = 100;
export const NEIGHBOUR_PAGE = 20;
export interface Item { id: string; label: string; typeName?: string; typeId?: string; lifecycle?: string;
  createdBy?: Actor; depth: number; sectionContainerId?: string; group?: string; record?: SrsRecord }
/** A board column: a ColumnSpec column (carries fieldId), or one of the fixed label/type/state columns. */
export type Column = { kind: "field"; fieldId: string; label: string } | { kind: "label" | "type" | "state" };
export interface CollectionData { items: Item[]; columns: Column[]; total: number }
export interface ContextItem { id: string; label: string; typeName?: string; direction: "in" | "out"; relationType: string }
export interface ContextGroupData { def: ContextGroupDef; total: number; items: ContextItem[] }
export interface Shown { compositionId: string; containerId: string; label: string }
export interface ReadData { id: string; label: string; record?: SrsRecord; fields: FieldFormDef[]; composites: CompositeFormDef[] }
export type FocusData =
  | { kind: "read"; block: ReadData }
  | { kind: "blocks"; title: string; head?: ReadData; blocks: ReadData[] }
  | { kind: "document"; markdown: string; containerId: string }
  | { kind: "none" };

/**
 * Where each Item's `record` comes from: outline → resolveContainerView members' `record`;
 * type → find({ typeId }, { limit: offset + PAGE }) then getRecord per hit (gap 4);
 * find → find({}, { limit: offset + PAGE }) then getRecord per hit (gap 4);
 * composition → the JSON render projection's ids then getRecord (gap 1); ids → getRecord.
 */
/** columns: resolveContainerView(...).columns for outline lenses; [label, type, state] for every other kind (gap 6). */
export function loadCollection(repo: SrsRepository, lens: Lens, offset?: number): CollectionData;
/** Every edge of the record: one neighbours(repo, id) call with no limit. */
export function loadEdges(repo: SrsRepository, id: string): ContextItem[];
/** Buckets `edges` by the defs (same relationType and direction); `total` = bucket size. No engine call. */
export function groupEdges(edges: ContextItem[], defs: ContextGroupDef[]): ContextGroupData[];
/** Edges for the graph: `edges` relabelled with the matching def's label. */
export function graphEdges(edges: ContextItem[], defs: ContextGroupDef[]): (ContextItem & { label: string })[];
/** documentViewsForContainer over the given containers; nothing else (D10). */
export function shownIn(repo: SrsRepository, containerIds: string[]): Shown[];
/** A record, or undefined for a Tier 0 note (gap 3). */
export function tryRecord(repo: SrsRepository, id: string): SrsRecord | undefined;
export function loadRead(repo: SrsRepository, id: string, label?: string, record?: SrsRecord): ReadData;
/** The container's anchor as `head`, then its body entries in arranged order, one level (gap 2). */
export function loadContainerBlocks(repo: SrsRepository, containerId: string): { head?: ReadData; blocks: ReadData[] };
/** Renders `compositionId`, else the first shownIn composition of the record's containers, as markdown; else a read block. */
export function loadDocument(repo: SrsRepository, id: string, compositionId?: string, hint?: string): FocusData;
export function containersOf(repo: SrsRepository, id: string, hint?: string): string[];
```

Removed from the prototype: `compositionsByContainer`, `allEdges` (its 500 cap was its own), `loadGroup` (a group's "Show more" pages the edges already loaded, `NEIGHBOUR_PAGE` at a time), `listRecords` for the type lens (now `find({ typeId })`), `graphEdges`' own neighbours call, and `selectFields`/`typeColumns`/`sharedFields` (no name-keyed field selection; gap 6).

**Pane props** (Phase 3; `src/lib/lens/*.svelte`, `src/rendering/RecordProse.svelte`):

```ts
// RecordProse.svelte
{ record: SrsRecord; fields: FieldFormDef[]; composites: CompositeFormDef[]; heading?: "h2" | "h3" }
// Collection.svelte
{ data: CollectionData; mode?: "list" | "table"; selectedId?: string | null; expanded?: Set<string>;
  onDark?: boolean; note?: string; by?: CollectionBy; byOptions?: ByOption[]; onBy?: (by: CollectionBy) => void;
  picking?: boolean; checked?: Set<string>; setSize?: number; onPicking?: () => void;
  onCheck?: (ids: string[], on: boolean) => void; onShowSet?: () => void; onClearSet?: () => void;
  onSelect: (item: Item) => void; onExpand?: (item: Item) => void; onMore?: () => void }
// Focus.svelte
{ data: FocusData; mode?: "read" | "document" | "published"; editing?: boolean; selectedId?: string | null;
  onMode?: (mode: "read" | "document" | "published") => void; published?: boolean;
  onEdit?: () => void; /* absent = read-only */ onSelect?: (id: string) => void;
  onSave?: (input: UpdateRecordInput) => void; saving?: boolean; saveError?: string | null }
// Context.svelte
{ groups: ContextGroupData[]; containers?: { containerId: string; title: string }[]; shown?: Shown[];
  by?: ContextBy; onBy?: (by: ContextBy) => void; onPick: (item: ContextItem) => void;
  onShow?: (s: Shown) => void; onAdd?: (item: ContextItem) => void; onAddAll?: () => void;
  checkedCount?: number; skipped?: { id: string; label: string }[]; onAddSkipped?: (m: { id: string; label: string }) => void }
// ContextGroup.svelte ("Show more" reveals the next NEIGHBOUR_PAGE of `items`; no callback)
{ label: string; total: number; items: ContextItem[]; onPick: (item: ContextItem) => void;
  onAdd?: (item: ContextItem) => void; open?: boolean }
// LensSwitcher.svelte
{ tabs: Lens[]; more: Lens[]; active: LensId; onPick: (id: LensId) => void }
// LensShell.svelte
EditorShellProps & { readOnly?: boolean; onSaveCopy?: () => void; address: Address; addressState: unknown }
```

**`src/lib/labels.ts`** (Phase 2; `git mv src/lib/generic/labels.ts`, adds two functions):

```ts
export function plainLabel(label: string | undefined | null, fallback?: string): string; // unchanged
export function wrapLabel(label: string, width?: number, lines?: number): string[];       // unchanged
/** "section.text" / "source_kind" / "depends-on" → "Section text" / "Source kind" / "Depends on". Replaces document-model.ts typeNameLabel. */
export function humanise(name: string): string;
/** `title || humanise(name)`. No other rule (round 2: no "title repeats description" heuristic over engine output). */
export function fieldLabel(f: { name: string; title?: string }): string;
```

Importers: `src/lib/editor/document-model.ts`, `src/lib/editor/BlueprintDocumentEditor.svelte`, `src/lib/guides/blueprint-utils.ts`, `src/lib/generic/{GenericSrsShell,RecordsView,RelationGraph,RelationMap}.svelte`, `src/lib/lens/*`, `src/rendering/RecordProse.svelte`. `typeNameLabel` is deleted, not aliased.

`src/lib/editor/blueprint-fields.ts` switches its two `label: prop.title || name` sites to `fieldLabel({ name, title: prop.title })` in **its own commit** (`refactor(forms): field labels humanise a bare name (#547)`), named in PR A's body. The only change: a field with no title shows `humanise(name)` instead of the raw name. `tests/blueprint-fields.test.ts` gains "a titled field keeps its title" and "an untitled field shows its humanised name".

**`src/lib/lens/working-set.ts`** (Phase 7):

```ts
export const setKey = (repositoryId: string) => `srs-web.lens-set.${repositoryId}`;
/** The stored ids, or [] when storage is absent, throws or holds junk. */
export function readSet(repositoryId: string, storage?: Storage): string[];
/** Never throws; a failed write is ignored (per-viewer convenience only). */
export function writeSet(repositoryId: string, ids: string[], storage?: Storage): void;
```

`storage` defaults to `localStorage`, read inside the `try` so a throwing accessor is caught.

**`src/lib/editors/registry.ts`** (Phase 4):

```ts
export const BUILT_IN_VIEWS = ["generic", "lenses"] as const;
export type BuiltInView = (typeof BUILT_IN_VIEWS)[number];
export const isBuiltInView = (mode: string): mode is BuiltInView =>
  (BUILT_IN_VIEWS as readonly string[]).includes(mode);
```

App's gating `$effect` becomes `if (!activeEditor && !isBuiltInView(editorMode)) editorMode = "generic";`. LensShell annotates `$props()` with `EditorShellProps & { readOnly?; onSaveCopy?; address; addressState }`, so `svelte-check` enforces the editor contract on it. `GenericSrsShell` keeps its own `Props` interface, unchanged in #547.

**`src/lib/lens/toolbar-actions.ts`** (Phase 4; helpers from `src/lib/components/shell-actions.ts`):

```ts
export interface LensHandlers {
  onsave?: () => void;        // absent while read-only
  onexport: () => void;
  onexportsrsj?: () => void;
  onsavecopy?: () => void;    // present only while read-only
  onopenanother: () => void;
  onopenagents?: () => void;
  onopenpackages?: () => void; // absent while read-only
  onopenexplorer: () => void;
}
export function lensActions(
  h: LensHandlers,
  s: { shell: ShellState; saving: boolean; dirty: boolean }
): ToolbarAction[];
```

It composes `saveAction`, `exportActions`, `packagesAction`, `agentsAction`, `openAnotherAction` and `wideAction` from `shell-actions.ts`, plus `{ id: "explorer", group: "go", kind: "action", label: "Explorer" }` as Essay's `header-actions.ts` has it.

### Field-label engine check (follow-up 5, run 2026-10-09; filed as srs-rust#1382)

srs-rust `origin/master` (8a977a99), `crates/srs-repository/src/type_schema_service.rs`: a property's `title` is the FieldAssignment `displayLabel`, **else the Field's `description`** ("title: displayLabel wins, else the field's description"); the description is also written to `x-srs-description`, and `aiGuidance.purpose` becomes `description`. The engine test asserts `properties.b.title == "b description"`. So a client cannot tell a real label from a copied description. This is an engine gap, filed as srs-rust#1382. `fieldLabel` does not work around it.

---

## Reused components

Checked against `src/lib/components/` and `src/lib/essay/` (the essay directory holds no components besides `EssayShell`). Phase 3 acceptance checks this table both ways: each reused component is imported by the file named in the check below, and no not-reused component is imported.

| Component | Collection | Focus | Context | Shell | Decision |
|---|---|---|---|---|---|
| `Block` / `BlockStack` | — | — | — | — | **Not reused.** They are the essay's editable paragraph and drag-to-reorder list; reordering writes arrangement. Lenses Document blocks are read blocks (`RecordProse`) with Edit in place (`SectionForm`), and Lenses never reorders. |
| `Lifecycle` | — | — | — | — | **Not reused.** It offers transitions; Lenses offers none (ADR-012). State is shown as `Tag`. |
| `Tag` | row state | header state | — | — | Reused for lifecycle state (read-only). A state outside `Status` renders with the base `.tag` style. |
| `Meta` | — | — | — | — | **Not reused.** Focus shows no key/value provenance list; `RecordProse` shows values as prose and chips (ADR-024). |
| `ActorChip` | rows; "Created by" group headings | header | — | — | Reused for every `createdBy`, including the "Created by" group headings (its "Unattributed" state is the `NOT_SET` group). |
| `Breadcrumb` | — | — | — | link trail | Reused for the trail (D8); every item calls `history.go(-n)` (the one trail rule in Contracts). |
| `Select` | "Tell apart by" | mode | "Tell apart by" | layout | Reused for every choice control. |
| `Checkbox` | Select mode | — | — | — | Reused. |
| `IconButton` | expand toggles | — | add to set | — | Reused, with Lucide icons and accessible names. |
| `ActionMenu` | — | — | — | "More lenses" | Reused. |
| `LogTable` | table mode, board | — | — | — | Reused. The Collection table is the ADR-010 list pane for Lenses: on a nav lens its columns are `resolveContainerView(repo, sectionContainerId).columns`, the same source the governance list pane reads. |

---

## Scope

- A built-in **Lenses** view in App, reached from Generic (Explore > Lenses) and leaving by Go > Explorer. It works on editable and read-only documents (D1).
- **Derived lenses only:** navigation sections, compositions, used types, Everything, and My set. No curated lenses, no per-lens defaults and no repository ids in code.
- **Collection** (list/outline and table), **Focus** (Read via `RecordProse`, Document, Edit in place, As published), **Context** (groups by link type from the record's own edges, Nothing, inside/outside the set; In; Shown in; link trail with Back).
- **Tell apart by** on Collection (none, type, nesting, container, state, created by; a field option waits for gap 6) and Context (link type, none, inside/outside).
- **Draw a set:** Select mode with checkboxes and shift-range, "Show as a set", "Add everything these link to" with the hub guard and the skipped-hub list.
- **One address:** `src/lib/address.ts` shared with Essay. Lens, selected instance and distinctions are in the hash. Back, reload (after restore) and an externally written hash all work through App's one `popstate` listener (D2, D8).
- **One label module:** `src/lib/labels.ts` (`humanise`, `fieldLabel`) for forms, lenses and RecordProse.
- **Four layouts:** trail, reader, board, graph.
- Styleguide specimens for every pane, in both themes.
- Unit tests for lens building, distinctions, the boundary split and the address; one e2e spec against `e2e/fixtures/srs-spec.srs`.
- `plans/ux-lenses.md` ported into this branch in Phase 0. It must live in the repo because ADR-025 and this plan cite its §2, §3 and §7, and `poc/ux-lenses` is a local branch reviewers cannot reach.

**Out of scope:**

- Hand-made (curated) lenses, and lens definitions in packages (needs an srs RFC, Door 2). The prototype's `curatedLenses` stay as reference on `poc/ux-lenses` and in `plans/ux-lenses.md` §3. Do not delete that branch.
- An essay writing surface in Focus; Essay stays its own shell.
- Replacing or changing the Generic, Governance, Guides, Essay or Method shells (only Generic gains a nav item; editor forms change only `title || name` to `title || humanise(name)`, in its own commit).
- Lenses as the default landing (D1-C).
- Generic, Governance and Guides moving onto the shared address (#426 remainder).
- NavTree filter, keyboard and persisted expansion (#425, re-scoped onto Collection by D4).
- `RecordDispatch` and the Generic inspector adopting `RecordProse` (#137 follow-up, D3).
- Lifecycle transitions and relation creation from Lenses.
- Type-filtered Context groups (D10).
- A field-label fix for schema titles copied from descriptions (engine gap, srs-rust#1382).

### Engine gaps (filed; numbering canonical in ADR-025)

| ADR-025 gap | Gap | Issue | Answers | Parent | What the client does until then |
|---|---|---|---|---|---|
| 1 | Composition read by id with its sections; which compositions show an instance | srs-rust#1378 | SP-05 | semanticops.com#22 | The comp lens's Collection reads the JSON render projection. "Shown in" lists only `documentViewsForContainer` results; fixed-container-section compositions are missing. |
| 2 | Per-record anchors in rendered composition output | srs-rust#1288 (existing; commented with the Lenses use case) | none on the issue (it predates the rule) | semanticops.com#25 | "As published" cannot highlight the selection; Document builds its own blocks one level deep (`loadContainerBlocks`). |
| 3 | Tier 0 note read through WASM | srs-rust#1379 | SP-05 | semanticops.com#22 | `tryRecord` returns undefined for a note; Focus says "A note; its text is not shown here." |
| 4 | `find` hits with field values | srs-rust#1380 | SP-05 | semanticops.com#22 | The Everything and type lenses call `getRecord` once per hit. |
| 5 | Composition display title | the-greenman/srs#928 ("RFC needed", requires-spec-rfc) | SP-05 | semanticops.com#22 | Clients humanise the composition `name`. |
| 6 | Field id for a type-schema property and a `find` field facet | the-greenman/srs#931 ("RFC needed", requires-spec-rfc; amends RFC-039) | SP-05 | semanticops.com#22 | "Tell apart by" offers no field option; boards outside a container view show label, type and state only. |

**Not engine gaps** (client tasks in this plan):
- `neighbours` returns every edge when no limit is passed. The prototype's 500 cap is removed (`loadEdges`); a group's "Show more" pages the edges already loaded (`groupEdges`, `NEIGHBOUR_PAGE` at a time); no second read.
- `find` already returns `facets.fields`, but keyed by `Field.name` with no field id; it is not used until gap 6 (srs#931).
- Relation usage counts: not needed (D10), not filed.

### Deferred srs-web follow-ups (ready to file at Phase 8, after owner sign-off)

Search first with each query (repo rule); comment instead of filing a duplicate.

1. **RecordDispatch fallback and Generic inspector read through RecordProse.**
   - Target: the-greenman/srs-web. Parent: semanticops.com#22; also comment on srs-web#137.
   - Problem: a record still reads three ways (`RecordProse`, `RecordView`, Generic's inspector).
   - Acceptance: `RecordDispatch`'s fallback and Generic's inspector render through `RecordProse`, and no other prose reader remains in `src/`.
   - Duplicate search: `gh search issues --repo the-greenman/srs-web "RecordProse OR RecordDispatch fallback OR inspector reading" --state open`.
   - `Answers: SP-19`.
2. **Re-scope #425 onto Collection's outline** (a comment on #425, not a new issue).
   - Target: the-greenman/srs-web#425. Parent: semanticops.com#22.
   - Problem: #425 specifies a second tree (`NavTree`) beside Collection's outline.
   - Acceptance: #425's body names `src/lib/lens/Collection.svelte` as the tree to extend (filter, keyboard, persisted expansion) and adopt in Generic and Governance.
   - Duplicate search: `gh issue view 425 --repo the-greenman/srs-web --comments`.
   - `Answers: SP-47`.
3. **Lenses as the default landing** (parked for an owner decision after use).
   - Target: the-greenman/srs-web, label `parked`. Parent: semanticops.com#22.
   - Problem: every repository still opens in Generic, whatever it holds.
   - Acceptance: the owner rules whether the initial `editorMode` becomes `"lenses"`, and the ruling is recorded in ADR-022.
   - Duplicate search: `gh search issues "default landing" --repo the-greenman/srs-web --state open && gh search issues "default landing" --repo the-greenman/srs-web --label parked`.
   - `Answers: No affirmed problem yet: a repository opens in a view that ignores what it holds.` (Related suggestion, not affirmed: SP-48.)
4. **#426 narrowed** (in PR A's body, no new issue): "Narrows #426: address module, Lenses and Essay; Generic, Governance and Guides remain."
5. **`type_schema` copies a field's description into `title`**: filed as **the-greenman/srs-rust#1382** (Answers: SP-05, linked under semanticops.com#22; duplicate searches for "type_schema title description", "title falls back to description", "displayLabel description title schema", open, closed and parked, found nothing). srs-rust ADR-026 records the fallback, and no spec rule requires it, so it is an implementation issue. `fieldLabel` (`title || humanise(name)`) needs no change when it lands.

---

## Port map (prototype → this branch)

**Port, not rewrite.** Workers copy each file from `poc/ux-lenses` (`git -C /home/greenman/dev/semanticops/srs-web-wt-ux-lenses show f96ecc2:<path>`) and apply only the listed changes. Every `ponytail:` that names an engine gap cites it as `ADR-025 gap N (<issue>)`.

| Prototype file | Fate | Changes on the way in |
|---|---|---|
| `src/lib/lens/lens.ts` | port | Contracts above. **Drop** `curatedLenses`, `problemContext`, `ctx`, `relationLabel`, `Collection` kinds `navigation` and `outline.also`, `Lens.columns`/`by`/`ctxBy`/`layout`/`context`, `ContextGroupDef.types`. `humanise` moves to `src/lib/labels.ts`. `defaultContext` takes the record's edges and `listRelationTypes()`; labels from `RelationTypeInfo.label`. Type lens labels from `listTypes` `name` via `humanise` (no `namespace/name` slicing). Comp lens label: `ponytail: ADR-025 gap 5 (srs#928)`. |
| `src/lib/lens/lens-distinctions.ts` | port | Contracts above. Values renamed: `nothing` → `none`, `createdBy` → `created-by`, `link` → `link-type`, `nothing` (ctx) → `none`; `field:<fieldId>` is the grammar, but no field option is built until gap 6. Grammar types and validation move to `address.ts`; `By`/`CtxBy` are deleted. `created-by` groups by actor id. **Drop** `sharedFields` and the `field:` grouping branch (gap 6). |
| `src/lib/lens/lens-data.ts` | port | Contracts above. **Remove** `compositionsByContainer`, `allEdges`, `loadGroup` (D10; groups page loaded edges) and the type lens's `listRecords` (now `find({ typeId })`). **Drop** `selectFields` and `typeColumns`; non-outline boards show label, type and state (`ponytail: ADR-025 gap 6 (srs#931)` where columns are chosen). `fieldLabel` moves to `src/lib/labels.ts`. Ponytails: composition stand-in → gap 1, `loadDocument`/`loadContainerBlocks` → gap 2, `tryRecord` → gap 3, `getRecord` per find hit → gap 4. |
| `src/lib/lens/Collection.svelte` | port | Raw `<select>` → `Select`. Checkbox → `Checkbox`. `+`/`−` toggles → `IconButton` (Lucide `chevron-right`/`chevron-down`, label "Expand …"/"Collapse …"). `data-part`s (`head`, `by`, `set-bar`, `group`, `row`, `toggle`). Header comment says "grouping over loaded items" (D7). |
| `src/lib/lens/Focus.svelte` | port + extract | Move the `read` snippet and its `view()` helper to **`src/rendering/RecordProse.svelte`** (D3). Keep the "long field" `ponytail:` there (presentation limit). Focus keeps mode control, blocks, document and edit. `onEdit` is absent when `readOnly`. The "A note" text stays (gap 3). |
| `src/lib/lens/Context.svelte`, `ContextGroup.svelte` | port | `+` (add to set) → `IconButton` (Lucide `plus`). In/out arrows → Lucide `arrow-left`/`arrow-right` (`aria-hidden`), text "links here"/"links out" as the accessible name. `Select` for "Tell apart by". `data-part`s. Groups from `groupEdges(edges, defaultContext(edges, listRelationTypes(repo)))` with `edges = loadEdges(repo, id)`; ContextGroup's "Show more" reveals the next `NEIGHBOUR_PAGE` of its items. |
| `src/lib/lens/LensSwitcher.svelte` | port | Prop `curated` → `tabs`. Tabs are the navigation-section lenses plus My set (My set only from Phase 7); compositions, types and Everything go under "More lenses" (`ActionMenu`). With no navigation sections, the first composition or type lens becomes the only tab. |
| `src/lib/lens/LensShell.svelte` | port, rewired | Props per the contract (`EditorShellProps & { readOnly?, onSaveCopy?, address, addressState }`). Toolbar from `lensActions`. No window listener: one `$effect` re-applies the `address`/`addressState` props from App. Writes only through `pushAddress` (selection; Go > Explorer with lens keys omitted) and `replaceAddress` (distinctions). Trail moves are `history.go(-n)`. An unresolvable `id` selects nothing. Replace local `version` with the `documentRevision` prop. Layout control → `Select`; layout is not in the address. Board, graph and set code arrive in Phases 6–7. |
| `src/lib/lens/LensPoc.svelte` | **drop** | App is the opener. |
| `src/main.ts` (`/lens` route) | **drop** | No hidden route. |
| `.gitignore` (`public/poc/*.srs`) | **drop** | No POC corpora. |
| `src/styles/components/lens.css` | port | Component and semantic tokens only; new component tokens on `:root` in `tokens-components.css` if a colour is needed (ADR-020 b). Any `@media` must be in `BREAKPOINTS` with `/* bp: */`. |
| `src/styles/index.css` | port | One `@import` line, `layer(components)`. |
| `src/Styleguide.svelte`, `src/styleguide/fixtures.ts` | port | `fx.lensCurated` → `fx.lensTabs` (derived-shaped). Specimens per phase. Every Frame carries its own `sg-lens-*` testid, so `styleguide.spec.ts`'s `sg-frame` count (5) is unchanged. |
| `tests/lens-distinctions.test.ts` | port | Drop the `sharedFields` case; rename values per the grammar. |
| `tests/styles-tokens.test.ts` | port | Add `src/lib/lens` to `SHELL_FILES`; cover `src/rendering/RecordProse.svelte`. |
| `plans/ux-lenses.md` | port (Phase 0, done) | Copied from `poc/ux-lenses` with a status line: "Integrated by #547; §3 curated lenses are reference only." |

**`ponytail:` handling:**
- Engine-gap ponytails cite `ADR-025 gap N (<issue>)`; a grep check enforces that every cited N exists in ADR-025.
- Presentation limits, with no follow-up: RecordProse "long field" heuristic; `loadContainerBlocks` one level deep (also gap 2); `LensShell` `containersForInstance` per member while "Container" is chosen; no field option and no schema-order board columns until gap 6.
- The prototype's unmarked corner cut (hash replaceState-only, read only at mount) is **fixed** in Phase 4.

---

## Phases

PR split: see "Too big for one PR" at the end. Phases 0–5 are **PR A** (`Refs #547`, narrows #426). Phases 6–8 are **PR B** (`Closes #547`). Push branches only; review, then open the PR; the owner merges.

Every milestone gate runs, in order, and each must exit 0:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

plus the phase's named e2e specs. The two checks below run from the worktree root. Each names only paths that exist at that phase, and each fails on grep's exit 2 (a missing path or bad pattern) instead of passing:

```bash
# no-literals: no UUID, namespace or core relation key literal in lens code (and RecordProse from Phase 3).
# Phase 2 runs it with LIT_PATHS="src/lib/lens"; Phases 3–8 with LIT_PATHS="src/lib/lens src/rendering/RecordProse.svelte".
rc=0; for p in $LIT_PATHS; do test -e "$p" || { echo "missing $p"; exit 1; }; done
grep -rnE "[0-9a-f]{8}-[0-9a-f]{4}-|[\"'\`]com\.[a-z]|[\"'\`](contains|depends-on|supersedes|refines|derived-from|evidences|precedes)[\"'\`]" $LIT_PATHS || rc=$?; test "${rc:-0}" -eq 1

# gap-cites: every "ADR-025 gap N" cited in src exists as item N in ADR-025's consequences list.
missing=$(for n in $(grep -rhoE 'ADR-025 gap [0-9]+' src | grep -oE '[0-9]+$' | sort -u); do grep -qE "^$n\. " docs/adr/025-lenses.md || echo "$n"; done)
test -f docs/adr/025-lenses.md && test -z "$missing"
```

### Phase 0: Decisions, ADRs, design reference

**Goal:** Owner answers to D1–D10 recorded; ADR-022 to ADR-025 written and reviewed; the design reference in the repo.

**Agent:** Lead Integrator (writes); Architecture Reviewer (reviews the ADRs).
**Write scope:** `plans/547-lenses-view.md`, `plans/ux-lenses.md` (new, ported), `docs/adr/002-editor-mode-selection.md` (Status line only), `docs/adr/009-container-driven-nav.md` and `docs/adr/010-view-driven-list-columns.md` (one "Extended by ADR-025" header line each), `docs/adr/022-built-in-views-and-editor-registry.md`, `docs/adr/023-one-hash-address.md`, `docs/adr/024-one-record-reading-component.md`, `docs/adr/025-lenses.md`.

#### Tasks
- [x] Record the owner's answers (the rulings table at the top), D10 included.
- [x] Write ADR-022, ADR-023, ADR-024 and ADR-025. Mark ADR-002 superseded by ADR-022.
- [x] File the engine gaps (ADR-025 gaps 1–6) before any code (D10).
- [x] Resolve plan review round 1 (this revision).
- [x] Port `plans/ux-lenses.md` from `poc/ux-lenses` with the status line.
- [x] Resolve plan review round 2 (this revision).
- [ ] Add "Extended by: [ADR-025](./025-lenses.md)" to ADR-009 and ADR-010's header lists.
- [ ] Architecture Reviewer pass over the ADRs (blocking / should-fix / nit).

#### Acceptance Criteria
- [ ] Every Dn has an owner answer.
- [ ] ADRs cite ADR-001 and state the rejected alternatives; ADR-025 states there is no ADR-001 exception.
- [ ] `gap-cites` passes (no `ponytail:` exists yet); ADR-025 lists gaps 1–5 with issue numbers.

#### Testing
```bash
npm run lint && npm test
test "$(grep -lE '^- \*\*Status:\*\* ' docs/adr/02[2-5]-*.md | wc -l)" -eq 4
test -f plans/ux-lenses.md
```

#### Milestone gate
All three commands exit 0. Commit `docs: lenses ADRs, plan review round 1, design reference (#547)`.

### Phase 1: One hash address

**Goal:** `src/lib/address.ts` is the only hash parser, validator and writer; Essay uses it with unchanged behaviour; lens keys round-trip.

**Agent:** Web App Worker.
**Write scope:** `src/lib/address.ts` (moved), `src/lib/essay/address.ts` (deleted), `src/lib/essay/EssayShell.svelte` (import path, and `push` calls `pushAddress`), `tests/address.test.ts`.

#### Tasks
- [ ] `git mv src/lib/essay/address.ts src/lib/address.ts`. Implement the `address.ts` contract: `LensId`, `CollectionBy`, `ContextBy`, `LENS_ID`, `COLLECTION_BY`, `CONTEXT_BY`, `Address`, `parseAddress`, `formatAddress`, `pushAddress`, `replaceAddress`, `readTrail`.
- [ ] EssayShell: import from `$lib/address.js`; its `push` helper calls `pushAddress({ essayId, zoomId })` (the unchanged-hash guard moves into `pushAddress`). No behaviour change.
- [ ] `tests/address.test.ts`: import from `$lib/address.js`.

#### Acceptance Criteria
- [ ] `grep -rn "essay/address" src tests` is empty.
- [ ] `grep -rnE "history\.(push|replace)State" src/lib/essay src/lib/lens` is empty.
- [ ] Essay deep links (`#e=&p=&z=`) behave as before.

#### Testing (named)
- `tests/address.test.ts`:
  - existing "round-trips" and "tolerates junk";
  - "round-trips lens keys": `parseAddress(formatAddress(a))` equals `a` for `{ lens: "nav:97838af7-50f8-4da2-9d8f-d7dbf9296c80", instanceId: "006a853f-7e58-4842-85e4-ad75d4b0fe5d", by: "field:00000000-0000-4000-8000-000000000001", ctxBy: "boundary" }` and for each `LensId` form;
  - "accepts a raw colon": `parseAddress("#lens=nav:abc&by=field:def")` gives `lens: "nav:abc"`, `by: "field:def"`;
  - "drops invalid lens, by and ctxby values": `#lens=bogus&by=colour&ctxby=x` parses to `{}`; each regex is tested on its valid forms;
  - "essay and lens keys coexist";
  - "unknown keys are ignored";
  - "pushAddress pushes once and is a no-op for the same hash and trail" (a stubbed `history`);
  - "pushAddress with the same hash but a new trail pushes";
  - "replaceAddress replaces, keeping the trail";
  - "readTrail returns [] for null, junk and a missing trail".
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- essay-editor essay-comments
```

#### Milestone gate
All pass. Mark tasks `[x]`. Commit `refactor(address): one hash address module shared by essay and lenses (#547, #426)`.

### Phase 2: Lens model, data, labels (pure modules)

**Goal:** Derived lenses, loaders, distinctions and the shared label module ported and tested against the real engine; no UI yet.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/lens.ts`, `src/lib/lens/lens-data.ts`, `src/lib/lens/lens-distinctions.ts`, `src/lib/labels.ts` (moved from `src/lib/generic/labels.ts`), the label importers listed in Contracts (import lines; `blueprint-fields.ts` label lines), `tests/lens-distinctions.test.ts` (new, ported), `tests/lens-model.wasm.test.ts` (new), `tests/labels.test.ts` (new), `tests/document-model.test.ts` and `tests/generic-records-map.test.ts` (import paths only), `tests/blueprint-fields.test.ts` (two cases). `src/lib/editor/blueprint-fields.ts` changes in a separate commit within this phase.

#### Tasks
- [ ] Port the three lens modules per the port map and contracts.
- [ ] `git mv src/lib/generic/labels.ts src/lib/labels.ts`; add `humanise` (the body of `typeNameLabel`) and `fieldLabel` (`title || humanise(name)`); delete `typeNameLabel` and update its importers.
- [ ] Separate commit `refactor(forms): field labels humanise a bare name (#547)`: `blueprint-fields.ts` uses `fieldLabel({ name, title: prop.title })` at both sites; `tests/blueprint-fields.test.ts` gains "a titled field keeps its title" and "an untitled field shows its humanised name". PR A's body names this commit.
- [ ] `lens-model.wasm.test.ts`: the `editor-install.wasm.test.ts` pattern (copy bindings aside, `initSync`), then `mod.SrsRepository.load_archive(readFileSync("e2e/fixtures/srs-spec.srs"))`. Skipped without bindings; fails in CI without them.

#### Acceptance Criteria
- [ ] `no-literals` passes.
- [ ] `gap-cites` passes.
- [ ] `grep -rn "typeNameLabel\|generic/labels" src tests` and `grep -rn "listRelations(\|listRecords(\|loadGroup" src/lib/lens` are empty.
- [ ] Every `ponytail:` in `src/lib/lens` cites `ADR-025 gap N (<issue>)` or names a presentation limit from the port map.

#### Testing (named)
- `tests/labels.test.ts`:
  - "humanise splits dots, dashes and underscores";
  - "fieldLabel returns the title when present";
  - "fieldLabel humanises the name when the title is empty or absent".
- `tests/lens-distinctions.test.ts` (ported):
  - `groupItems` by none, type, state, container, "Not set" last, `created-by` by actor id; a `field:<fieldId>` value falls back to the kind default;
  - "splitByBoundary is the one edge-to-set classifier": inside/outside for edges whose other end is in or out of the set, nothing dropped, order kept;
  - `skipHubs` at and above `HUB_LINKS`;
  - `collectionOptions` offers Nesting only for outlines, State and Created by only when present, and never a `field:` option (gap 6).
- `tests/lens-model.wasm.test.ts`:
  - "derives one nav lens per depth-0 navigation section with a sectionContainerId (9)";
  - "derives one comp lens per composition": the comp lens ids equal `listDocumentViews(repo).map((c) => "comp:" + c.id)` in order, and on this fixture that is the six ids in "Bindings and fixture facts";
  - "derives type lenses ordered by record count";
  - "lens ids are prefixed engine ids";
  - "type lens loads through find": `loadCollection` on `type:2a000004-…` returns `total` equal to `find({ typeId }).total`, first page ≤ `PAGE`, each item with a `record`;
  - "defaultContext groups only the record's own edges": for `006a853f-7e58-4842-85e4-ad75d4b0fe5d` (Package) every group's relation type appears in `loadEdges` for it, `depends-on` out is present, and no group exists for a relation type with no edge at that record;
  - "an unlisted relation key sorts last with a humanised label" (unit case with a synthetic edge);
  - "group labels come from RelationTypeInfo.label" (`depends-on` → "Depends on");
  - "hub record: loadEdges returns every edge and groups page it": for `580cfe0e-b23e-4215-a3c4-22cbd0526810` (41 edges) `loadEdges` has 41 items, equal to `neighbours(repo, id).total`, with one engine call; each `groupEdges` total sums to 41;
  - "loadCollection outline returns members in arranged order with depth";
  - "shownIn is empty on srs-spec" (no container returns a composition);
  - "shownIn lists a bound composition (gallery)": on `gallery.srsj`, `shownIn(repo, containersOf(repo, "ad159754-2edd-4bf8-a70f-a29a617e5809"))` contains `{ compositionId: "78b11038-e5d8-4269-9982-fe5c459802b2", containerId: "f7562aa3-98c7-44be-b4c5-5474df6441f2" }`.
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- guides-editor blueprint-document-editor records-explorer
LIT_PATHS="src/lib/lens"   # then no-literals and gap-cites
```

#### Milestone gate
All pass, plus `no-literals` and `gap-cites`. Two commits: `refactor(forms): field labels humanise a bare name (#547)` and `feat(lens): derived lenses, loaders, distinctions and shared labels (#547)`.

### Phase 3: Panes, RecordProse, specimens

**Goal:** Collection, Focus, Context, ContextGroup, LensSwitcher and RecordProse exist as presentation components with specimens in both themes, built from the reused components.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/{Collection,Focus,Context,ContextGroup,LensSwitcher}.svelte`, `src/rendering/RecordProse.svelte` (new), `src/styles/components/lens.css`, `src/styles/index.css`, `src/styles/tokens-components.css` (only if a token is needed), `src/Styleguide.svelte`, `src/styleguide/fixtures.ts`, `docs/adr/020-icon-set-and-component-token-api.md` (part table rows only), `tests/styles-tokens.test.ts`, `tests/Collection.test.ts`, `tests/Focus.test.ts`, `tests/Context.test.ts`, `tests/RecordProse.test.ts` (new).

#### Tasks
- [ ] Port the five components per the port map. Extract `RecordProse` (D3). Swap glyphs for `IconButton` + Lucide; verify each icon name exists in `node_modules/@lucide/svelte/dist/icons/`.
- [ ] Port `lens.css` and the import. Add `src/lib/lens` to `SHELL_FILES`.
- [ ] Specimens (`#lenses` section):
  - switcher with nav tabs + More;
  - Collection outline under Nesting with Select on and a set of 2;
  - Collection list told apart by Created by (ActorChip headings);
  - Collection table;
  - Focus Read (RecordProse);
  - Focus Document with the selected block;
  - Focus "As published" (markdown);
  - Focus Edit (SectionForm in place);
  - Context by link type with In and Shown in;
  - Context by None;
  - Context inside/outside;
  - trail Breadcrumb with Back.
- [ ] Add `data-part` rows for Collection, Focus, Context, LensSwitcher and RecordProse to ADR-020 (c).

#### Acceptance Criteria
- [ ] No `<style>` block in `src/lib/lens/*` or `RecordProse.svelte`; the tokens test passes.
- [ ] No glyph-as-icon buttons remain. Every control has an accessible name.
- [ ] The "Reused components" table holds both ways. Positive (each must print nothing):
  ```bash
  for pair in Collection:Tag Collection:ActorChip Collection:Select Collection:Checkbox Collection:IconButton Collection:LogTable \
              Focus:Tag Focus:ActorChip Focus:Select Context:Select Context:IconButton LensSwitcher:ActionMenu; do
    f=src/lib/lens/${pair%%:*}.svelte; c=${pair##*:}
    grep -q "components/$c.svelte" "$f" || echo "$f does not import $c"
  done
  ```
  (Shell-level `Breadcrumb` and layout `Select` are checked in Phase 4 on `LensShell.svelte`.) Negative: `grep -rn "Block.svelte\|BlockStack\|Lifecycle.svelte\|Meta.svelte" src/lib/lens src/rendering/RecordProse.svelte` prints nothing.
- [ ] Specimens render in default and demo themes with no console errors.

#### Testing (named)
- `tests/RecordProse.test.ts`:
  - "first markdown field is the unlabelled body";
  - "short values render as one chip line";
  - "empty fields and aiGuidance are never shown";
  - "an inline composite renders as a table";
  - "the field equal to displayLabel is not repeated";
  - "labels come from fieldLabel".
- `tests/Collection.test.ts`:
  - "group headings carry counts";
  - "None shows labels only";
  - "Created by headings are ActorChips";
  - "shift-click checks a range";
  - "expand toggle is an IconButton with a name";
  - "table columns are the given ColumnSpec labels in order" (the ADR-010 list pane contract).
- `tests/Focus.test.ts`:
  - "Edit absent when onEdit absent";
  - "clicking a block selects it";
  - "As published offered only when published".
- `tests/Context.test.ts`:
  - "empty groups hidden";
  - "inside/outside shows both groups";
  - "add-to-set is an IconButton";
  - "skipped hubs listed with an add each";
  - "Shown in lists only the given compositions";
  - "Show more reveals the next NEIGHBOUR_PAGE of a 41-item group" (ContextGroup, no callback).
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- styleguide
LIT_PATHS="src/lib/lens src/rendering/RecordProse.svelte"   # then no-literals and gap-cites
```

#### Milestone gate
All pass, plus `no-literals` and `gap-cites`. Commit `feat(lens): Collection, Focus, Context panes and RecordProse with specimens (#547)`.

### Phase 4: LensShell in the real app (trail and reader layouts)

**Goal:** A person opening any repository can go Explore > Lenses, use trail and reader layouts with Read, Document, Edit and As published, follow links with one history, reload after restore, and return with Go > Explorer.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/LensShell.svelte`, `src/lib/lens/toolbar-actions.ts` (new), `src/lib/editors/registry.ts` (`BUILT_IN_VIEWS`, `isBuiltInView` only), `src/App.svelte`, `src/lib/generic/GenericSrsShell.svelte` (one nav item and one prop), `e2e/lenses.spec.ts` (new), `e2e/helpers.ts` (`openLenses(page)` only), `tests/lens-toolbar-actions.test.ts` (new), `tests/editor-registry.test.ts` (existing; two cases added), `tests/GenericSrsShell.test.ts` (one case).

#### Tasks
- [ ] Port LensShell per the port map without board, graph or set code; `layouts` is `["trail", "reader"]` in this phase. The My set tab is **hidden** until Phase 7 (`LensSwitcher` gets no `set` tab; `lens=set` falls back like any unknown id).
- [ ] `lensActions` per the contract.
- [ ] Registry: `BUILT_IN_VIEWS` and `isBuiltInView`.
- [ ] App wiring:
  - the gating `$effect` uses `isBuiltInView`;
  - a new `{:else if editorMode === "lenses"}` branch, before `{:else if !activeEditor}`, mounts LensShell with Generic's props plus `onDocumentMutation`, `documentProvider` and `onOpenExplorer`;
  - **one** `popstate` listener in App (`onPopState`, Contracts) keeps `address`/`addressState` and chooses the shell: while loaded, a `lens` → `editorMode = "lenses"`; no `lens` while `editorMode === "lenses"` → `"generic"`. The same check runs once after every successful load. LensShell receives `address` and `addressState` as props;
  - opening another repository calls `replaceAddress` without the lens keys;
  - `?repo=…&editor=lenses` works through `pendingEditor`.
- [ ] Generic: `onOpenLenses?: () => void` prop and an Explore-group item "Lenses" (`data-testid="open-lenses"`).
- [ ] Address behaviour (D8): picking or following → `pushAddress`; a distinction → `replaceAddress`; LensShell's one `$effect` re-applies the `address`/`addressState` props (lens, `instanceId`, distinctions, `readTrail(addressState)`) and it adds no window listener; every trail move is `history.go(-n)` (Back = `n = 1`); Go > Explorer → `pushAddress` of the address without lens keys.
- [ ] Read-only: no Edit, `onSaveCopy` in Document. The read-only line reuses Generic's `Notice` (`testid="read-only-note"`).

#### Acceptance Criteria (each has a named e2e test below)
- [ ] Explore > Lenses opens the first navigation-section lens; Go > Explorer returns to Generic with the document still open.
- [ ] Opening `/?open=<srs>` (read-only) still offers Lenses, and it has no Edit.
- [ ] Edit in place marks the document unsaved (`documentDirty`); Save works as in Generic.
- [ ] Browser Back after following two links returns through both, and the visible trail agrees.
- [ ] Writing `#lens=…&id=…` to `location.hash` selects that lens and record (the agent path); an unresolvable `id` selects nothing.
- [ ] Back from Generic into a lens hash reopens Lenses.
- [ ] `?repo=…&editor=lenses` opens Lenses.
- [ ] A hash given with `?open=` survives the parameter clearing.
- [ ] My set is not offered.
- [ ] No regression in Generic, editor mode and open-url behaviour.

#### Testing (named)
- `tests/lens-toolbar-actions.test.ts`: "Explorer is in Go"; "Save absent when read-only"; "Save a copy present only when read-only"; "Wide toggles shell".
- `tests/editor-registry.test.ts` (existing file): "no EDITORS id is a built-in view"; "isBuiltInView accepts generic and lenses only".
- `tests/GenericSrsShell.test.ts`: "Explore group offers Lenses when onOpenLenses is given".
- `e2e/lenses.spec.ts` (`describe("lenses — shell and address")`, `srs-spec.srs` through `#srsj-file` unless stated):
  - "Explore > Lenses opens the first section lens and Go > Explorer returns";
  - "read-only ?open= offers Lenses without Edit" (the `e2e/open-url.spec.ts` `serve()` route pattern);
  - "a hash given with ?open= survives the parameter clearing" (`/?open=<link>#lens=nav:<id>&id=<id>` lands on that record, `location.search` is empty);
  - "an externally written hash selects lens and record";
  - "an unresolvable id selects nothing, with no page error";
  - "browser Back after following two links walks both and the trail agrees";
  - "Back between two entries with the same hash but a different trail restores that trail" (follow A→B, pick B again from the Collection, then Back);
  - "a Breadcrumb item jumps back n entries and browser Forward returns";
  - "Back from Generic into a lens hash reopens Lenses";
  - "reload then restore-session reopens the same lens, record and distinctions";
  - "editor=lenses on a repo link opens Lenses" (the `e2e/cloud-storage.spec.ts` `?repo=` route stub);
  - "Edit then Save marks the document unsaved";
  - "My set is not offered".
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- lenses navigation editor-mode open-url shell-layout mobile-layout essay-editor
LIT_PATHS="src/lib/lens src/rendering/RecordProse.svelte"   # then no-literals and gap-cites
grep -q "components/Breadcrumb.svelte" src/lib/lens/LensShell.svelte && grep -q "components/Select.svelte" src/lib/lens/LensShell.svelte
rc=0; grep -nE "svelte:window|addEventListener\\(.(popstate|hashchange)" src/lib/lens/LensShell.svelte || rc=$?; test $rc -eq 1   # LensShell owns no listener
```

#### Milestone gate
All pass, plus `no-literals` and `gap-cites`. Commit `feat(lens): Lenses view in the app — trail and reader, one address (#547)`.

### Phase 5: End-to-end journey and PR A review

**Goal:** One e2e journey proves PR A against `srs-spec.srs`. A fresh-eyes run and the reviewers pass, and PR A is pushed for review.

**Agent:** Web App Worker (spec); Verification Agent; Fresh-eyes Reviewer; Architecture Reviewer.
**Write scope:** `e2e/lenses.spec.ts`.

#### Tasks
- [ ] `e2e/lenses.spec.ts`, `test("journey — srs-spec")`:
  1. Explore > Lenses shows `lens-shell` with 9 section tabs.
  2. Pick the Distribution tab (`nav:97838af7-50f8-4da2-9d8f-d7dbf9296c80`), then the concept "Package" (`006a853f-7e58-4842-85e4-ad75d4b0fe5d`): Focus Read shows "Package"; Context shows a "Depends on →" group with a count.
  3. Follow the prerequisite "Field" (`873099c5-093d-4684-8c36-46f813847c1a`): the trail shows two items; browser Back returns to "Package" with the trail emptied.
  4. "Tell apart by" Type groups the Collection and the hash gains `by=type`.
  5. On the decision type lens (`type:6a000004-0000-4000-a000-000000000004`), the "Tell apart by" select lists no field option (gap 6), and writing `#…&by=field:<uuid>` falls back to Type with no page error.
  6. Reader layout, then Document: the selected block is highlighted.
  7. Edit a concept's title in place, then Cancel: nothing is unsaved. Edit, then Save: "Unsaved changes" shows.
  8. Reload, then `restore-session`: Lenses reopens on the same lens and record.
  9. Go > Explorer: `generic-srs-shell` is visible.
  10. No `pageerror` events during the run.
- [ ] Fresh-eyes run. Dev server: `npm run dev` (Vite, http://localhost:5173). Fixtures: `e2e/fixtures/srs-spec.srs` and `e2e/fixtures/gallery.srsj`, opened through the file picker. Tasks:
  - read a Part;
  - find a concept's prerequisites and come back;
  - tell the Part's records apart by type;
  - edit one block and cancel;
  - open `gallery.srsj` and reach Lenses with no error.
- [ ] Architecture review of the diff, then the Lead Integrator reviews it (DRY at the right layer first) and pushes the branch.

#### Acceptance Criteria
- [ ] `npm run e2e -- lenses --repeat-each=2` green (each test runs twice; no flake).
- [ ] `npm run e2e -- large-repo` still green.
- [ ] No blocking findings open.

#### Testing
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- lenses --repeat-each=2
npm run e2e -- large-repo styleguide navigation editor-mode open-url essay-editor
```

#### Milestone gate
All pass, plus `no-literals` and `gap-cites`. Commit `test(lens): end-to-end journey on the spec fixture (#547)`. Push. Open PR A after review: `Refs #547`, "Narrows #426: …", the `refactor(forms)` commit named, the ADR-002/ADR-022 interim note, follow-up 2 (the #425 comment) posted.

### Phase 6: Board and graph layouts (PR B)

**Goal:** Board (Collection table, Focus and Context in the drawer) and graph (RelationGraph focused on the selection, edges told apart inside vs leaving the set) work on every lens.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/LensShell.svelte`, `src/lib/lens/lens-data.ts` (`graphEdges` only), `src/styles/components/lens.css`, `src/Styleguide.svelte`, `src/styleguide/fixtures.ts`, `tests/lens-graph.test.ts` (new), `tests/lens-board.test.ts` (new), `e2e/lenses.spec.ts`.

#### Tasks
- [ ] Port the board and graph branches and the `graph` derivation from prototype LensShell. Columns: `ColumnSpec` on outline lenses, else label, type and state (D6 follow-up).
- [ ] The graph legend uses the Context group labels (`ContextGroupDef.label`): one naming source for list and graph (answers critique round 2, "Depends On" vs "Required by").
- [ ] When the selection's groups yield no edges in the chosen relation, the graph falls back to all of the record's edges (`loadEdges`).
- [ ] Specimens: board with grouped rows; graph with the inside/leaving legend.

#### Acceptance Criteria
- [ ] The board never shows a column no row has a value in. On a nav lens, columns come from `ColumnSpec`; on every other lens they are label, type and state (gap 6).
- [ ] The graph is never blank for a record with links.

#### Testing (named)
- `tests/lens-board.test.ts`:
  - "board omits columns no row fills";
  - "type, composition, find and set lenses show label, type and state columns only";
  - "nav lens columns are the ColumnSpec".
- `tests/lens-graph.test.ts`:
  - "edge labels reuse the Context group label for that relation and direction";
  - "under inside/outside, edges are relabelled by set membership";
  - "graph never blank for a record with links" (falls back to all edges).
- `e2e/lenses.spec.ts`: "board and graph layouts open on the decision type lens with no page error".
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- lenses styleguide
```

#### Milestone gate
All pass, plus `no-literals` and `gap-cites`. Commit `feat(lens): board and graph layouts (#547)`.

### Phase 7: Draw a set with the hub guard (PR B)

**Goal:** A person selects records, shows them as "My set", adds everything they link to without pulling in hubs, and tells the set's links apart inside vs leaving.

**Agent:** Web App Worker.
**Write scope:** `src/lib/lens/working-set.ts` (new), `src/lib/lens/LensShell.svelte`, `src/lib/lens/LensSwitcher.svelte` (the `set` tab), `src/lib/lens/Collection.svelte`, `src/lib/lens/Context.svelte`, `e2e/lenses.spec.ts`, `tests/Context.test.ts`, `tests/working-set.test.ts` (new).

#### Tasks
- [ ] `working-set.ts` per the contract (key `srs-web.lens-set.<repositoryId>`, every access in try/catch).
- [ ] Port `addAll` (it works from the checked records, else the focused one), `skipHubs` with `links = (id) => neighbours(repo, id, { limit: 1 }).total`, the skipped list, and the `set` lens (`deriveLenses(repo, readSet(...))`).
- [ ] Show the My set tab once a set exists.
- [ ] Once shown, "Show as a set" reads "Update the set (N)". The set bar stays pinned while Select is on (critique round 2).
- [ ] `lens=set` on a browser with no stored set falls back to the first tab with an info `Notice`.

#### Acceptance Criteria
- [ ] "Add everything" never adds a record with more than `HUB_LINKS` links. Each skipped hub is listed with its own add control.
- [ ] Context "Inside or outside the set" splits by the shown set.
- [ ] A throwing `localStorage` never breaks Lenses.

#### Testing (named)
- `tests/working-set.test.ts`: "round-trips ids under srs-web.lens-set.<id>"; "readSet returns [] when storage throws"; "writeSet does not throw when storage throws"; "readSet returns [] for junk".
- `tests/Context.test.ts`: "Add everything label names the checked count".
- `e2e/lenses.spec.ts`, `test("draw a set")`: check two concepts and show the set; Add everything grows it and lists any skipped hubs; "Tell apart by" Type groups it; Context inside/outside shows both groups; `lens=set` in a fresh context falls back with a notice.
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- lenses
```

#### Milestone gate
All pass, plus `no-literals` and `gap-cites`. Commit `feat(lens): draw a set with the hub guard (#547)`.

### Phase 8: Docs, review, follow-ups (PR B close)

**Goal:** Docs current, a fresh-eyes round on all four layouts, follow-ups filed after owner sign-off, PR B pushed for review.

**Agent:** Lead Integrator; Fresh-eyes Reviewer; Verification Agent; Architecture Reviewer.
**Write scope:** `plans/ux-lenses.md`, `plans/547-lenses-view.md`, `src/lib/components/README.md` (a pointer row to `src/lib/lens` and `RecordProse` only), `docs/adr/025-lenses.md` (consequences only).

#### Tasks
- [ ] Fresh-eyes round (`npm run dev`; fixtures `e2e/fixtures/srs-spec.srs`, `e2e/fixtures/gallery.srsj`):
  - board on the spec's decision type lens;
  - graph on concepts;
  - draw a set on concepts;
  - a read-only `?open=` link to the spec fixture (Playwright with the `e2e/open-url.spec.ts` `serve()` route).
- [ ] Fix blocking confusions in scope; record the rest as follow-ups.
- [ ] File the deferred follow-ups 1 and 3, after owner sign-off, each parented to semanticops.com#22 (5 is already srs-rust#1382).
- [ ] Record what was learned in srs-context (the `srs-context` skill) before finishing.

#### Acceptance Criteria
- [ ] `gap-cites` passes and every other `ponytail:` in `src/lib/lens` and `RecordProse` names a port-map presentation limit.
- [ ] PR body: `Closes #547`, the "Mode · Cell · Door" line if required, ADR links, follow-up list with issue numbers.

#### Testing
```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- lenses --repeat-each=2
npm run e2e -- large-repo styleguide navigation editor-mode open-url essay-editor
```

#### Milestone gate
All pass, plus `no-literals` and `gap-cites`. Commit `docs(lens): design reference, ADR consequences, follow-ups (#547)`. Push. Open PR B after review.

---

## Final Acceptance

### PR A (end of Phase 5)

- [ ] `npm run typecheck`, `npm run lint`, `npm test` (including `lens-model.wasm.test.ts` on the real bindings) and `npm run build` pass
- [ ] `npm run e2e -- lenses --repeat-each=2` green; `npm run e2e -- large-repo styleguide navigation editor-mode open-url essay-editor essay-comments guides-editor records-explorer` green
- [ ] `no-literals` and `gap-cites` pass
- [ ] Lenses is reachable from Generic, returns by Go > Explorer, and works read-only without Edit
- [ ] Back, reload-after-restore and an externally written hash land on the same lens, record and distinctions; Back from Generic into a lens hash reopens Lenses
- [ ] Trail and reader layouts; Collection, Focus and Context specimens in both themes
- [ ] Essay deep links unchanged; no other shell's behaviour changed (beyond Generic's one nav item and the shared label helper)
- [ ] No TypeScript computes a relation result (D10). The one permitted edge classifier is `splitByBoundary` (inside vs leaving the set, presentation per D7 and ADR-025), tested by "splitByBoundary is the one edge-to-set classifier"; `groupEdges` only buckets engine edges by their own `relationType` and `direction`
- [ ] PR A's body names the `refactor(forms)` commit (form labels) and notes that ADR-002 reads "Superseded" while ADR-022 is still proposed (interim until the owner accepts ADR-022)

### PR B (end of Phase 8)

- [ ] Everything in PR A still holds
- [ ] Board and graph layouts on every lens; board and graph specimens in both themes
- [ ] Draw a set with the hub guard; `working-set.ts` survives throwing storage
- [ ] Fresh-eyes round done; follow-ups filed with issue numbers in the PR body
- [ ] `npm run e2e -- lenses --repeat-each=2` and `npm run e2e -- large-repo styleguide navigation editor-mode open-url essay-editor` green

## Coordination Rules

- Web App Worker keeps to `srs-web/**` and to each phase's write scope; anything outside is reported, not edited.
- No SRS semantics in TypeScript (ADR-001). No relation result is computed in TypeScript (D10). A missing capability is an ADR-025 gap, cited in a `ponytail:`, never new TS logic. If a phase seems to need a new binding, stop and report.
- No WASM binding changes, so there is nothing to freeze on the engine side. The Lead Integrator freezes the `address.ts` contract (Phase 1), and the lens id prefixes and distinction grammar (Phase 2), before UI phases consume them.
- Port, not rewrite: copy from `poc/ux-lenses` at f96ecc2 and apply only the port-map changes. Any deviation is noted in the phase commit message.
- Architecture Reviewer runs before each push. Verification Agent runs every milestone gate. Fresh-eyes Reviewer runs in Phases 5 and 8.
- Agents push branches only. The Lead Integrator reviews the diff, then opens the PR. The owner merges.
- Do not delete or rebase `poc/ux-lenses`: it is the reference for hand-made lenses.

## Assumptions

- `origin/main` keeps the bindings the prototype uses; build.502 is pinned and supports revision 9 (see "Bindings and fixture facts").
- `e2e/fixtures/srs-spec.srs` stays the published spec bundle with the facts listed above. The `muSrs.srsj` fixture has only `precedes` relations and no navigation sections, so it cannot exercise Context.
- App's `observeWrites` wrapper makes every Lenses `updateRecord` mark the document dirty with no extra wiring. App's `readOnlyRepo` refuses writes underneath the hidden Edit.
- The URL hash survives App's `?open=` and `?repo=` clearing (`history.replaceState(history.state, "", withoutOpenParam(location.href))` keeps the fragment and the state). Phase 4 tests it.

## Too big for one PR

The issue scope is about 3,600 prototype lines plus the address move, App wiring, a RecordProse extraction, the label module, specimens and tests. Proposed split, same issue and branch lineage:
- **PR A (Phases 0–5):** ADRs, the address module (narrows #426), lens model and data, shared labels, the three panes with RecordProse, the Lenses view in the app with trail and reader layouts, Read, Document, Edit and As published, "Tell apart by", and the e2e journey. It delivers the core answer to SP-47 and SP-19.
- **PR B (Phases 6–8):** board and graph layouts, drawing a set with the hub guard, a fresh-eyes round, docs and the follow-up filing. `Closes #547`.

If the owner wants one PR, phases run in the same order, and Phase 5's push waits for Phase 8.
