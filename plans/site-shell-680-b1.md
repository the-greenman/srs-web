# Plan: Site editor shell, PR B1: the generic shell (#680)

## Summary

PR A (#683, #684) shipped the headless site core: `findSite`, `listPages`, `pageBlocks`, page settings and `exportSite`. The muDemocracy site build runs it live (muDemocracy.org#415). B1 adds the generic `site` editor on top of it:
- a page list;
- a canvas that draws each block's visible fields in View order, in the site's tokens;
- in-place field edits, and an inspector for the hidden fields;
- add, move, drafts, Bin, undo and page settings.

B1 names no site. **B2** adds the muDemocracy layer (`src/lib/site/mudemocracy/`): evidence and backing, authorship and fork-on-edit, not-a-claim marks, comments, the agent brief, and guide sections shown by reference. Only once B2 reaches parity does `muDemocracy.org/site-editor/` go. Holon: muDemocracy.org#418.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator / Web App Worker | Claude Code (/ship) |
| Verification | Verification subagent after each phase |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | No SRS semantics: moves, depth and validation are the engine's (`$lib/document`) | accepted |
| ADR-022 | One `EDITORS` entry | accepted |
| ADR-027 | Each task names its layer. Site components live in `src/lib/components/` with specimens (precedent: MethodBoard, ProblemCard) | accepted |
| ADR-029 (`docs/adr/029-site-editor-shell.md`; another 029 exists, `029-read-view.md`) | Amended with an "Editing" section recording decisions E1 to E6 below | proposed |

### Decisions

- **E1. Canvas look (owner, 2026-11-03): site tokens plus a generic layout.**
  - The canvas draws fields generically: each is `.site-field.site-field--<name>`, and a block's first visible field reads as its heading.
  - It loads the site's **tokens** from the Theme's remote stylesheet, scoped to the canvas, so fonts, colours and spacing are the site's.
  - The site's Astro CSS is not copied.
  - A `displayHint` for heading or body on visible fields is a later package refinement.
  - B1 ships the srs-web-token fallback: the bindings cannot read a Theme yet (srs-rust#1558). The remote load lands when that does. The URL itself is live (`https://mudemocracy.org/site-tokens.css`).
- **E2. Drafts and Bin container ids stay the prototype's.** muSrs already holds six such containers. Drafts are `uuid5("6f1d2c4e-8a3b-5c7d-9e0f-1a2b3c4d5e6f", "<pageContainerId>:drafts")`; the Bin is `areaId(anchorId, "bin")`. The principle is *successor over overwrite*: no migration of existing data.
- **E3. A group's items are two records of one fact** (owner ruling D3). `contains` says what a group holds; outline depth arranges it. `nestItems` repairs the depth from `contains`, never the reverse. A block dropped beside an item lands beside its group.
- **E4. The page type's `page_key` and `page_title` are an implicit contract** of the core, which reads them and which `newPage` writes. It is noted in ADR-029, and declaring it in the page View is a later step.
- **E5. Which item types a group takes:** "Add item" offers the types of the items the group already holds. An empty group cannot get items yet. Declaring this in the package is a later step.
- **E6. No agent write guard** (owner ruling 2026-10-22, srs-web#601). Agents attach through App's dock.

## Contracts

- **WASM:** no new bindings. srs-rust#1558 (`get_theme`) does not block B1.
- **Package pin:** add to `packages.lock.json`: `{ packageId: "b3603f72-990a-408a-b6fc-28764ebabe78", name: "website", version: "0.2.0", url: "https://github.com/the-greenman/srs-web/releases/download/packages-website-0.2.0/website.srspkg", sha256: "c387a8a4e69c6efd5eb6c1418267680e0bb400d8b5b32a9cc412d2361810c6e0" }`.
- **Page type id:** `5de26162-3fd5-4fc9-b32e-567db46bb552`.

## Scope

**Out of scope:** B2 (above), the Menu panel (#681), duplicate page, and loading the remote Theme (srs-rust#1558).

**What replaces the prototype (reuse, not copy):**

| Prototype | srs-web |
|---|---|
| App.svelte | `SiteShell.svelte`: AppShell, Main, Toolbar (shell-actions), Inspector, Panel, Nav/NavItem, Notice |
| session.svelte.ts | App's storage, save and `documentRevision`; `DocumentHistory` and `snapshotDocument` |
| model.ts: pages, settings, publish | PR A's `site-model` and `site-views` |
| model.ts: nestItems, beside, swapIn, drafts, bin, alternatives, addBlock, addPage, setField | `src/lib/site/site-edit.ts` over `$lib/document` |
| BlockView.svelte | `SiteBlock.svelte` rows in `BlockStack` (`essay-model.outsideRun` for drop targets) |
| FieldText.svelte | `SiteText.svelte` (plain text, no sentence segments) |
| Inspector.svelte | the `Inspector`, `Panel`, `Field`, `Input`, `Select`, `Checkbox`, `TrayRow` and `Button` components |
| Drafts and Bin UI | `DraftTray` and `BinTray` |
| Add-block picker | `ActionMenu` |
| styles.css | `src/styles/components/site.css` (srs-web tokens, `site-` classes) |

## Phases

Everything already in PR A's core is reused by name: `findSite`, `viewFor`, `offeredTypes` and `briefFields` (site-views); `listPages`, `pageBlocks`, `pageSettings` and `setPageSettings` (site-model); `exportSite`. B1 adds no second copy of any of them.

### Phase 1: pin, `newPage`, registry (S). Layers: headless and screen wiring
- [x] Add the lock entry (sha256 checked against the release's `website.srspkg.sha256`, 2026-11-02), then run `node scripts/ensure-packages.mjs`.
- [x] **`src/lib/site/site-edit.ts`: `newPage(repo, site, title, key): PageRef`.** It creates the anchor record of `site.pageTypeId` with `page_key`/`page_title` (E4), and a container anchored on it with that record as its first entry (as `newEssay` does).
- [x] **In `registry.ts`, add:**
  - `id: "site"`, label `"Site"`, `entryTypeId: "5de26162-3fd5-4fc9-b32e-567db46bb552"`;
  - `requires`: website 0.2.0, by packageId;
  - `create: (repo) => { const s = findSite(repo); if (!s) throw new Error("the website package has no site Composition"); newPage(repo, s, "Home", "home"); }` (the `site` Composition ships in the bundle, so it exists once the package is installed);
  - `component: SiteShell`.
- [x] `src/lib/site/SiteShell.svelte`: a placeholder with AppShell and Toolbar.
- [x] `e2e/helpers.ts`: add `"site"` to `openPackageEditor`.

**Tests** (`tests/site-edit.wasm.test.ts`):
- [x] `bundledPackage("b3603f72-…")` is non-empty.
- [x] `creatableEditors()` includes `site`.
- [x] On a blank repo, install the bundle, then `create`: `listPages` shows one page with key `home`.
- [x] `site.srsj` offers `site`.

### Phase 2: headless editing (M). Layer: headless
- [x] **Spike first:** on `site.srsj` through the real engine, call `moveEntry` (relative), `transfer` and `deleteFromBin` once each, and confirm `npm test` runs `*.wasm.test.ts`. If any fails, stop and file it.
- [x] **Extend `e2e/fixtures/build-site-fixture.sh`** and regenerate `site.srsj` (validate: 0 errors):
  - `home` gets a drafts container (E2 id) holding a draft faq-item that is `derived-from` the home faq-item `q1`, plus a draft hero `derived-from` nothing;
  - one home prose block is also a member of a second container, a plain container titled "Shared prose" (not a page);
  - the Bin starts empty.

  Keep `tests/fixtures/site-export.golden.json` green (drafts are not on the page).
- [x] **`src/lib/site/site-edit.ts`** (no `.svelte` import, no `document`). Moves are `$lib/document` calls; nothing re-implements them.
  - `draftsIdFor(page)` and `binIdFor(page)`. The drafts id is `uuid5("6f1d2c4e-…", "<containerId>:drafts")`; a comment says why it differs from `areaId` (E2: existing muSrs data). The Bin id is `areaId(anchorId, "bin")`.
  - `ensureAreas(repo, page): void` creates both with `ensureContainer`.
  - `snapshotPage(repo, page): DocumentSnapshot` is `snapshotDocument(repo, [page.containerId, drafts, bin], [page.anchorId])`.
  - `nestItems(repo, containerId): boolean` puts each item at depth 1 under the group that `contains` it. It never promotes an item to a group and changes nothing when already nested (E3).
  - `moveBlock(repo, page, id, target)` is `moveEntry`. A drop beside an item resolves to beside its group (E3).
  - `toDrafts`/`fromDrafts`/`toBin`/`fromBin` are `transfer` between the page and its areas, carrying a group's run.
  - `swapIn(repo, page, draftId, slotId)`: the draft takes the slot's place, `contains` included for an item, and the slot goes to drafts.
  - `deleteForever(repo, page, id)` is `deleteFromBin` with `keep` = records that are in another container or that something is `derived-from`. It refuses outside the Bin.
  - `alternativesFor(repo, page, blockId): string[]` lists drafts in the block's `derived-from` lineage, in either direction.
  - `addBlock(repo, page, typeKey, target?): string`: the key field (hint `key`) is `<typeName>-<n>`.
  - `addItem(repo, page, groupId, typeKey): string` and `itemTypes(repo, page, groupId): string[]` (E5).
  - `setField(repo, id, name, value)` writes through `updateRecord`.
- [x] **Undo is headless.** `DocumentHistory` over `snapshotPage` (the essay's `essay-history.ts` wraps the same class; reuse `DocumentHistory` directly). The shell only calls `push`/`undo`/`redo`.

**Tests** (`tests/site-edit.wasm.test.ts`):
- [x] Moving a group carries its items.
- [x] An item never leaves its group.
- [x] A block dropped beside an item lands beside the group.
- [x] `toBin` carries a group's items, and `fromBin` restores them.
- [x] `fromDrafts` carries a group.
- [x] `swapIn` for the derived draft faq-item takes `q1`'s place, `contains` included.
- [x] `alternativesFor(q1)` lists that draft.
- [x] `deleteForever` keeps the shared prose and refuses a block outside the Bin.
- [x] `DocumentHistory` undo after `toBin` restores the page, and undo after `setField` restores the field.
- [x] `nestItems` is idempotent and never promotes an item.
- [x] `binIdFor(page) === areaId(anchor, "bin")`.
- [x] The About page's note member is not a block, and the note-anchored container is not a page.

### Phase 3: components and specimens (M). Layer: components
- [ ] **`src/lib/components/SiteText.svelte`:** props `value: string`, `label: string`, `multiline?: boolean`, `readonly?: boolean`, `oncommit(value)`. It uses `contenteditable="plaintext-only"`, commits only after typing, Esc reverts, and reads the text from DOM nodes.
- [ ] **`src/lib/components/SiteBlock.svelte`:** props:
  - `typeLabel: string`;
  - `fields: { name: string; label: string; value: unknown; editable: boolean }[]`;
  - `brief: { label: string; value: string }[] | null`;
  - `selected: boolean`;
  - `onselect()` and `onedit(name, value)`;
  - `children` (its items).

  The first field reads as the heading (E1). A value that is not a string renders as a muted "edited elsewhere" note.
- [ ] **`src/lib/components/SiteCanvas.svelte`:** `div.site-canvas` with `children`, styled by srs-web tokens. There is no remote stylesheet in B1 (E1: it comes with srs-rust#1558).
- [ ] **`src/styles/components/site.css`:** every class starts with `site-`.
- [ ] **Specimen `src/styleguide/SiteSpecimen.svelte`**, mounted in `src/Styleguide.svelte`. It mounts all three components (`<SiteCanvas`, `<SiteBlock`, `<SiteText`): a hero, a group with 2 items, the brief shown, a selected block and an empty field.

**Acceptance:**
- [ ] `tests/layers.test.ts` passes with no new baseline entries.
- [ ] The styleguide e2e passes.

### Phase 4: the shell (L). Layer: screen
- [ ] **`SiteShell.svelte`:**
  - On open: `nestItems` runs only when `!readOnlyReason`, mirroring `loadEssay(…, { repair: !readOnlyReason })`.
  - Nav: `listPages` and New page.
  - Canvas: a `BlockStack` of `SiteBlock` rows. Drop targets use `outsideRun` over `getContainerOutline(repo, page.containerId).body` (the entries without the anchor, as `snapshotDocument` reads them).
  - Toolbar: Show briefs, Undo/Redo, and Ctrl-Z / Ctrl-Shift-Z.
  - Inspector, block selected: its hidden fields that are not brief; `alternativesFor` with Swap in; Move to drafts; Move to bin; Add item (`itemTypes`).
  - Inspector, no block selected: page settings through PR A's `setPageSettings` (publish `no`/`draft`/`yes`, closing mark, layout), and the page's own fields.
  - Panels: Drafts (`DraftTray`) and Bin (`BinTray`; Delete forever asks to confirm, then `history.clear()`).
  - Add block: an `ActionMenu` over `offeredTypes(site)`.
  - Writes: one `run(fn: (repo) => void): void` calls `ensureAreas`, takes `snapshotPage` before the write, runs `fn`, pushes the snapshot to the history, then calls `onDocumentMutation`.
- [ ] **Help:** create the container `site` in srs-web's `help/` repository through the `srs` CLI. It holds `ui-feature` records for `site.pages`, `site.canvas`, `site.add-block`, `site.brief`, `site.inspector`, `site.page-settings`, `site.drafts` and `site.bin`, each a string-literal `data-feature` on a pass-through element.
- [ ] **Amend `docs/adr/029-site-editor-shell.md`** with an "Editing" section covering E1 to E6, including E3's direction (depth is repaired from `contains`, never the reverse).
- [ ] **`e2e/site-editor.spec.ts`:** open; edit a headline and save; Show briefs; add a block; drag the faq group (its items follow); toDrafts → Swap in; Bin → Restore → Delete forever; Ctrl-Z; publish → draft writes the tags; a phone width.

**Acceptance:**
- [ ] `tests/help-contract.test.ts` passes.
- [ ] e2e passes.
- [ ] e2e: a read-only link (`readOnlyReason`) shows the page with no edits possible.
- [ ] *Manual dogfood:* muSrs opened from GitHub storage shows its pages and existing drafts, and writes nothing on open beyond the `nestItems` repair.

### Milestone gate (every phase)
- `npm run typecheck && npm run lint && npm run build && npm test`, which includes `tests/layers.test.ts`.
- Phases 3 and 4 also run `npm run e2e`.
- Commit with `(#680)`.

## Final Acceptance
- [ ] All gates and e2e are green.
- [ ] `grep -rn "mudemocracy" src/lib/site/*.ts src/lib/components/Site*` finds nothing (the registry's `requires` is the one exception).
- [ ] `exportSite` still matches the golden.

## Assumptions
- The pinned bindings can create a record in a container and move a member relative to another (the essay editor does both).
- About 1,200 lines plus tests, over 3 to 4 sessions. B1 may ship as one PR, or as Phases 1 and 2 first, then Phases 3 and 4.
- B1 ships as two PRs: the headless edits (`newPage` and Phase 2) first; then the registry entry, the website pin and Phases 3 and 4 together, so "Site" is never offered with only a placeholder shell (review, 2026-11-03).
