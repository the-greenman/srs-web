# ADR-029: The site editor shell: a site's package is the link between block types and components

- **Status:** proposed
- **Date:** 2026-11-02
- **Issue:** [srs-web#680](https://github.com/the-greenman/srs-web/issues/680), part of holon [muDemocracy.org#418](https://github.com/the-greenman/muDemocracy.org/issues/418)
- **Supersedes:** the muDemocracy site-editor prototype's D1 (a separate app), D2 (a local file bridge), D9 (the site tokens imported directly) and the nav part of D19 (`muDemocracy.org/site-editor/DECISIONS.md`)
- **Builds on:** [ADR-001](001-thin-client.md), [ADR-022](022-built-in-views-and-editor-registry.md), [ADR-026](026-nav-order-from-container-entries.md), [ADR-027](027-editor-layers.md)
- **Ruling:** the owner, 2026-11-02 (srs-programme vignettes 4adc5965, 7e87af63): the editor sits fully on srs-web; each website's own package is the link between its types and its components; a site may add its own logic as a prototype toward a generic editor.

## Context

The muDemocracy site editor was a separate Vite app that reached into srs-web's source at a pin and saved through a dev-server bridge. Which component drew a block type, and which fields were editor-only briefs, were string matches repeated in three places: the editor model, the site's export script and its renderer. The two brief lists did not even agree. An editor inside srs-web cannot see a site's code, so that knowledge has to live in data that both the editor and the site can read.

## Decision

1. **A site is the Composition tagged `site`.** Its `rootTypeRefs[0]` is the page type. A page is a container anchored on a record of that type; its blocks are the container's entries in arranged order (ADR-026), and a group's items are the entries it `contains`.
2. **The site's package is the link.** Each site component has one View. `typeDispatch` in the site Composition maps each block type to its View, and that dispatch decides three things:
   - which types the editor offers;
   - the field order;
   - whether a field is on the site (`visible`). An off-site field carries `displayHint`: `brief` (editor-only), `setting` or `key`.

   The site's build maps a View id to its component in one table. A Theme in the package carries the site's look, which the canvas loads.
3. **Page settings are the container's tags:**
   - `published`: the export serves the page;
   - `draft`: with `published`, the page is served but not indexed;
   - `closing-mark`;
   - `layout:<name>` (default `standard`).

   Writes read, modify and write back the tags, and keep every tag they do not own.
4. **Generic core, site layer.**
   - `src/lib/site/*.ts` (`site-views`, `site-model`, `site-export`) names no site.
   - A site's own behaviour lives in `src/lib/site/<site>/`. For muDemocracy that is guide references, and later evidence and authorship.
   - The core never imports a site layer. `tests/layers.test.ts` check 3 enforces this.
   - `src/lib/site/<site>/` is a **temporary home** inside the srs-web bundle, until a site package can carry its own editor layer.
5. **The export is a temporary TS projection.** `exportSite` reads Views, Composition, containers and records and re-decides nothing: brief means the View's `displayHint` is `brief`. [srs-rust#1553](https://github.com/the-greenman/srs-rust/issues/1553) moves it into the core as a structured composition render. Until then it is marked `ponytail:`.

## Rejected

- **Keeping the prototype as a separate app** (its D1). It drifts from srs-web at every pin bump, cannot use App's storage, relays or hosting, and its ideas never reach other editors.
- **A site registry in code** (type → component maps in srs-web). That is a second copy of what the site's package states, and every site would need a srs-web change.
- **Brief fields by name** (the prototype's lists). They disagreed, and a new type needed a code change.

## Consequences

- **Adding a block kind:** the site adds a type, a View and a dispatch entry to its package, plus a component and its specimen in the site. The editor needs no change.
- **muDemocracy:** its site build calls `exportSite` (muDemocracy.org#415) instead of its own script.
- **Pending core work:** srs-rust#1553 will replace the TS projection. Its acceptance test is `tests/fixtures/site-export.golden.json`.

## Editing (amendment, srs-web#680 B1, 2026-11-03)

The `site` editor (`src/lib/site/SiteShell.svelte`, registered for the website package's page type) edits a site's pages through the headless `src/lib/site/site-edit.ts`. Its decisions:

- **E1. Canvas look (owner, 2026-11-03): site tokens, generic layout.** A block shows its View's visible fields in order, the first as its heading (`SiteCanvas`, `SiteBlock`, `SiteText`, specimen on `/styleguide#site`). The site's tokens come from its Theme's remote stylesheet once the engine can read a Theme (srs-rust#1558); until then srs-web's tokens. A `displayHint` for heading or body on visible fields is a later package refinement.
- **E2. Drafts and Bin ids.** Drafts keep the prototype's id, `uuid5("6f1d2c4e-8a3b-5c7d-9e0f-1a2b3c4d5e6f", "<pageContainerId>:drafts")`, because muSrs already holds such containers; the Bin is `areaId(anchorId, "bin")`.
- **E3. A group's items: `contains` says what a group holds, depth arranges it.** `nestItems` repairs depth from `contains`, never the reverse. Blocks move before or after only, never into; an item never leaves its group; a block dropped beside an item lands beside its group.
- **E4. The page type's `page_key` and `page_title`** are an implicit contract of the core (read by `listPages` and the export, written by `newPage`). Declaring them in the page View is a later step.
- **E5. Item types:** "Add item" offers the types of the items a group already holds.
- **E6. No agent write guard** (owner ruling 2026-10-22, srs-web#601).
- **Read-only.** `readOnlyReason` means the document cannot be saved back (it can be exported). The shell still edits, as the other shells do, but makes no open-time repair on such a document.

The muDemocracy layer (evidence, authorship, comments, the agent brief, guide sections by reference) is B2, in `src/lib/site/mudemocracy/`.
