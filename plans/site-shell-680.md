# Plan: Site editor shell in srs-web (a generic site core, a muDemocracy layer)

## Summary

The muDemocracy site editor is a separate Vite app (`muDemocracy.org/site-editor`) that reaches into srs-web's `$lib` at a pin and saves through a local dev-server bridge. Holon muDemocracy.org#418 moves it into srs-web as a registered editor shell. The site's own package (website 0.2.0, published as `packages-website-0.2.0`) is the link between block types and site components: one View per component, a Composition tagged `site` whose `typeDispatch` maps type → View, and a Theme for the look.

This plan delivers that shell in **two PRs**:
- **PR A** is the headless site core, the export and the muDemocracy guide mapping, with tests on the real engine. It lands first, so the site build (muDemocracy.org#415) can use `exportSite`.
- **PR B** is the shell UI, components with specimens, the registry entry and the muDemocracy evidence and authorship layer.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude Code (local /ship session, builder human:the-greenman) |
| Web App Worker | Claude Code |
| Verification | Verification Agent (srs-web), subagent |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client. The site core reads engine structures (records, containers, Views, Compositions) and adds no SRS semantics. A `typeDispatch` lookup is presentation wiring, like the editor registry | accepted |
| [ADR-022](../docs/adr/022-built-in-views-and-editor-registry.md) | The shell is one `EDITORS` entry | accepted |
| [ADR-027](../docs/adr/027-editor-layers.md) | Each task names its layer: headless `src/lib/site/*.ts`, components with specimens, a screen shell | accepted |
| [ADR-026](../docs/adr/026-nav-order-from-container-entries.md) | Page order is the container's arranged entry order | accepted |
| **ADR-029** (new) | The site editor shell. A site is the Composition tagged `site`, and its `rootTypeRefs` names the page type. Each block type's View (through `typeDispatch`) decides whether it is offered, its field order, and whether a field is off the site (`visible:false`, with `displayHint` `brief`, `setting` or `key`). The generic core names no site; site-specific behaviour (muDemocracy: guide references, evidence, authorship) lives in `src/lib/site/<site>/`, which the core never imports. Supersedes the prototype's D1, D2 and D9 (tokens), and the nav part of D19 (`site-editor/DECISIONS.md`). Rejects keeping the prototype as a separate app, and rejects a site registry in code | proposed |

The tag vocabulary (written into ADR-029): `published` (the export serves the page), `draft` (with `published`: served, not indexed), `closing-mark`, `layout:<name>` (default `standard`). Unrelated tags are always preserved. The `src/lib/site/<site>/` directories are a **temporary home** for site-specific code inside the srs-web bundle, until a site package can carry its own editor layer. The core never imports them, and a new layers-test check (named in ADR-029) enforces that. `exportSite` is a temporary TS projection: srs-rust#1553 moves it into core as a structured composition render.

Holon decisions cited: muDemocracy.org#418 register 1, 3 (3a to 3c), 5, 6, 13, 14, 15, 16, 17, 18, 19, 20, 26, 27, 28.

---

## Contracts

### WASM API surface

**No** new or changed WASM methods, and no CLI or schema change. The plan uses these existing bindings, adding typed wrappers in `src/lib/srs-client.ts` for the three that have none (`getComposition`, `getView`, `listViews`):
- `list_compositions({rootTypeId})` and `get_composition`;
- `list_views` and `get_view`;
- `list_containers`, `get_container` and the outline;
- `get_record` and `list_relations`;
- `updateContainer(repo, id, {tags})` (srs-client.ts:2626) for tag writes. It replaces the whole array, so writes read, modify and write back, keeping foreign tags;
- `$lib/document` (`transfer`, `moveEntry`, `shiftEntry`, `ensureContainer`, `areaId`, `DocumentHistory`).

### TypeScript types

```ts
// src/lib/site/site-views.ts
export interface FieldSlot { fieldId: string; name: string; order: number; visible: boolean; hint?: "brief" | "setting" | "key" | string }
export interface BlockView { viewId: string; viewName: string; types: string[]; fields: FieldSlot[] }
export interface Site { compositionId: string; pageTypeId: string; dispatch: Map<string, BlockView> /* "ns/name" -> view */ }
export function findSite(repo: SrsRepository): Site | null;          // list_compositions({}) -> get_composition each -> the one whose tags include "site"; pageTypeId = its rootTypeRefs[0].typeId (no rootTypeId filter needed)
export function viewFor(site: Site, typeKey: string): BlockView | null;
export function offeredTypes(site: Site): string[];                   // types with a View

// src/lib/site/site-model.ts
export type Publish = "no" | "draft" | "yes";
export interface PageSettings { publish: Publish; closingMark: boolean; layout: string }
export interface PageRef { containerId: string; anchorId: string; title: string; key: string }
export interface Block { id: string; type: string; fields: Record<string, unknown>; items: Block[] }
export function listPages(repo: SrsRepository, site: Site): PageRef[];
export function pageBlocks(repo: SrsRepository, page: PageRef): Block[];   // arranged order; items by `contains`
export function pageSettings(repo: SrsRepository, page: PageRef): PageSettings;
export function setPageSettings(repo: SrsRepository, page: PageRef, s: Partial<PageSettings>): void;

// src/lib/site/site-export.ts
export interface ExportedBlock { type: string; view: string; fields: Record<string, unknown>; items?: Record<string, unknown>[] }
export interface ExportedPage { key: string; title?: string; intent?: string; draft: boolean; closingMark: boolean; layout?: string; blocks: ExportedBlock[] }
export type BlockExtra = (repo: SrsRepository, id: string, out: Fields, record: SrsRecord, isItem: boolean) => void;
export function exportSite(repo: SrsRepository, site: Site, extra?: BlockExtra): ExportedPage[];

// src/lib/site/mudemocracy/guides.ts
export function guideReferences(repo: SrsRepository): BlockExtra;   // guide-section {guide, section}; an item that `uses` a guide record
```

`exportSite` returns what `muDemocracy.org/scripts/export-srs-pages.mjs` writes today, with exactly this delta:
- `nav` is removed (holon #418 decision 9: the highlight is derived from the menu);
- `view` (the View id) is added to every block.
- an explicit `layout:standard` tag (none in muSrs) exports as no `layout`, the default, and `setPageSettings` writes no tag for it;
- every error names its page (`page "<key>": …`), and a block whose type the site does not dispatch is refused.

Everything else is unchanged:
- **Fields:** a block's (or item's) fields are all its `fieldValues` except those whose View `displayHint` is `brief`. For the website types those are exactly `meta_objective`, `section_audience`, `editorial_objective` and `action_intent`. Keys, settings and other `visible:false` fields stay in, as today.
- **Pages:** `title` = `page_title`, `intent` = `page_intent`.
- **Which pages:** only containers tagged `published` whose anchor is the site's page type.
- **Errors:** it throws on a duplicate `page_key` and on a guide-section with no guide record, with the same messages as the script.
- **The extra:** `BlockExtra` runs on blocks **and on items**, so an action card that `uses` a guide record gets `{guide, section}`, as today.

| `Publish` | tags |
|---|---|
| `no` | neither `published` nor `draft` |
| `yes` | `published` |
| `draft` | `published` and `draft` |

`listPages` lists every page container (published or not) in the engine's container-list order, which is also the export's order (as the script's).

---

## Scope

PR A (`Refs #680`):
- `src/lib/site/site-views.ts`, `site-model.ts`, `site-export.ts` and `mudemocracy/guides.ts`.
- `e2e/fixtures/build-site-fixture.sh` and `e2e/fixtures/site.srsj`: a repository built with the CLI from the published bundle, holding two pages, groups with items, one page per publish state, and settings tags.
- `tests/site-*.wasm.test.ts`.
- ADR-029.
- The layers test is extended: `src/lib/site/*.ts` must not import `src/lib/site/mudemocracy/`.

PR B (`Closes #680`):
- `SiteShell.svelte` and the site canvas, block and inspector components, with `/styleguide` specimens and `site-` prefixed classes.
- Write operations: edit a field, add a block (from `offeredTypes`), move, drafts, Bin, undo and duplicate page, all through `$lib/document` (`moveEntry`, `transfer`, `deleteFromBin`, `DocumentHistory`) and `essay-model`'s `visibleEntries`. None of them is rebuilt.
- The muDemocracy layer: evidence and backing, authorship and forks, not-a-claim, the agent brief, field roles.
- [ ] Add website 0.2.0 to `packages.lock.json`: packageId `b3603f72-990a-408a-b6fc-28764ebabe78`, URL and sha256 from the release's `website.srspkg.sha256` asset. `scripts/ensure-packages.mjs` writes it to `src/lib/packages/<packageId>.srspkg`. (moved from PR A: PR A's tests build their fixture from the release asset, and an unused pin only loads every registry test).
- [ ] The registry entry: `entryTypeId` is the page type `5de26162-…` (`com.mudemocracy.website/homepage`), with `requires` website 0.2.0 by packageId.

**Out of scope:**
- The Menu panel (srs-web#681).
- Guides as pages (holon decision 14).
- Moving the export into core/WASM: srs-rust#1553.
- A live preview of the real site.

---

## Phases

### Phase 1 (PR A): headless site core and export

**Goal:** given the website package, srs-web can find a site's pages, read their blocks through the site's Views, and export them in the shape the muDemocracy site renders.

**Agent:** Web App Worker. **Layer:** headless (ADR-027).

#### Tasks

- [x] Typed wrappers `getComposition`, `getView` and `listViews` in `src/lib/srs-client.ts` (and in `read-only.ts` if it lists bindings).
- [x] (precondition, verified 2026-11-02) `package install --bundle website.srspkg` installs all 16 Views, the `site` Composition and the Theme (81 definitions). The fallback is not needed.
- [x] `e2e/fixtures/build-site-fixture.sh`. With the pinned CLI it creates a repo and installs `website.srspkg` (`package install --bundle`). It then makes three page containers, `home` (published, closing-mark), `about` (published, draft, `layout:essay`) and `scratch` (unpublished), with a hero, a prose block, a faq-group holding two faq-items at depth 1 under `contains`, a guide-section that `uses` a record in a `containerType: guide` container, and a primary-cta with an action-card that `uses` a guide record. It writes `e2e/fixtures/site.srsj`.
- [x] `site-views.ts`: `findSite`, `viewFor`, `offeredTypes`.
- [x] `site-model.ts`: `listPages`, `pageBlocks`, `pageSettings`, `setPageSettings` (tags `published`, `draft`, `closing-mark`, `layout:<name>`; holon decision 18).
- [x] `site-export.ts`: `exportSite`.
- [x] `mudemocracy/guides.ts`: `guideReferences`.
- [x] `tests/layers.test.ts`: the core must not import `site/mudemocracy/`.
- [x] `docs/adr/029-site-editor-shell.md`, status `proposed`.

#### Acceptance Criteria

- [x] `findSite` on `site.srsj` returns the Composition tagged `site`: 15 Views dispatching the 16 block and item types (`hero` and `homepage-hero` share one View); `homepage`, the page root, is not dispatched (its `page-view` is the page's own).
- [x] `listPages` returns the three pages in container order; `pageSettings` reads each state.
- [x] `exportSite(repo, site, guideReferences(repo))` returns the two published pages and leaves out `scratch`:
  - each block carries `view`;
  - brief fields are absent, while keys and settings are present;
  - faq items are grouped under their group;
  - a guide-section has `{guide, section}`.
- [x] `exportSite` throws on two published pages with the same `page_key`, and on a guide-section with no guide record. Each case is tested by mutating the loaded fixture in memory: set `about`'s `page_key` to `home`, or delete the guide-section's `uses` relation.
- [x] `setPageSettings` round-trips through `pageSettings` for each `Publish` value, and keeps an unrelated tag (`foo`) on the container.
- [x] `exportSite(repo, site, guideReferences(repo))` serialised as `JSON.stringify(pages, null, 2)` equals the committed golden `tests/fixtures/site-export.golden.json`. The golden is reviewed once against `content/pages/home.json`'s shape, with the delta above.
- [x] Tests live in `tests/site.wasm.test.ts` (one file: views, model, export, negative cases).
- [x] The layers test fails on a core → `mudemocracy/` import.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

The template's four steps; commit `(#680)`.

### Phase 2 (PR B): the shell

Planned in detail after PR A merges, on the same issue, so that it builds on the merged contract. Its tasks are the PR B scope above. It follows `/ship-web` in full, including dogfooding with muSrs opened from GitHub storage.

---

## Final Acceptance

- [ ] `npm run typecheck`, `npm run lint`, `npm run build` and `npm test` pass (and `npm run e2e` for PR B).
- [ ] WASM loads, and every site call succeeds against `site.srsj`.
- [ ] PR A: the export's output for the fixture matches the golden. muDemocracy.org#415 is gated on PR A merging, and it confirms on real muSrs that the delta is the only difference.

## Coordination Rules

- `srs-web/**` only. muDemocracy changes are muDemocracy.org#415.
- No SRS semantics in TypeScript (ADR-001). A missing capability is a srs-rust issue.
- The core in `src/lib/site/*.ts` never names `com.mudemocracy.*`.

## Assumptions

- The website 0.2.0 bundle contains the 16 Views, the `site` Composition and the Theme (verified with `package export` on muDemocracy.org#420).
- `package install --bundle` installs a bundle's Views and Compositions, not only its types. Check this first in the fixture script, and file it as a srs-rust issue if not.
