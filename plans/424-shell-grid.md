# Plan: Shell grid, Wide, drawers (#424)

## Summary

Phase 5 of story muDemocracy.org#282 (epic #224). Four editors each own a different page frame today: `AppShell` (Governance, Guides; document-scroll with `position: sticky; height: 100vh` nav and inspector), `GenericSrsShell` (own 17rem/22rem grid, scoped styles, `.editors-mobile`), `EssayShell` (no `AppShell`; own `.essay-shell__grid`, sticky `.panel-rail`, 46rem/72rem caps). The result: the nav scrolls the whole page (clicking the last nav item scrolls `window`), widths are five unrelated numbers, each shell has its own 480/600/720/900 collapse, and phones have no way to open a nav at all.

This plan makes `AppShell` the one frame: a `height: 100dvh; overflow: hidden` grid whose columns each scroll, resizable and persisted nav and inspector, one persisted **Wide** switch (reusing `margin-mode.ts`, `data-margin`), and one phone mechanism (hamburger nav drawer, inspector drawer with an activity badge). All four shells adopt `Toolbar` and the shared frame, and their scoped styles move to tokens.

Presentation and client-side composition only. No SRS semantics in TS (ADR-001). No new WASM method. No spec change.

Required-scope sources, all covered: the #424 brief; owner comments (a) small screens, (b) the margin column needs room (Wide widens it), (c) margin flow open question (decided D3: PR-C, separate plan), (d) Wide reuses the margin setter.

## PR split (decided, D1)

| PR | Branch / issue | Contents | Ships green because |
|---|---|---|---|
| **PR-A** (this branch) | `feat/424-shell-grid`, PR body `Refs #424` (never `Closes`) | Phases 1-6: tokens + state, AppShell grid + independent scroll + resize, Drawer + triggers, Essay and Generic onto AppShell, Generic onto Toolbar, Wide toggle in Essay and Generic, e2e. | Governance and Guides stay on `Topbar`; the new AppShell grid, scroll and drawer triggers reach them for free (the Topbar renders the triggers itself), so every editor is correct on phone after PR-A. Their old `Workspace wide` / `record-form--wide` paths are untouched. |
| **PR-B** | a NEW branch from `main`, created only after PR-A merges; PR body `Closes #424` | Phases 7-10: Governance and Guides onto Toolbar, Wide toggle there, scoped styles to tokens (dark blocks per D2), delete `Workspace wide` / `.canvas--wide` / `record-form--wide` / `.canvas` 820px, `href="#"` bug, extend the token scan to shells, final e2e. | Mechanical per-shell conversions on the finished frame. |
| **PR-C** | srs-web#436 (blocked by #424), own plan | Margin flow (borrow free space), after Wide lands. Not delivered by this plan. | n/a |

Why PR-A holds Generic's Toolbar: Generic moves onto `AppShell` in PR-A and its header and nav-foot actions are rebuilt there anyway; adopting the Toolbar later means editing that header twice (the reason #423 D1 gave). Why Gov and Guides wait: they already sit on `AppShell` and each is a 330/246-line scoped style block plus 1000+ lines of markup with many e2e dependencies; they are the risky half and benefit from a green frame under them. PR-B stays under #424 (acceptance (a)-(d) is one issue and the Wide-in-every-shell e2e only completes there); PR-C becomes a new sub-issue because it is an independent design question (D3) and #422 is closed.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrating session |
| Web App Worker | Sonnet subagent (phases in order, one PR at a time) |
| Verification | Haiku subagent (after each gate and before each PR) |

See [agents.md](agents.md).

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client. Layout state is presentation; nothing here touches SRS semantics. | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | New parts and tokens are skin API; every state is a `/styleguide` specimen. Its "known limit" (unlayered scoped dark blocks beat the `theme` layer) is closed by PR-B. | accepted, consequence closed in PR-B |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | Tokens on `:root`, `data-part` tables, one breakpoint source, Popover model. Amended in Phase 3: part (i) "Shell frame, Drawer, Wide" (parts and tokens for `AppShell`, `Drawer`, `ResizeHandle`; the breakpoint roles after the 480/600/720/900 collapse) and part (h) (`trail` slot and `data-part="trail"`; "View > Wide drives `wide.ts`" replacing "View > Margin notes drives `margin-mode.ts`") and part (g) ("the text column widens with Wide (owner D5, 2026-10-04)", replacing "the text column keeps its width"). | accepted, amended |

Owner decisions D1-D5 (2026-10-04) are recorded in the table under "Decided by owner 2026-10-04" at the end of this plan.

No new ADR file. Wide is the existing margin setter (ADR-020 g), renamed `saveWide` (same storage key), widened to mean "Wide"; the amendment records that. It also records that `Drawer` is a second top-layer primitive, justified by modality (inert background, focus trap): Escape and focus return match `Popover`; light-dismiss is a backdrop-click handler (a modal dialog has none natively); `Drawer` is the only `showModal` user. `GitSaveModal` and `SuccessorModal` stay z-index divs owned by #428 and are not touched.

## Gate command

Every milestone gate runs this one form, then the phase's own e2e line:

```bash
npm ci && npm run fetch-bindings && npm run typecheck && npm run lint && npm test && npm run build
```

Manual check, not automatable here (noted once, applies to every drawer phase): iOS Safari virtual-keyboard behaviour inside a drawer form field (dialog stays in view, background does not scroll).

## Contracts

### WASM API surface

**No** new or changed WASM methods.

### TypeScript types (new, all presentation)

- `src/lib/shell-context.svelte.ts` (`.svelte.ts` because it holds `$state`): `ShellState` (Svelte 5 `$state` class) `{ wide: boolean; navOpen: boolean; inspectorOpen: boolean; navWidth: number; inspectorWidth: number; inspectorBadge: number; toggleWide(): void }`, set by `AppShell` via `setContext`, read with `getShell()`. `getShell()` is undefined-safe (returns `undefined` outside an `AppShell`, so a standalone `Topbar` or `Toolbar` renders no triggers); `setShell` is called during `AppShell` script init (before any child renders), asserted in `tests/AppShell.test.ts`. `wide` is the one Wide state, persisted only through `saveWide` (the ONE setter); there is no second key.
- `src/lib/wide.ts` (replaces `src/lib/margin-mode.ts`, which is deleted; the only importer is `EssayShell.svelte`): `loadWide(): boolean` / `saveWide(w: boolean): void`. **In code there is ONE state, named Wide.** The storage key stays `srs-web.margin` (values `expanded` / `compact`) so existing viewers keep their setting; `data-margin` stays the CSS hook with values `compact | expanded`, documented as "Wide". Consequence, by design: "margin expanded without Wide" and "Wide with compact notes" cannot exist (the one exception is the `max-width: 720px` guard, where there is no room for either).
- `src/lib/native-support.ts` (tiny, shared): `supportsPopover()` and `supportsModal()` feature guards; `Popover.svelte:62` is refactored to use `supportsPopover()` and `Drawer` uses `supportsModal()` (one guard, not two inline copies).
- `src/lib/columns.ts`: `loadColumns(): { nav: number; inspector: number }` / `saveColumns(c)` (localStorage `srs-web.columns`, try/catch, defaults and min/max read from the tokens via computed rem to px), pure `clampColumn(kind, px)`. **Global by design**: one width pair for every editor and repository, like Wide; per-editor widths are not wanted.
- `src/lib/components/shell-actions.ts`: holds ONLY the actions shared by every shell, today `wideAction`; each shell keeps its own registry (`essay/header-actions.ts` for Essay, a registry file per other shell) and spreads the shared ones in, so no shell imports another's registry. `wideAction(shell): ToolbarAction` = `{ id: "wide", group: "view", kind: "toggle", checked: shell.wide, label: "Wide", testid: "margin-variant", run: shell.toggleWide }` (`toggleWide` calls `saveWide`). Every shell's registry spreads it (one definition, `margin-variant` kept, see the selector table).
- `breakpoints.ts`: delete `genericNarrow` (600) and `genericStack` (900); keep `phone` 480 (Toolbar tier, margin marks), `form` 640 if still used after PR-B (the drift guard decides), `compact` 720 (**drawer breakpoint: nav drawer at and below**), `rail` 960 (Toolbar compact tier), `wide` 1100 (**inspector drawer at and below**). Export `DRAWER_NAV = "(max-width: 720px)"` and `DRAWER_INSPECTOR = "(max-width: 1100px)"` built from `BREAKPOINTS`, matched in `tests/breakpoints.test.ts` like `RAIL`.
- `AppShell` props: `nav?`, `main`, `inspector?` (all Snippets), `wide?: boolean` (the shell has the Wide toggle; default false), `inspectorBadge?: number`, `navLabel?: string`, `inspectorLabel?: string`. `main` receives nothing; the triggers are components (`NavTrigger`, `InspectorTrigger`) that read the shell context, placed by the Toolbar: `NavTrigger` in `lead`, `InspectorTrigger` in a new `trail?: Snippet` (rendered last in the bar, after the menus; a Toolbar change: header and parts list in `Toolbar.svelte`, `.toolbar__trail` in `src/styles/components/toolbar.css`, a `Toolbar.test.ts` case, a `ToolbarSpecimen` update), or auto-rendered by `Topbar` (until PR-B removes it from the last two shells): in the `.topbar` flex row `NavTrigger` is the first child and `InspectorTrigger` the last (after `.topbar__actions`, which keeps `margin-left:auto`).

## Investigation results (these gate the plan)

### 1. Per-shell inventory

| | EssayShell | GenericSrsShell | GovernanceShell | GuidesShell |
|---|---|---|---|---|
| File (lines) | `essay/EssayShell.svelte` 673; `styles/components/essay-shell.css` 125 | `generic/GenericSrsShell.svelte` 666 | `governance/GovernanceShell.svelte` 1680 | `guides/GuidesShell.svelte` 1087 |
| Frame today | **Not on `AppShell`.** `.essay-shell` (`min-height:100vh`) > Toolbar > `.essay-shell__grid` (`1fr var(--rail-width)`, cap `calc(72rem + margin delta)`) > `<main class="essay-shell__page">` (cap `--essay-page-width` 46rem + margin delta) + `<aside class="panel-rail" data-testid="rail">` (sticky, `panel.css:10`). No nav column | Own grid `17rem 1fr 22rem`, `min-height:100dvh`; `.generic-nav`, `.generic-main`, `.generic-inspector` (scoped, not `AppShell`) | `AppShell > Nav, Main(Topbar, Workspace), Inspector` | `AppShell > Nav, Main(Topbar, Workspace wide), Inspector open={previewOpen}` |
| Header / actions | `Toolbar` already (#423): Document/View/Go/Help menus, Save primary, `lead` empty | Per-view `<header>` (title + `full-preview-toggle`), nav-foot buttons Save/Export/Open another + `read-only-note`, dirty status | `Topbar`: crumb + `button.topbar__new` ("New X", disabled while saving), size-warning text; migrations view a second `Topbar` | `Topbar`: crumb + Save (`save-document`), dirty/readonly/save status, Export .srs (`guides-export-btn`), Export .srsj, Open another file, `guides-preview-toggle` |
| Nav | none (essay picker is a `Select` in the Toolbar title slot; #425 owns the picker/NavTree) | hand-rolled sections: Documents, Structure (tree + toggles), Explore, Package editors (`package-editor-*`) | `Nav`/`NavGroup`/`NavItem href="#"` wrapped in click `div`s (the `#` jump) | same, `NavItem` without href (`href="#"` default), plus `guides-guide-list`/`guides-guide-item`, footer `guides-new-guide` |
| Inspector / rail | the rail: Layers, Draft, Bin, PinnedPane, Agents panels | record fields + `InstanceNotes` (+ `SectionForm wide` when editing) | `Inspector` Panels (record meta, lifecycle `.inspector__*`, validation, relations) | `Inspector` Panels (View, Notes, Export, Theme, Preview) |
| Scoped `<style>` | none (CSS in `styles/`) | 53 lines (`:614-666`), 26 lines with hex colours, 1 dark-free | 330 lines (`:1351-1680`), 15 lines with raw colours or `var(--x, #hex)` fallbacks | 246 lines (`:842-1087`), 30 lines with raw colours or fallbacks |
| `prefers-color-scheme: dark` | none | none | 1 block, `:1673`, **only `.size-warning-banner`** | 1 block, `:1079`, **only `.size-warning-banner`** |
| Own breakpoints | `essay-shell.css`: 721 (margin), 960 (grid stacks), 720, 480; `Block`/`margin.css` 480 | 900 (inspector under main), 600 (`display:block`, hide nav sections, show `.editors-mobile`) | none of its own; `layout.css` 1100 (inspector `display:none`), 720 (single column, nav static) | `:1058` `min-width:1101` (hides `guides-preview-toggle`); inherits layout.css |
| Move onto AppShell + Toolbar means | Add `AppShell` (nav omitted until #425: no hamburger, the rail is the inspector drawer); delete `.essay-shell__grid`, `.panel-rail` sticky, 100vh; Toolbar `lead` gets `NavTrigger` only when a nav exists, plus `InspectorTrigger` (badge = unseen agent events). View menu: the existing `margin-variant` item becomes the shared Wide item | New `AppShell` with `Nav` for sections (reuse `NavGroup`/`NavItem` look via tokens), `Inspector` for the record, Toolbar replaces header + nav-foot (Save primary, Document menu: Export, Open another; View: Full preview, Wide). Editor picker lives in the nav so `.editors-mobile` and the 600/900 rules die | PR-B. Topbar `crumb` becomes the Toolbar `title`/breadcrumb snippet; "New X" is the single primary; migrations header likewise | PR-B. Crumb to Toolbar title; Save is the primary; Export/Open another/Export .srsj to Document menu; `guides-preview-toggle` is replaced by the shell's inspector trigger (drop `previewOpen` and `Inspector open`) |

Shared facts: `layout.css:14-16` `.app{min-height:100vh}`; `nav.css:18-19` and `inspector.css:14-15` `height:100vh; position:sticky`; `inspector.css:57-66` `.inspector--open` fixed overlay (Guides-only toggle, deleted); `Inspector.svelte:21-42` is the only resize code (inspector only, not persisted, `--inspector-width` set inline on `.app`); `nav.css:17-20` also applies `filter:url(#ink-surface)` to the whole nav (a filtered element is a containing block and a new stacking context: the drawer must not inherit it). `App.svelte:928-935` renders the floating agent dock (`.mcp-dock`) for every shell except those with `hostsAgentPanel`; it must not cover a drawer (z-index below `--z-overlay`, checked in e2e).

### 2. Dark mode (decision D2)

The app is light-only today: `tokens.css:15` `color-scheme: light`, and no other stylesheet in `src/` has a `prefers-color-scheme` rule. The two scoped dark blocks restyle **one element each**, `.size-warning-banner`, to `#fde68a` text on a 12% amber wash. Under the light page that is yellow-on-paper, i.e. the blocks are a latent contrast bug for dark-OS users, not working dark mode. Removing them loses nothing real. They also beat the whole `@layer` cascade (ADR-019 known limit) so they would defeat any later theme. The banner collapses onto a `--banner-*` component token set (warn tokens, light values).

### 3. Margin flow (decision D3, comment (c))

Current: each `Block` has a three-column grid (`block.css:42`); the margin is a grid cell; `AnnotationMargin.svelte:56-78` measures once (`fit`) against `.block__main` height with one `ResizeObserver` (`:88-93`) and `+N` the rest (`n >= 1` always shows one row).

- **Clip-to-fit (now):** per-block, local, no coordination. Fails for a one-line paragraph with several notes: one row plus "+N".
- **Flow, "borrow free space" (decided D3):** keep the margin in the block's grid cell, but make the budget `H = top(next block that has annotations) - top(this block)` instead of the paragraph's own height; the margin cell gets `overflow: visible` and the rows may extend over following annotation-free blocks' margin cells. No pairwise collision resolution is needed because the budget stops at the next annotated block. Cost: `AnnotationMargin` must observe the stack, not only `.block__main` (the next blocks' positions move when any block resizes or folds): one `ResizeObserver` on the block-stack container, one `measure()` that reads sibling `.block` tops. `.block` rows keep stacking context so the overflow does not intercept clicks on the next block's text (the margin cell is already a separate column, so it never overlaps text). About 60-80 lines in `AnnotationMargin` plus 10 CSS, plus unit tests (`AnnotationMargin.test.ts`: budget from a stubbed next-block top) and one e2e. Risk: layout feedback loop (a flowing margin does not change block height because it overflows visibly: no loop).
- **Full Tufte (notes keep their ideal Y, push down on collision, stay anchored):** a margin-layer component owning every block's notes in one absolutely positioned column, a layout pass (sort by anchor Y, `y = max(anchorY, prevBottom + gap)`), re-run on any resize, fold, zoom, drag or comment-thread expansion, plus connector affordance so the reader sees which paragraph a pushed note belongs to (the existing "paragraph outlined while its row is hovered" rule at `margin.css:96-99` helps). About 250-350 lines, moves rendering out of `Block`'s grid cell (so `block.css:42` and `Block.svelte`'s `margin` snippet change), changes tab order and the hover-outline contract, and the 480px inline-marks layout needs a separate path. High risk, no e2e foothold. Not recommended.

Decided (D3): borrow-free-space flow, in its own PR (PR-C, srs-web#436, own plan; not in this plan), after the frame and Wide land, because the width semantics (D5) and `--margin-width-wide` sizing from Phase 2 decide how many rows fit. Clip-to-fit stays the default until then.

### 4. Existing facts the plan relies on

- `margin-mode.ts` (to be replaced by `wide.ts`) is the one setter; `EssayShell.svelte:212-214` holds the state and sets `data-margin` on `.essay-shell`; `essay-shell.css:35-39` widens the column only above 720px.
- `Popover.svelte` is native `popover` (top layer, light dismiss, Escape, focus return) with **no focus trap**. A drawer needs a trap; native `<dialog>.showModal()` provides trap, inert background, Escape and focus return, so `Drawer` is a thin `<dialog>` wrapper with the same dismissal rules (backdrop click, Escape, focus returns to the trigger). happy-dom lacks `showModal`: feature-guard like `Popover` (class + inline display fallback).
- `Toolbar.svelte` already has `lead?: Snippet` and tiers from `NARROW`/`RAIL`. Its header comment (`:9`, "a shell's nav hamburger goes in the `lead` snippet") and parts list (`:14`, `bar lead title status primary menu overflow`) go stale: Phase 3 adds `trail?: Snippet`, rewrites both, and adds `data-part="trail"`.
- `tests/styles-tokens.test.ts` scans `src/styles/**` and `src/lib/components/*.svelte` only; shell `<style>` blocks are out of scope today (README line 36 says "until #424").
- e2e that touch the frame: `mobile-layout.spec.ts`, `mobile-open-editor.spec.ts` (both open the essay via `package-editor-mobile-essay`), `annotation-margin.spec.ts` (`rail` bbox, 1920/1280/390), `guides-editor-width.spec.ts` (`record-form--wide` x3, 1400/800), `navigation.spec.ts`, `essay-*`, `lifecycle.spec.ts` and `decision-flow.spec.ts` (`button.topbar__new`, `.inspector__*`), `create-document`/`export-import`/`editor-mode` (`getByRole("button",{name:"Open another file"})`).

### Selector disposition

**Rule (as #421/#422/#423):** each changed selector has one fate, re-pointed in the same commit as the markup. No aliases. Testids and accessible names are kept unless listed.

| Selector | Used by | Fate | Becomes |
|---|---|---|---|
| `generic-srs-shell`, `guides-shell`, `package-editor-<id>`, `generic-file-picker` | helpers, many | **kept** | unchanged. `package-editor-*` buttons move from the Generic nav section to the same snippet inside the nav (drawer on phone) |
| `package-editor-mobile-<id>`, `.editors-mobile` | mobile-layout:16, mobile-open-editor:15 | **deleted** (one picker, in the nav) | specs use new helper `openNavDrawer(page)` (`e2e/helpers.ts`, no-op above 720px) then `package-editor-<id>` |
| `.app`, `.app__nav`, `.app__main`, `.app__inspector` | CSS only | **kept** (classes), rules rewritten | grid; `.app__main` is a flex column with `overflow:hidden` (bar first, then ONE scroller) |
| `data-margin` carrier `.essay-shell` | annotation-margin:34,35,41,64,95; `tests/EssayShell.test.ts:206` | **re-point to `.app`** in the same commit (ONE carrier; no second attribute on `.essay-shell`) | `page.locator(".app")`; `.essay-shell__page` reads the custom properties by inheritance from `.app` |
| `.workspace` (own `overflow-y:auto`) | CSS only | **kept, and it is THE scroller** (`flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain`); the bar sits outside it | Essay uses `<div class="workspace">` around `.essay-shell__page` (no `.canvas`) |
| `.canvas`, `.canvas--wide`, `Workspace wide` prop | Guides `Workspace wide` | **deleted in PR-B** | `.canvas { max-width: var(--content-max) }`; Wide is the token, not a class |
| `record-form--wide`, `wide` prop on `RecordForm`/`SectionForm`/`BlueprintDocumentEditor` | guides-editor-width:43,65,110; Generic, Guides | **deleted in PR-B** | `.record-form { max-width: var(--content-max) }`; guides-editor-width re-points to "form width equals `.canvas` width and widens with Wide" |
| `.nav` `height:100vh; position:sticky`, `.inspector` same, `.panel-rail` sticky, `.essay-shell` `min-height:100vh`, `.app` `min-height:100vh` | CSS only | **deleted** | grid height + column `overflow-y:auto` |
| `.inspector--open`, `Inspector open` prop, `guides-preview-toggle` | Guides only (no spec asserts it) | **deleted** | the shell's `InspectorTrigger` (`data-testid="inspector-trigger"`) |
| `.inspector__drag-handle` | CSS only | **re-point** | shared `ResizeHandle` (`data-testid="nav-resize"` / `"inspector-resize"`, `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`, arrow keys) |
| `.inspector__*` (transitions, btn, kv...) | lifecycle.spec | **kept** | unchanged (Governance inspector internals) |
| `.topbar`, `.topbar__crumb*`, `.topbar__actions` | Gov/Guides CSS | **kept in PR-A** (Topbar renders the triggers), **deleted in PR-B** when the last user converts | `.toolbar` |
| `button.topbar__new` | decision-flow:40,51,86; lifecycle (x6); guides-editor-width:90 | **re-point in PR-B** | `getByTestId("governance-new-record")` (the Toolbar primary of Governance; same text "New <section>") |
| `getByRole("button",{name:"Open another file"})` | create-document:104, export-import:123, editor-mode:75 | **re-point in PR-B** (Guides/Gov Go menu); Generic has no e2e lookup (only `tests/GenericSrsShell.test.ts`) | `openAnother(page)` helper (`e2e/helpers.ts`): `openMenu(page,"Go")` then `getByTestId("toolbar-other")` (the existing Go-menu item, `essay-toolbar.spec.ts:102`); no new testid |
| `save-document` | many | **kept** (Toolbar primary testid) | unchanged on all four shells |
| `guides-export-btn`, `guides-export-markdown`, `guides-export-print`, `guides-theme-picker`, `guides-new-guide`, `guides-guide-item`, `guides-guide-list`, `guides-section-*`, `readonly-reason`, `save-status`, `read-only-note` | guides specs, generic specs | **kept** | testids move with the element; `guides-export-btn` becomes the Document-menu item testid |
| `document-dirty-status` | many | **kept** | Toolbar `status` snippet (Generic, Gov, Guides adopt the Essay pattern) |
| `margin-variant` | EssayShell.test, annotation-margin:40,63,94 | **kept** as the testid of the one shared **Wide** item (View menu); label "Margin notes" becomes "Wide"; `aria-checked` and `data-margin` assertions unchanged | |
| `rail` (`data-testid` on the essay `aside`) | annotation-margin:45 | **kept** | now inside the inspector drawer/column |
| `toolbar` bbox height < 72 | mobile-layout:49 | **kept** | unchanged |
| `--rail-width` | `tokens.css:108`, `essay-shell.css:26`, `Styleguide.svelte:403`, `styleguide/Frame.svelte:3`, `styles/README.md:27` | **deleted** (replaced by `--inspector-width`, set to `20rem`) | `Styleguide.svelte` Frame width and caption ("Inspector 20rem"), Frame header comment and README row re-pointed in Phase 1 |
| `.essay-shell__grid`, `.essay-shell__page`, `.panel-rail` sticky | essay-shell.css; specs use `.essay-shell__page` (mobile-layout:34,41) | `__grid` **deleted**, `__page` **kept**, `.panel-rail` sticky **deleted** | `__page` max width is `var(--content-max)` plus margin delta |
| `details.panel` "starts collapsed" at 390 | mobile-layout:38 | **re-point** | panels live in the closed drawer; assert they are collapsed after opening it |
| new testids | PR-A/B | **new** | `nav-trigger`, `inspector-trigger`, `inspector-badge`, `shell-drawer-nav`, `shell-drawer-inspector`, `nav-resize`, `inspector-resize`, `governance-new-record` |

Affected specs and tests (each edited in the phase that changes the markup): `e2e/mobile-layout.spec.ts`, `e2e/mobile-open-editor.spec.ts`, `e2e/annotation-margin.spec.ts`, `e2e/navigation.spec.ts`, `e2e/guides-editor-width.spec.ts`, `e2e/essay-*.spec.ts` (incl. `essay-editor.spec.ts:384-392`, see Phase 4), `e2e/create-document`, `export-import`, `editor-mode`, `lifecycle`, `decision-flow` specs, `tests/GenericSrsShell.test.ts`, `GovernanceShell.test.ts`, `GuidesShell.test.ts`, `EssayShell.test.ts`, `breakpoints.test.ts`, `styles-tokens.test.ts`. New: `e2e/shell-layout.spec.ts`, `tests/AppShell.test.ts`, `tests/Drawer.test.ts`, `tests/columns.test.ts`.

### Specs at drawer widths (hamburger-first rule)

**Rule:** a closed drawer's contents are not visible, so every spec that is at a drawer width (<= 720 nav, <= 1100 inspector) reaches nav or rail content only through `openNavDrawer(page)` / `openInspectorDrawer(page)` (new in `e2e/helpers.ts`; each is a no-op when its trigger is not visible, so the same spec body works at any width). Playwright's default viewport is 1280x720, above both drawer widths, so every spec that sets no viewport is unaffected. Grep of every `setViewportSize` / `devices[` / `viewport:` in `e2e/`:

| Spec (viewport) | Reaches nav/rail content at drawer width? | Disposition |
|---|---|---|
| `mobile-layout.spec.ts` (iPhone 13, 390 and 360; landscape 844x390) | `open()` picks the editor from the nav at 390/360; "panels start collapsed" reads rail panels | `open()` uses `openNavDrawer`; panels assertion goes through `openInspectorDrawer`. 844 is above the nav width (nav stays a column), inspector is a drawer |
| `mobile-open-editor.spec.ts` (iPhone 13, 390) | picks the editor from the nav | `openNavDrawer` then `package-editor-essay` |
| `essay-touch.spec.ts:16-22` (opens at 1280, shrinks to the phone) | `:76` `.layers` rows (rail) at the phone width | `openInspectorDrawer` before `.layers`; the rest only touches the page |
| `essay-toolbar.spec.ts:14-20` (opens at 1280, then 1440 / 768) | no (Toolbar and page only; 768 is above 720) | unchanged; fine |
| `popover.spec.ts:114,120,211` (opens at 1280, then optional viewport; hover cards at 1440 / 390) | no (`rail` bbox only at 1440, guarded by `if (rail)`; `connectAgents` runs at 1280 before any resize) | unchanged; fine |
| `annotation-margin.spec.ts:32,62,69,71,89` (1920, 1280, 390) | no rail access at 390 (inline marks); `rail` bbox at 1920 | unchanged apart from the `.app` carrier re-point; fine |
| `guides-html-preview.spec.ts:54` (800, after opening at 1400) | asserts `guides-preview-pane` not visible at 800 | still passes (a closed drawer is not visible); the comment ("`.app__inspector` is `display:none` below 1100px via layout.css") is rewritten and a step added: `inspector-trigger` visible, open it, pane visible. Added to the Phase 2 and 3 e2e |
| `guides-editor-width.spec.ts:101` (sets 800 BEFORE loading) | nav is a column at 800 (> 720); the form is in main | unchanged in PR-A (it asserts `record-form--wide`, rewritten in PR-B Phase 9); fine |
| `styleguide.spec.ts:88,134` (1440, 1280 / 390) | `/styleguide` only | the new shell specimen must not trip the "frames do not overflow" check at 390 |
| `essay-paragraph-controls.spec.ts:18` (1440), `guides-view-discovery.spec.ts:26` and `guides-editor-width.spec.ts:32`, `guides-html-preview.spec.ts:23` (1400) | no | unchanged |
| `essay-editor.spec.ts:388` (1200x360) | page scroll surface | rewritten, see Phase 4 (B1) |

Specs that open at 1280 and then shrink (`essay-touch`, `essay-toolbar`, `popover`, `annotation-margin` 390, `guides-html-preview` 800) are fine for the open step; only content reached after the shrink matters, and the table lists it.

## Scope

**In scope:** everything in the Summary and the owner comments (a)-(d); `AppShell`, `Drawer`, `ResizeHandle`, `NavTrigger`, `InspectorTrigger`, `shell-context.ts`, `columns.ts`, Toolbar adoption in Generic, Governance, Guides; scoped-style removal into tokens; `/styleguide` specimens (shell at phone width with the drawer closed and open, Wide on/off); ADR-020 part (i); `src/styles/README.md`, `src/lib/components/README.md`, component headers.

**Out of scope (each owned elsewhere):** #436 (margin flow, PR-C, blocked by #424), #437 (dark theme), #425 (NavTree, searchable switcher; the essay has no nav column until it lands), #426 (address and selection), #428 (modals), #434 (roving tabindex in nav). Agents never write essay text.

---

# PR-A: the frame, Wide, drawers; Essay and Generic

### Phase 1: Tokens, state, pure helpers

**Goal:** the state and token surface exist and are unit-tested; nothing renders differently.

**Agent:** Web App Worker

#### Tasks

- [x] `tokens.css`: rename the existing `--content-max: 820px` to `--canvas-max: 820px` (read only by `.canvas` in `layout.css`; Governance and Guides are unchanged in PR-A, PR-B deletes it); add a NEW `--content-max: 46rem` and `--content-max-wide: 80rem`, read only by converted shells (Essay, Generic); `--nav-width` and `--inspector-width` stay as defaults. `tokens-components.css`: `--shell-nav-min: 12rem`, `--shell-nav-max: 24rem`, `--shell-inspector-min: 14rem`, `--shell-inspector-max: 40rem`, `--shell-resize-hit: 8px`, `--shell-drawer-width: min(20rem, 88vw)`, `--shell-scrim: color-mix(in srgb, var(--color-text-strong) 40%, transparent)`, `--shell-badge-bg`, `--shell-badge-fg`. `--essay-page-width` becomes `var(--content-max)`. `--rail-width` is deleted and `--inspector-width` becomes `20rem`; every `--rail-width` reader is re-pointed (see the selector table).
- [x] `[data-margin="expanded"]` rule (one place, `layout.css`): sets `--content-max: var(--content-max-wide)` and `--margin-width: var(--margin-width-wide)` on `.app` (descendants such as `.essay-shell__page` inherit them), keeping the existing `min-width:721px` guard (`/* bp: compact */`). The matching `essay-shell.css:35-39` rule STAYS in this phase (the `.app` rule is inert until `AppShell` sets `data-margin`); Phase 4 deletes it when the carrier moves.
- [x] `src/lib/columns.ts` + `tests/columns.test.ts`: load/save/clamp, storage throwing falls back to defaults, out-of-range stored value is clamped; global by design.
- [x] `src/lib/wide.ts` replaces `margin-mode.ts` (`loadWide`/`saveWide`, key `srs-web.margin` kept); `EssayShell.svelte` import updated; `tests/wide.test.ts` (round trip, legacy `expanded` value reads as on, storage throwing).
- [x] `src/lib/shell-context.svelte.ts` (`ShellState`, undefined-safe `getShell`, `setShell`). Add `src/lib/components/shell-actions.ts` `wideAction` (shared items only). Add `src/lib/native-support.ts` and use it in `Popover.svelte`.
- [x] Re-point the `--rail-width` readers (`Styleguide.svelte:403`, `styleguide/Frame.svelte:3`, `styles/README.md:27`).
- [x] `breakpoints.ts`: remove `genericNarrow`, `genericStack` (their CSS goes in Phases 5 and 8; keep them listed until then so the drift guard stays green: remove at the phase that deletes the last `@media`); add `DRAWER_NAV`, `DRAWER_INSPECTOR`; `tests/breakpoints.test.ts` embeds-the-values case.

#### Acceptance Criteria

- [x] No visual change in any shell (Governance and Guides keep 820px via `--canvas-max`); `npm test` green; `grep -rn "var(--x, #" src/styles` still empty.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- columns wide breakpoints header-actions styles-tokens Popover
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: shell tokens, column and wide state (#424)`.

---

### Phase 2: AppShell grid, independent scroll, resize

**Goal:** `AppShell` is `100dvh`, each column scrolls itself, nav and inspector are resizable by pointer and keyboard and the widths persist; Governance and Guides pick this up unchanged.

**Agent:** Web App Worker

#### Tasks

- [x] `AppShell.svelte`: create `ShellState`, `setShell`, restore columns from `loadColumns()`, set `--nav-width`/`--inspector-width` inline on `.app`, `data-margin` on `.app` (the ONE carrier) is `expanded` only when the shell passes `wide` (the capability prop, also `ShellState.wideEnabled`) AND the stored Wide is on; otherwise `compact`. PR-A: Essay and Generic pass `wide`; Governance and Guides do not and are unaffected by Wide (they get it in PR-B with their Toolbar). A stored Wide never changes a shell without the toggle. `inspector` optional; `nav` optional (no nav column, grid collapses to `main inspector`).
- [x] `layout.css` scrolling surfaces: the bar stays OUT of the scroller. `.app { height: 100vh; height: 100dvh; overflow: hidden; display:grid; grid-template-columns: var(--nav-width) minmax(0,1fr) var(--inspector-width) }` (the `100vh` line is the one allowed fallback pair for browsers without `dvh`; exclude it from the "no 100vh" grep). `.app__nav` and `.app__inspector`: `min-height:0; overflow-y:auto; overscroll-behavior:contain`. `.app__main { display:flex; flex-direction:column; min-height:0; overflow:hidden }`: the Toolbar or Topbar first, then any banner, then ONE scroller `.workspace { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain }`. Delete `min-height:100vh`, the `.topbar` `position: sticky`/`top`/`z-index` (it is a plain flex row outside the scroller). KEEP the two grid-collapse rules at the end of `layout.css` (`max-width:1100px` hides the inspector, `max-width:720px` single column) and `nav.css`'s 720px rule in this phase: the drawers do not exist yet, and deleting them would break Governance and Guides at narrow widths and turn `guides-html-preview.spec.ts:54` red. Inside the retained 720px rule add `.app { height:auto; overflow:visible } .app__main, .workspace { overflow:visible }`, i.e. today's stacked page, so the fixed-height grid does not clip it. Phase 3 deletes all three rules, and this addition, in the same commit that introduces the drawers. `nav.css` and `inspector.css`: delete `height:100vh; position:sticky; top:0`.
- [x] Governance migrations view renders `<Main><Topbar/><Migrations/></Main>` with no `Workspace`; wrap `Migrations` in `Workspace` so it has the scroller (otherwise it cannot scroll in the new frame). 
- [x] Check every `Main` child list in Governance, Guides and Generic for content that relied on window scroll, and record each as inside the scroller or intentionally fixed. `GuidesShell.svelte:587-643`: the `Topbar` (carrying `guides-preview-toggle`) is the bar; the `size-warning-banner` (`:633-637`) and the `guides-error` (`:639-641`) sit between the bar and `Workspace` and are INTENTIONALLY fixed (one-line status/alert that must stay visible while the form scrolls); everything else is inside `Workspace`. Governance: the size-warning banner (`:1053-1056`) likewise fixed, forms and lists inside `Workspace`, migrations wrapped (above). Generic: see Phase 5.
- [x] `ink-surface`: move `filter:url(#ink-surface)` from `.nav` to `.nav::before` (an absolutely positioned paint layer behind the content; also a perf fix, the filter no longer re-rasterises scrolling content). The nav keeps content styling only; the drawer panel supplies the dark surface through `--shell-*` tokens (`--shell-drawer-bg: var(--color-text-strong)`, `--shell-drawer-fg: var(--color-on-dark)`), so the same dark look holds inside the dialog. `.nav__foot` exists (`Nav.svelte:33`, `nav.css:99`) and is the footer region the drawer's close-on-pick listener skips.
- [x] `src/lib/components/ResizeHandle.svelte` (new): `role="separator"`, `tabindex="0"`, `aria-label` ("Resize navigation" / "Resize inspector"), `aria-controls` (the id of the column it sizes), `aria-orientation="vertical"`, `aria-valuenow/min/max` (min/max read from `--shell-*-min/max` via computed rem to px), pointer drag (capture, `touch-action:none`), Arrow keys (16px steps, Shift 64px; direction convention: ArrowRight always makes the column wider on the nav handle and ArrowLeft wider on the inspector handle, i.e. the arrow points the way the edge moves), Home/End to min/max, double-click resets to default; calls `onchange(px)`; clamps via `clampColumn`; **not rendered in drawer mode**; `tests/ResizeHandle.test.ts` covers keys, clamp and aria. `Inspector.svelte` drops its inline drag code and uses it (edge: left); `Nav.svelte` gets one on its right edge. Persist on `pointerup`/key (not per move) via `saveColumns`.
- [x] `Inspector.svelte` keeps its `open` prop and the `.inspector--open` rule until PR-B Phase 8 (Guides still passes `open={previewOpen}`); PR-A neither removes nor changes them.
- [x] `Main.svelte`: unchanged markup. `SaveBar` (`field.css:182` sticky) now sticks inside `.workspace` (its scroll parent); verify in a form at 1400px.
- [x] `tests/AppShell.test.ts` (the retained 720/1100 CSS keeps `e2e/guides-html-preview.spec.ts:54` green): renders three regions; omitting `nav` or `inspector` removes the column; widths restored from storage; Wide state sets `data-margin` on `.app`; `setShell` ran before children (a `Topbar` inside finds the context, a standalone `Topbar` renders no triggers).
- [x] `e2e/shell-layout.spec.ts` (new, 1440x900): with `muSrs.srsj`, open Governance (and Generic after Phase 5), click the **last** nav item: `await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)` and the nav element's `scrollTop` is unchanged (it keeps its scroll; scroll it first, then click); document `scrollHeight <= innerHeight`; and the Governance migrations view scrolls inside `.workspace`.
- [x] e2e (`shell-layout.spec.ts`): turn Wide on in Essay, then open Governance with the same `localStorage`: the `.canvas` computed width is unchanged (820px cap) and `.app` has `data-margin="compact"`.
- [x] e2e resize: drag `nav-resize` by +80px: `--nav-width` grows by 80 (read computed width), reload the page, **re-upload the fixture** (nothing but `localStorage` survives a reload) and reopen the editor: width persisted; keyboard Arrow changes it and persists; same for `inspector-resize`.

#### Acceptance Criteria

- [x] Governance and Guides: clicking the last nav item with muSrs leaves `scrollY === 0`; nav and inspector scroll independently; `.topbar` no longer relies on `position: sticky`.
- [x] Resized widths persist across reload; clamps hold (cannot drag the main column to zero).
- [x] `grep -rn "100vh\|position: sticky" src/styles/layout.css src/styles/components/nav.css src/styles/components/inspector.css` returns only the one `height: 100vh; height: 100dvh;` fallback pair in `layout.css`.
- [x] ALL Governance and Guides specs stay green at the gate: `decision-*`, `validation`, `lifecycle`, `navigation`, `guides-*`, `export-import`, `create-document`, `editor-mode`, `walkthrough-r1`, `load-repo`, `gallery`, `validate-on-save`, `instance-notes`, `record-edit`.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- AppShell columns ResizeHandle
npx playwright test e2e/shell-layout.spec.ts e2e/navigation.spec.ts e2e/lifecycle.spec.ts e2e/validation.spec.ts e2e/decision-flow.spec.ts e2e/decision-link.spec.ts e2e/decision-tags.spec.ts e2e/guides-editor.spec.ts e2e/guides-editor-width.spec.ts e2e/guides-html-preview.spec.ts e2e/guides-json-export.spec.ts e2e/guides-ordering.spec.ts e2e/guides-table-editor.spec.ts e2e/guides-view-discovery.spec.ts e2e/export-import.spec.ts e2e/create-document.spec.ts e2e/editor-mode.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: AppShell is a 100dvh grid with independent scroll and persisted resize (#424)`.

---

### Phase 3: Drawer, triggers, one phone mechanism

**Goal:** at or below 720px the nav is an off-canvas drawer opened by a hamburger; at or below 1100px the inspector is a drawer opened by a second button with an activity badge. Every shell on `AppShell` gets both, with no per-shell rule.

**Agent:** Web App Worker

#### Tasks

- [x] `Drawer.svelte` (new): native `<dialog>`, `showModal()` when `open` (focus trap, inert background, Escape and focus return to the invoker free), backdrop click closes (a handler on the dialog: a click whose target is the dialog itself), `side: "start" | "end"` slides from the edge, width `--shell-drawer-width`, `aria-label`, `overscroll-behavior: contain`, panel padding `env(safe-area-inset-top/bottom)` and the start/end edge `env(safe-area-inset-left/right)`. `onclose` closes state. The guard is `supportsModal()` from `native-support.ts`; without it (happy-dom) it falls back to a class + inline display. It renders its children ONCE and toggles visibility with `showModal`/`close`, so panel state survives open and close. Header comment states the dismissal model is Popover's (ADR-020 e) and why it is a dialog (modality: trap, inert).
- [x] `AppShell`: below `DRAWER_NAV` the `nav` snippet renders inside `Drawer` (`shell-drawer-nav`) instead of the grid column; below `DRAWER_INSPECTOR` the `inspector` snippet renders inside `Drawer side="end"` (`shell-drawer-inspector`). One `matchMedia` each, guarded `typeof matchMedia === "function"` (desktop mode when absent) and initialised synchronously (no flash, as Toolbar). Crossing a breakpoint remounts the region's content (it moves between the grid column and the dialog): accepted; `Panel`s keep open/closed state through their `persistKey`, and Essay's own state lives above in `EssayShell`. Choosing a nav item closes the nav drawer: a delegated `click` listener on the drawer for `a, button, [role=button]` that are not disclosure toggles (`aria-expanded`) and not inside `.nav__foot`; also close when `shell.navOpen` is cleared by the shell. Resize handles hidden while drawers are in use.
- [x] `NavTrigger.svelte` / `InspectorTrigger.svelte`: `IconButton` (Lucide `menu`, `panel-right`; verify both exist under `node_modules/@lucide/svelte/dist/icons/`), shown only when their drawer mode is active (CSS-free: the component reads the same shell state), `aria-expanded`, `aria-controls`, `data-testid` `nav-trigger` / `inspector-trigger`. `InspectorTrigger` shows a count badge (`inspector-badge`, `--shell-badge-*`) when `shell.inspectorBadge > 0`, and clears it when the drawer opens.
- [x] In the SAME commit as the drawers: delete the `layout.css` 1100px/720px collapse rules, the `nav.css` 720px rule and the Phase 2 stacked-page addition; `AppShell`'s `matchMedia` drawer mode replaces them, initialised synchronously so first paint is correct (SPA: no server render to mismatch). `guides-html-preview.spec.ts:54` is re-checked here (it gains the `inspector-trigger` step).
- [x] `Topbar.svelte`: renders `NavTrigger` first and `InspectorTrigger` last when a shell context exists (so Governance and Guides need no edit in PR-A; PR-B deletes this once they use Toolbar). `Toolbar` gains `trail?: Snippet` (last in the bar, after the menus; `lead` already exists), with `Toolbar.test.ts` cases that `lead` renders first and `trail` last at EVERY tier, including narrow (`trail` is rendered outside the tier branch so it survives the narrow tier), and that tab order is `lead`, title/status, primary, menus or the overflow, THEN `trail`, the `ToolbarSpecimen` showing both, `toolbar.css` styling `.toolbar__trail`, and ADR-020 part (h) gaining `data-part="trail"` in its parts list.
- [x] Fixtures (explicit task): add to `src/styleguide/fixtures.ts` the shell fixture data (a nav of two groups with a count, an inspector with two Panels, a badge count of 3, a one-line main) and the `ShellSpecimen` props they feed.
- [x] Specimen: `src/styleguide/ShellSpecimen.svelte` in `/styleguide` shows the frame in a 375px-wide `Frame` with the nav drawer closed, nav drawer open, inspector drawer open with a badge, and Wide on/off at desktop width; reachable from the styleguide index; `styleguide.spec.ts` gains a case for it.
- [x] ADR-020 part (i) (and part (g): "the text column widens with Wide (owner D5, 2026-10-04)"): parts (`AppShell`: `nav main inspector`; `Drawer`: `scrim panel`; `ResizeHandle`: `grip`), tokens, the breakpoint roles (`compact` = nav drawer, `wide` = inspector drawer), the dialog choice (second top-layer primitive, justified by modality; the only `showModal` user; #428 owns the z-index modals), Wide = `saveWide`/`data-margin`. Update `src/styles/README.md` token list and note shells enter the scan in PR-B.
- [x] `tests/Drawer.test.ts`: opens/closes, Escape and backdrop close, focus returns to the trigger, fallback path in happy-dom. happy-dom does not provide `matchMedia` here (only `tests/Toolbar.test.ts` stubs it, with `vi.stubGlobal`), so `Drawer.test.ts` and `AppShell.test.ts` stub it explicitly per test for drawer mode and desktop mode; `tests/AppShell.test.ts`: with drawer mode stubbed on, the nav renders inside the drawer and not in the grid.
- [x] e2e (in `shell-layout.spec.ts`): at 375 in Governance's migrations view, `getByTestId("nav-trigger")` resolves to exactly one element (`toHaveCount(1)`; neither Governance view may render two). At 375: open the nav drawer, open an `ActionMenu` inside it (Generic's structure/other menus once Phase 5 lands; until then the Governance/Guides footer button): the first Escape closes only the menu, the second closes the drawer. A nav-foot action that opens a modal (`GitSaveModal`, `SuccessorModal`) closes the drawer first (asserted: drawer hidden when the modal is visible). Agent dock: at the dock's position, `document.elementFromPoint` returns a descendant of the open drawer (replaces a `z-index` read).

#### Acceptance Criteria

- [x] At 375px in Governance and Guides (not yet converted; reached through `openNavDrawer`/`openInspectorDrawer`): hamburger opens the nav drawer, choosing an item closes it and the main pane shows that item; the inspector button opens the right column as a drawer; Escape and outside click close; focus returns to the trigger; Tab cannot leave an open drawer.
- [x] `/styleguide` renders the four shell states; `e2e/styleguide.spec.ts` green.
- [x] No `@media` for 480/600/720/900 remains in `layout.css`, `nav.css` (the 720 and 1100 collapse rules went in Phase 2). `inspector.css` keeps only the `.inspector--open` 1100 rule that Guides still uses until Phase 8.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- Drawer AppShell Toolbar breakpoints
npx playwright test e2e/shell-layout.spec.ts e2e/styleguide.spec.ts e2e/navigation.spec.ts e2e/guides-html-preview.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: nav and inspector drawers with hamburger and activity badge (#424)`.

---

### Phase 4: Essay onto AppShell

**Goal:** Essay sits on the shared frame; the page, the rail and the margin column all fit; Wide widens page and margin.

**Agent:** Web App Worker

#### Tasks

- [ ] `EssayShell.svelte`: wrap in `AppShell` with `main` = Toolbar, then the notice/status/error lines, then ONE scroller `<div class="workspace">` holding `.essay-shell__page` (same structure as every other shell: bar outside the scroller), and `inspector` (the rail contents; `Panel`s unchanged, `data-testid="rail"` kept on the inspector's container). No `nav` snippet (assumption A1). Remove local `marginMode` state and the `data-margin` on `.essay-shell` (the carrier is `.app`, ONE place): read `getShell()`; `AnnotationMargin variant` comes from `shell.wide`. The registry's `margin` item becomes `wideAction(shell)` (label "Wide", testid `margin-variant`); `header-actions.ts` state `expanded` is renamed `wide` (tests updated). `focusParagraph`'s `scrollIntoView` (`EssayShell.svelte:280`) targets a `[data-focus-key]` element inside the page, i.e. inside `.workspace`, so it scrolls the new scroller (asserted in `essay-comments`/`agent-channels` runs).
- [ ] Toolbar `lead`: `NavTrigger` is not rendered (no nav); the `InspectorTrigger` goes in the Toolbar `trail` slot (bar at 375px: `[title Save ⋯ inspector-trigger]`); `inspectorBadge` = count of agent events newer than the drawer's last-open time, from the existing `agentStatus`/`AgentFeed` entries (`agent-activity.ts`; no new data source; if the feed has no timestamp-ordered list, badge = number of currently running agents, `agentStatus.connected` with a pending operation). Verify in the phase: read `agent-activity.ts` first and state the derivation in the commit.
- [ ] Essay's scroller is `<div class="workspace workspace--flush">`; `.workspace--flush { padding: 0 }` (new modifier in `layout.css`) so the page edge sits at the column edge and `mobile-layout`'s text column >= 85% of the viewport and the 480px edge-to-edge assertions hold; the page's own padding is unchanged.
- [ ] `essay-shell.css`: delete `.essay-shell`'s `min-height:100vh`, `.essay-shell__grid`, the `grid-template-columns` collapse at 960, the `data-margin` rule (its `layout.css` twin was added in Phase 1), the 72rem cap; `.essay-shell__page { max-width: calc(var(--content-max) + var(--margin-width) - var(--margin-width-compact)); margin: 0 auto }`. The cap is a max, so the page fits `minmax(0,1fr)`. The page and its margin column live in `.workspace`, which scrolls. `panel.css` `.panel-rail` loses `position: sticky` (the inspector column scrolls).
- [ ] State the width change: the Essay rail goes from 18rem to 20rem (`--inspector-width` replaces `--rail-width`). `columns.ts` stores PX and a stored value overrides the token default, so only viewers with no stored width get 20rem. Re-check `annotation-margin.spec.ts` geometry at 1280 and 1920 (page, margin and inspector edges) after the change.
- [ ] 480px phone rules in `essay-shell.css` (zoombar, edge-to-edge page) stay (they are page styling, not frame); the grid padding/gap parts go. Mark remaining queries `/* bp: phone */`.
- [ ] Wide must leave room (comment b): at 1920 with Wide on, the `--margin-width-wide` column is visible, the text column widens with Wide (owner D5; ADR-020 g amended), and the margin does not extend under the inspector: e2e asserts margin right edge <= inspector left edge (reuses `annotation-margin.spec.ts` geometry). New e2e: at 1280 with Wide on and the inspector column open, `.app__main` and `.workspace` have no horizontal overflow (`scrollWidth <= clientWidth`).
- [ ] B1: rewrite `e2e/essay-editor.spec.ts:384-392+` ("the page is one white scroll surface ... (srs-web#363)"; read the whole test first, `:384-420`). It asserted "Only the window scrolls"; the new rule is: the MAIN column is the single scroll surface for the page, and no block scrolls inside itself. At 1200x360: `.workspace` has `scrollHeight > clientHeight`, `document.documentElement.scrollHeight <= innerHeight` (the window does not scroll), `.block__body` elements keep the no-nested-scroll check (`scrollHeight <= clientHeight + 1`), and the page-background and inline-title steps of that test are unchanged. The commit message cites srs-web#363 as superseded by #424 (owner-requested independent columns).
- [ ] B2: re-point `annotation-margin.spec.ts:34,35,41,64,95` and `tests/EssayShell.test.ts:206` to `.app` in the same commit; no second `data-margin` carrier on `.essay-shell`.
- [ ] B3: add `openNavDrawer` / `openInspectorDrawer` to `e2e/helpers.ts` and apply the table "Specs at drawer widths".
- [ ] Specs: `mobile-layout.spec.ts` `open()` uses `openNavDrawer` + `package-editor-essay`; "panels start collapsed" re-points through `openInspectorDrawer`; `mobile-open-editor.spec.ts` likewise; `essay-touch.spec.ts:76` (`.layers`) uses `openInspectorDrawer`; `annotation-margin.spec.ts` keeps `rail` geometry; `tests/EssayShell.test.ts` margin/Wide assertions. `essay-toolbar` (768) and `popover` need no change (table).

#### Acceptance Criteria

- [ ] All `essay-*`, `annotation-margin`, `popover`, `mcp-relay`, `agent-channels` e2e green at their current viewports.
- [ ] Essay at 1920: Wide on gives main content width > 46rem (736px); off gives the 46rem text column; the setting persists across reload (re-upload the fixture) and across editors (Phase 5 asserts the cross-editor part). "Margin expanded without Wide" and "Wide with compact notes" cannot be reached (one state; the 720px guard aside).
- [ ] At 375px: the Toolbar bar is `[title Save inspector-trigger ⋯]` on one row (<72px); the rail opens in the drawer.
- [ ] The agent dock (`.mcp-dock`) never covers an open drawer (`elementFromPoint` at the dock position returns a drawer descendant).

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- EssayShell header-actions Block AnnotationMargin
npx playwright test e2e/essay-editor.spec.ts e2e/essay-comments.spec.ts e2e/essay-toolbar.spec.ts e2e/essay-touch.spec.ts e2e/essay-paragraph-controls.spec.ts e2e/essay-purpose.spec.ts e2e/essay-export-markdown.spec.ts e2e/essay-write-guard.spec.ts e2e/essay-arrow-nav.spec.ts e2e/annotation-margin.spec.ts e2e/mobile-layout.spec.ts e2e/mobile-open-editor.spec.ts e2e/popover.spec.ts e2e/mcp-relay.spec.ts e2e/agent-channels.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: essay editor on AppShell; Wide widens page and margin (#424)`.

---

### Phase 5: Generic onto AppShell and Toolbar

**Goal:** Generic uses the shared frame, Toolbar and tokens; `.editors-mobile` and its 600/900 rules are gone.

**Agent:** Web App Worker

#### Tasks

- [ ] `GenericSrsShell.svelte`: `AppShell` with `nav` (brand, Documents, Structure tree, Explore, Package editors; markup keeps the existing buttons/testids; `data-part` on the sections), `main` (Toolbar + view), `inspector` (record). Delete the nav-foot block (`generic-nav-actions`): Save is the Toolbar primary (`save-document`, enabled by `documentDirty`), Export is a Document-menu item and Open another is the Go-menu item `toolbar-other` (as in Essay), `read-only-note` and `document-dirty-status` render in the Toolbar `status`, "Full preview" is a View toggle (`full-preview-toggle` testid kept), Wide is `wideAction`. Per-view `<header>` keeps only the `h1` (title) via the Toolbar `title`.
- [ ] Delete the whole scoped `<style>` (53 lines) in favour of component CSS in `src/styles/components/generic-nav.css` (new, `components` layer, `--nav-*` tokens, no raw colours), reusing `nav.css` variables: the dark nav palette is `--color-text-strong`/`--color-on-dark*`, the light cards `--color-surface-raised`/`--color-line*`. 26 raw-colour lines map to existing semantic tokens; add component tokens (`--generic-graph-*`) only for the SVG graph strokes and fills.
- [ ] Delete `.editors-mobile`, `editorButtons("package-editor-mobile")`, the `genericNarrow` and `genericStack` entries from `breakpoints.ts` and their `@media` rules. `SectionForm wide` in the inspector stays until PR-B.
- [ ] State the width change: the Generic inspector goes from 22rem to 20rem (same px-override rule). Generic's `main` is a `.workspace` scroller (bar first, then the `.workspace` holding the view, token padding, no `.canvas`). Wide item present; the `Workspace` component is not used here: Generic main content width follows `--content-max`.
- [ ] Specs/tests: `tests/GenericSrsShell.test.ts` Save/read-only lookups re-point to Toolbar (`getByTestId("save-document")`, `openAnother(page)` helper in `e2e/helpers.ts`), `musrs-fixture.spec.ts`. Grep result: no e2e spec has a Generic `Save`/`Open another` role lookup (`create-document:89,104`, `export-import:96,123`, `editor-mode:75`, `guides-editor:277` are Governance/Guides and belong to PR-B; `blueprint-document-editor:81` is a block-level Save inside the editor, unchanged), so Phase 5's re-points are `tests/GenericSrsShell.test.ts:123-151` only.
- [ ] Extend `tests/styles-tokens.test.ts`: add a `SHELL_FILES` list (Generic's `<style>` is now gone; assert it has none) so the scan includes `src/lib/generic/*.svelte`.

#### Acceptance Criteria

- [ ] `shell-layout.spec.ts`: with muSrs, the last Generic nav item leaves `scrollY === 0` and the nav keeps its scroll.
- [ ] At 375px: hamburger opens the drawer, choosing "Records" (or an editor `package-editor-essay`) closes it and the main pane shows it.
- [ ] Wide toggle in Essay and Generic at 1920 gives content width > 46rem; the setting persists when switching Generic -> Essay -> Generic and across reload (re-upload the fixture) (one spec, `shell-layout.spec.ts`). Governance and Guides are asserted in PR-B Phase 9.
- [ ] `grep -n "<style" src/lib/generic/GenericSrsShell.svelte` finds nothing.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- GenericSrsShell styles-tokens breakpoints
npx playwright test e2e/shell-layout.spec.ts e2e/musrs-fixture.spec.ts e2e/blueprint-document-editor.spec.ts e2e/gallery.spec.ts e2e/instance-notes.spec.ts e2e/mobile-open-editor.spec.ts e2e/mobile-layout.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: generic shell on AppShell and Toolbar (#424)`.

---

### Phase 6: PR-A sign-off

**Goal:** PR-A is reviewed, documented and ready to push (agents push the branch only; the owner reviews, then opens the PR).

**Agent:** Verification (Haiku) then Lead Integrator

#### Tasks

- [ ] Full suites: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npx playwright test` (all of it, not a subset).
- [ ] Review the diff against ADR-001 (no SRS logic), ADR-019/020 (tokens, `data-part`, specimens), DRY (one resize, one drawer, one Wide).
- [ ] Update `src/lib/components/README.md` and `src/styles/README.md` (AppShell, Drawer, ResizeHandle, `--content-max`, scan scope).
- [ ] Post a claim-style progress comment on #424 listing PR-A scope and what PR-B still owns.

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `docs: shell frame, drawer and Wide (#424)`. 5. Push the branch; no PR until the owner has reviewed.

---

# PR-B: Governance and Guides, token cleanup

### Phase 7: Governance onto Toolbar, scoped styles to tokens

**Goal:** Governance uses `Toolbar`; its scoped `<style>` (330 lines) is component CSS on tokens; no `href="#"` jump.

**Agent:** Web App Worker

#### Tasks

- [ ] Replace `Topbar` with `Toolbar`: `title` = the `Breadcrumb` (via `titleSlot`), primary = "New <section label>" (`governance-new-record`, disabled while `saving`, absent in a form or without a section), `status` for the size-warning count, the Document menu (Export) and Go menu (Open another, `toolbar-other`) as Governance has them, View menu with `wideAction`. Migrations view: Toolbar with the breadcrumb only. `lead` = `NavTrigger`, trailing = `InspectorTrigger`.
- [ ] Fix the `href="#"` jump: `NavItem` renders a `<button type="button">` when no `href` is given (and `<a>` only for a real `href`); drop `href="#"` and the wrapper `div`s' `e.preventDefault()`; clicks go on the item via an `onclick` prop. Same for Guides (Phase 8). `NavItem` keeps `nav__item` classes; keyboard activation works (this also removes the two `svelte-ignore a11y_*` comments per item). Roving tabindex stays out of scope (#434).
- [ ] Move the `<style>` block into `src/styles/components/governance.css` (layer `components`), rewriting 15 raw-colour lines and every `var(--x, #hex)` fallback to semantic or `--governance-*` component tokens declared on `:root`; `.size-warning-banner` becomes a shared `.banner` (`--banner-bg`, `--banner-fg`, `--banner-border`) used by both shells. Delete the `prefers-color-scheme: dark` block (decided D2: light-only).
- [ ] Specs: `button.topbar__new` -> `getByTestId("governance-new-record")` in `decision-flow`, `lifecycle`; `navigation.spec.ts` still passes by role/testid; `GovernanceShell.test.ts`.

#### Acceptance Criteria

- [ ] Clicking a Governance nav item does not change `location.hash` or scroll.
- [ ] `grep -n "<style" src/lib/governance/GovernanceShell.svelte` finds nothing; `tests/styles-tokens.test.ts` scans `src/lib/governance/*.svelte` and passes.
- [ ] All Governance e2e green at 1400px; at 375px the nav and inspector drawers work with muSrs.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- GovernanceShell NavItem styles-tokens
npx playwright test e2e/navigation.spec.ts e2e/lifecycle.spec.ts e2e/decision-flow.spec.ts e2e/decision-link.spec.ts e2e/decision-tags.spec.ts e2e/validation.spec.ts e2e/shell-layout.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: governance shell on Toolbar, scoped styles to tokens (#424)`.

---

### Phase 8: Guides onto Toolbar, scoped styles to tokens

**Goal:** same as Phase 7 for Guides (246-line `<style>`, 30 raw-colour lines).

**Agent:** Web App Worker

#### Tasks

- [ ] `Topbar` -> `Toolbar`: primary Save (`save-document`), `status` (`document-dirty-status`, `save-status` with `role="status" aria-live="polite"`, `readonly-reason`), Document menu: Export .srs (`guides-export-btn` as the item testid), Export .srsj; Go menu: Open another file (`toolbar-other`); View menu: `wideAction`. Delete `guides-preview-toggle`, `previewOpen` state and `Inspector open={previewOpen}` (the shell inspector trigger replaces them), and the `Inspector` `open` prop plus `.inspector--open` rule from `Inspector.svelte`/`inspector.css`.
- [ ] `NavItem` button (as Phase 7); remove `href="#"` default.
- [ ] `<style>` -> `src/styles/components/guides.css`, tokens only; `.size-warning-banner` -> shared `.banner`; delete the dark block (D2).
- [ ] Specs: `getByRole("button",{name:"Open another file"})` in `editor-mode:75`, `export-import:123`, `create-document:104`, `guides-editor:277` -> `openAnother(page)`; Governance's own Save/Export lookups (`export-import:96`, `create-document:89`) re-point to `save-document`; `guides-export-btn` clicks open the Document menu first (`openMenu(page,"Document")`); `guides-editor-width.spec.ts` rewritten (Phase 9); `GuidesShell.test.ts`.

#### Acceptance Criteria

- [ ] All `guides-*` specs green; Guides at 800px and 375px use the drawers; `previewOpen` and `guides-preview-toggle` are gone.
- [ ] `grep -n "<style" src/lib/guides/GuidesShell.svelte` finds nothing.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- GuidesShell Inspector styles-tokens
npx playwright test e2e/guides-editor.spec.ts e2e/guides-html-preview.spec.ts e2e/guides-json-export.spec.ts e2e/guides-ordering.spec.ts e2e/guides-table-editor.spec.ts e2e/guides-view-discovery.spec.ts e2e/editor-mode.spec.ts e2e/export-import.spec.ts e2e/create-document.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: guides shell on Toolbar, scoped styles to tokens (#424)`.

---

### Phase 9: Collapse the old width paths

**Goal:** one width token; `Workspace wide`, `.canvas--wide`, `record-form--wide`, 820px, 46rem in `SectionForm` are gone.

**Agent:** Web App Worker

#### Tasks

- [ ] Delete the `wide` prop from `Workspace`, `RecordForm`, `SectionForm` and `BlueprintDocumentEditor`, and its call sites (Generic inspector `SectionForm wide`, Guides `Workspace wide`/`SectionForm wide`/`RecordForm wide`). `.canvas`, `.record-form` use `max-width: var(--content-max)`. Delete `.canvas--wide`, `.record-form--wide` and the `46rem` literal (`SectionForm.svelte:293`).
- [ ] Decide-by-default (flag in the PR description): Governance's canvas goes from 820px to 46rem (736px) when Wide is off, matching the story plan's "one token"; Guides forms (previously always full width) become 46rem until Wide is on.
- [ ] `e2e/guides-editor-width.spec.ts`: replace the three `record-form--wide` class assertions with "form box width equals the `.canvas` width and exceeds 46rem at 1920 with Wide on, <= 46rem with Wide off".
- [ ] `grep -rn "46rem\|820px\|72rem\|--wide\|wide=" src` is empty except `--content-max*`, `--margin-width-wide`, `--content-max-wide` and `styleguide.css` (excluded, with its reason).

#### Acceptance Criteria

- [ ] Wide toggle in **every** shell (Essay, Generic, Governance, Guides) at 1920: content width > 46rem when on, <= 46rem when off, persists across editor switches and reload (`shell-layout.spec.ts`, one parameterised test).

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test
npx playwright test e2e/shell-layout.spec.ts e2e/guides-editor-width.spec.ts e2e/guides-editor.spec.ts e2e/blueprint-document-editor.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `refactor: one --content-max replaces the wide classes (#424)`.

---

### Phase 10: Final verification and sign-off (PR-B)

**Goal:** every acceptance criterion across both PRs holds; docs are current.

**Agent:** Verification (Haiku) then Lead Integrator

#### Tasks

- [ ] `tests/styles-tokens.test.ts` scans all four shells' `<style>` blocks (none remain) and `src/lib/**` components; no allowlist growth.
- [ ] `e2e/shell-layout.spec.ts` covers: last-nav-item scroll (Governance, Generic) with muSrs; Wide in every shell (> 46rem at 1920, persisted across editors and reload); 375px drawer flow in every shell (open, choose, drawer closes, main shows it; inspector drawer + badge); resized widths persist.
- [ ] Update ADR-019 Consequences (known limit closed), ADR-020 (i), `src/styles/README.md` (scan scope no longer excludes shells), `src/lib/components/README.md`.
- [ ] Full `npx playwright test` against the baseline (record any pre-existing red specs from the last green `origin/main` run before blaming this branch).

#### Milestone gate

1. Criteria met. 2. Run the Gate command (above) plus the phase's e2e line. 3. Tick boxes. 4. Commit: `docs: shell phase final verification (#424)`. 5. Push; owner reviews, then PR.

---

## Final Acceptance

### PR-A (this branch, `Refs #424`)

- [ ] Gate command green and the full `npx playwright test` at or better than the last green `origin/main` baseline.
- [ ] With muSrs, clicking the last nav item leaves `window.scrollY === 0` and the nav keeps its scroll (Governance and Generic).
- [ ] Wide toggle in Essay and Generic gives content width > 46rem at 1920, persists across those editors and reload, and is the one `saveWide`/`data-margin` setter on `.app` (not a second mechanism). Governance and Guides get the same mechanism but no toggle until PR-B.
- [ ] At 375px in every shell: drawer opens, an item is chosen, the drawer closes and main shows the item; the right column opens as a drawer with an activity badge.
- [ ] Resized nav and inspector widths persist.
- [ ] `essay-editor.spec.ts` "one scroll surface" test states the new rule (main column is the single scroller).
- [ ] Generic and Essay have no scoped `<style>`, no raw colours, no `.editors-mobile`, no 480/600/720/900 shell rules; `layout.css` has no sticky/100vh hack beyond the one `100vh; 100dvh` fallback pair.
- [ ] `/styleguide` shows the shell at phone width (closed and open) and Wide on/off.
- [ ] NOT claimed in PR-A: one `--content-max` token (Governance's `.canvas` 820px, `Workspace wide`, `record-form--wide` and `SectionForm`'s 46rem remain until PR-B).

### PR-B (new branch from `main` after PR-A merges, `Closes #424`)

- [ ] Gate command and full `npx playwright test` green.
- [ ] The Wide toggle in every shell (Essay, Generic, Governance, Guides) gives content width > 46rem at 1920, persists across editors and reload.
- [ ] One `--content-max` token: no `.canvas` 820px, `Workspace wide`, `.canvas--wide`, `record-form--wide`, `SectionForm` 46rem.
- [ ] No scoped shell `<style>` blocks and no raw colours in any shell (token scan covers them); both dark blocks deleted; no `href="#"` nav jump.
- [ ] The 375px drawer flow and resized-width persistence hold in all four shells.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only; no SRS semantics in TS (ADR-001).
- One mechanism per goal: one resize (`ResizeHandle`), one drawer (`Drawer`), one Wide setter (`saveWide`), one width token (`--content-max`).
- Each changed selector is re-pointed in the same commit as its markup (table above); no aliases.
- Verification Agent runs after each gate and before each push.
- Agents push the branch only; the owner reviews the diff, then opens each PR.
- Do not touch #425 (NavTree, switcher), #426, #428, #434.

## Assumptions

- A1: Essay has no nav column until #425; its `AppShell` omits `nav`, so there is no hamburger there. The rail is its inspector drawer. (If the owner wants an essay nav now, the essay list moves from the Toolbar `Select` to the nav: this is #425's slot, so not done here.)
- A2: Drawer breakpoints are `compact` 720 (nav) and `wide` 1100 (inspector), the two widths `layout.css` already uses; this reproduces today's single-column and hidden-inspector behaviour while giving it a way to open.
- A4 (late round-3 review, overrides plan text): (1) Phase 2's temporary 720px overrides (`.app{height:auto;overflow:visible}`, `.app__main`, `.workspace`) are written with specificity `.app .app__main` / `.app .workspace` so reordering `layout.css` can never re-clip the 375px page. (2) Phase 3: after the collapse rules are deleted `e2e/guides-html-preview.spec.ts:54` is re-asserted (pane not visible at 800 until the inspector trigger opens it) and Guides' own `guides-preview-toggle` is hidden at <=1100 (drawer mode) so Guides never shows two buttons for one inspector; the toggle itself stays until PR-B Phase 8. (3) `ShellState.wideEnabled` names the capability; `wideAction` returns nothing when it is false (the Wide item is hidden). The "Governance unaffected" e2e stores Wide=on under `srs-web.margin`, opens Governance, and asserts the canvas is 820px and `data-margin` is `compact`.
- A5 (deviation): the ShellState is created by the shell that owns the registry (Essay, Generic) and passed to `AppShell` as an optional `shell` prop (AppShell creates its own when absent). Reason: the Wide action lives in the shell's registry, which is built in the shell's own script, where `getContext` cannot see a context the child `AppShell` sets. `setShell` still runs in `AppShell`'s script init, before any child renders.
- A6 (Phase 2 deviations): the nav scroller is `.nav__scroll` (brand and footer stay put), so `.app__nav` is `overflow:hidden` rather than `overflow-y:auto`; the e2e reads the nav's scroll from `.nav__scroll`. Resize handles are siblings of the scroller inside `.nav` / `.inspector` (a handle inside a scroller would scroll away). `ResizeHandle` is pure (props `kind`, `value`, `controls`, `onchange`, `oncommit`); `Nav` and `Inspector` wire it to the ShellState. Governance's nav-length e2e uses a 380px-high window so the gallery fixture's nav overflows; Governance comes from gallery.srsj (muSrs has no Governance editor).
- A7 (Phase 3 deviations): (a) happy-dom 20 DOES implement `HTMLDialogElement.showModal`, so `Drawer.test.ts` runs the native path by default and deletes `showModal` from the prototype to cover the fallback; Escape and focus return are the platform's and are asserted in `shell-layout.spec.ts` in Chromium. (b) The shell tests that render Governance or Guides in happy-dom (1024 wide) get a closed inspector drawer, so `GovernanceShell.test.ts` stubs `matchMedia` to a desktop width. (c) The "nav-foot action opening a modal closes the drawer first" e2e is not written: after Generic's footer moves to the Toolbar no nav-foot action opens a modal in PR-A (Governance's footer is a count, Guides' opens a form in main); `ShellState.navOpen`/`inspectorOpen` are the hook and ADR-020 (i) records the rule. (d) The ActionMenu-inside-a-drawer Escape e2e lands in Phase 5, where Generic's nav has a menu. (e) The drawer panel tone is a `dark` prop (nav) with `--shell-drawer-bg` / `--shell-drawer-bg-dark` tokens instead of a single dark `--shell-drawer-bg` + `--shell-drawer-fg`, because the same Drawer holds the light inspector. (f) The inspector badge is driven by the shell that has the signal; `InspectorTrigger` only shows it (Essay clears it in Phase 4).
- A3: The inspector activity badge counts agent events not yet seen (Essay) and is zero elsewhere until another shell has such a signal.

---

## Decided by owner 2026-10-04

| Ref | Decision | Status |
|---|---|---|
| D1 | Two PRs under #424: PR-A (this branch) and PR-B. | decided |
| D2 | Light-only now. Both scoped dark blocks are deleted (PR-B). A real dark theme is srs-web#437. | decided |
| D3 | Borrow-free-space margin flow, as PR-C under srs-web#436 (blocked by #424) after Wide lands. Not part of this plan. | decided |
| D4 | The right column on phones is a side drawer, using the same `Drawer` component. | decided |
| D5 | Wide is one persisted per-viewer toggle, shared by all editors, that widens the content cap and the margin column. Side columns keep their own resize handles. | decided |
