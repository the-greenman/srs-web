# Plan: Shell frame PR-B, Governance and Guides onto Toolbar, one width token (#463)

## Summary

PR-B of srs-web#424 (epic #224, story muDemocracy.org#282). PR-A (#440, merged) put Essay and Generic on the shared `AppShell` frame and `Toolbar`: a `100dvh` grid, independent column scroll, persisted resize, nav and inspector drawers at 720/1100, one persisted **Wide** switch (`wide.ts`, `data-margin` on `.app`). It left Governance and Guides on `Topbar` with their own width paths, so today:

- they have no Wide toggle, no Document/View/Go menus, no `Go > Agents…` (the #442 agent dock is always there but unreachable from a menu, ADR-020 k D7 says exactly this);
- their nav items are `<a href="#">` (a click appends `#` and the Guides items never call `preventDefault`);
- three width mechanisms survive: `.canvas` 820px (`--canvas-max`), `Workspace wide` / `.canvas--wide`, `record-form--wide` plus the literals `42rem` (`RecordForm.svelte:134`) and `46rem` (`SectionForm.svelte:296`);
- each shell carries a large scoped `<style>` (Governance 284 lines, `GovernanceShell.svelte:1330-1613`; Guides 219 lines, `GuidesShell.svelte:833-1051`) outside the token scan (`tests/styles-tokens.test.ts:25`, `SHELL_FILES = generic only`).

This plan moves both shells onto `Toolbar` + `AppShell` (Wide, drawers, Go > Agents…), turns the nav items into buttons, moves both style blocks into component CSS on tokens, deletes `Topbar` and every old width path, and extends the token scan to all four shells. Presentation only (ADR-001). No new WASM method, no spec change.

Closes #424 (acceptance (a)-(d) completes here). Branch `feat/463-shell-prb` off `origin/main` 0d8cc7f; PR body `Closes #463` and `Closes #424`. Source plan: `plans/424-shell-grid.md` (Phases 7-10, PR-B Final Acceptance, D1-D5), refreshed below against what landed since: #441/#444 notices, #442/#445 agent library and dock, #447/#452 and #456/#457 pairing and direct URL, #418/#458 reopen, #460 bindings pin, #461 cross-tab.

### What changed since the 424 plan (re-verified, so the old Phase 7-10 text is not used verbatim)

| Old 424 PR-B text | Today | Consequence |
|---|---|---|
| "size-warning banner becomes a shared `.banner`; delete the `prefers-color-scheme: dark` block (D2)" | #441 replaced it: `Notice kind="warning" testid="size-warning"` in both shells (`GovernanceShell.svelte:1029`, `GuidesShell.svelte:627`). `grep prefers-color` finds nothing in either shell. D2 is already satisfied. | Drop the `.banner` task and the dark-block task. ADR-019's known limit text still names the dark blocks: reword it (Phase 4). Notices are NOT moved into the Toolbar `status` (the old plan said so for the size-warning count): they stay between the bar and the scroller, where `Main` already renders `NoticeRegion` (`Main.svelte:19-20`) and `ToastHost`. |
| Governance `status` for the size warning; Save only in Guides | Governance also has `save-document`, `readonly-reason`, `document-dirty-status` in its Topbar (`:1003-1018`) | Save is the single bar primary in Governance too, as everywhere (owner N2); "New {label}" is the first Document-menu item. |
| "Document menu (Export) and Go menu (Open another)" | Both shells have two export buttons (`Download .srs` / `.srsj` in Governance, `Export .srs` / `.srsj` in Guides) plus "Open another file" | One shared `exportActions` ("Export .srs", "Export .srsj"; `toolbar-export`, `toolbar-export-srsj`) and `openAnotherAction`; buttons become menu items (spec table below). |
| `Go > Agents…` not in the plan | #442: `agentsAction(run)` in `shell-actions.ts:22`, wired in Essay (`header-actions.ts:131`) and Generic (`toolbar-actions.ts:56`); `App.svelte:332` `openDock()` expands `.mcp-dock` and focuses its first control; `EditorShellProps` has no `onOpenAgents`; ADR-020 (k) D7 and `components/README.md:86` say Gov/Guides "rely on the always-present dock" | Add `onOpenAgents` to `EditorShellProps`; App passes `openDock` to editors without `hostsAgentPanel`; both registries spread `agentsAction`. Amend D7. |
| `NavItem` as `<button>` breaks "no role change" | 89 e2e lookups in 22 files use `getByRole("link", {name})` for Governance nav items (counts per file below), plus 4 in `tests/GovernanceShell.test.ts:412-430` | Phase 1 introduces a role-agnostic `navItem(page, name)` helper and re-points them in a separate prep commit BEFORE the element changes (owner N3). |
| `button.topbar__new` re-points in `decision-flow`, `lifecycle` | 26 uses in 9 files: `cloud-storage` 3, `decision-flow` 3, `guides-editor-width` 1, `lifecycle` 3, `notices` 1, `record-edit` 9, `rfc038-concurrency` 1, `validate-on-save` 3, `walkthrough-r1` 2 | "New {label}" is now the first Document-menu item, so every site opens the menu (`newRecord` helper, spec table below). |
| "`Inspector open` prop and `.inspector--open` removed in PR-B" | still present: `Inspector.svelte:15,24` `open`, `inspector.css:35-49`, `GuidesShell.svelte:158,782`, `:1042` `:global(.guides-preview-toggle){display:none}` | Phase 3 deletes all of it. |
| Dock vs drawers | `.mcp-dock` is `position:fixed; z-index: var(--z-dock)` (`mcp-connection.css:56`); shell-layout e2e "agent dock never covers an open drawer" (`shell-layout.spec.ts:220`) runs on Governance | Keep green; Gov/Guides on Toolbar must not change `z-dock`/`z-overlay`. |
| Wide / pairing / reopen / cross-tab (#447,#456,#418,#461) | live inside `AgentPanel` / `McpConnection` in the dock or the essay rail | No Gov/Guides surface of their own; the only new reach is `Go > Agents…` opening the same dock. No change to those components. |

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrating session |
| Web App Worker | Sonnet subagent (phases in order) |
| Verification | Haiku subagent (after each gate and before the push) |

See [agents.md](agents.md).

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client; layout and menu wiring only. | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | New parts/tokens are skin API with a `/styleguide` specimen. Its Consequences "Known limit" (`:40-42`, scoped dark blocks beat the `theme` layer) is closed: reword to past tense, cite #424 PR-B and #441. | accepted, consequence closed |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | Amended in Phase 4, no new ADR: (g) the text column widens with Wide (owner D5), with `--canvas-max` gone; (h) `Breadcrumb` is `Toolbar` `titleSlot` content (`nav`/`ol`, `data-part` names); (i) updated in full: Wide wording, tokens list (`--canvas-max` removed, `--content-max` the one cap), "until their conversion" wording, Topbar removed, scan scope all four shells; (k) D7 rewritten: every shell has Go > Agents… (`onopenagents`), the dock is the placement for shells without a rail. | accepted, amended |

Owner decisions D1-D5 (2026-10-04) stand and are reproduced at the end. The owner rulings of 2026-10-05 (N1-N6) are recorded at the end of the plan and applied throughout.

## Gate command

Every milestone gate runs, from the worktree root:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

then the phase's Playwright line with a private port (never 5180/5181, which other sessions use):

```bash
PLAYWRIGHT_PORT=5195 npx playwright test <specs>
```

Bindings are installed in this worktree; after any `git rebase` run `npm run fetch-bindings` first (#460 made `ensure-bindings` refresh on a pin move, so a stale `node_modules` binding is the first suspect for a surprising red).

## Contracts

### WASM API surface

**No** new or changed WASM methods.

### TypeScript types

- `EditorShellProps` (`src/lib/editors/registry.ts:25-62`) gains `onOpenAgents?: () => void` ("open the agent library; absent for a shell that hosts its own agent panel"). `App.svelte:1030-1055` passes `onOpenAgents={activeEditor.hostsAgentPanel ? undefined : openDock}` to registered shells (Essay keeps its own `agentPanel` path; one way per goal). `GovernanceShell` and `GuidesShell` destructure it; `EssayShell` lists it in its "unused common props" comment (`EssayShell.svelte:95`).
- `src/lib/components/shell-actions.ts` gains, beside `agentsAction`: `saveAction(run, {saving, enabled})`, `openAnotherAction(run)` (testid `toolbar-other`, group `go`, label "Open another"), `exportActions({onexport, onexportsrsj?})` (ids `export` / `export-srsj`, labels "Export .srs" / "Export .srsj", testids `toolbar-export` / `toolbar-export-srsj`) and `commonActions(h, s)` = save, exports, `wideAction`, `agentsAction`, open another. Generic and (last, own commit) Essay switch their duplicated Save and Open-another objects to the shared ones (`essay/header-actions.ts:57-66,131-139`, `generic/toolbar-actions.ts:30-40,57-65`). `NavTrigger`/`InspectorTrigger`, `getShell`, `ShellState` are unchanged.
- Registries: `shell-actions.ts` holds the shared `commonActions` (below); `src/lib/governance/toolbar-actions.ts` is `[newAction, ...commonActions]`; Guides calls `commonActions` directly. Each shell imports only its own registry; wiring only.
- `NavItem` (`NavItem.svelte`): `href` is optional with no default; with `href` it renders `<a class="nav__item">`, without it `<button type="button" class="nav__item">`; props `onclick?: () => void` and `testid?: string` land on the element; `active` sets `aria-current="page"` on both. `NavItem.test.ts` (new) covers both elements, `testid`, `onclick` and `aria-current`.
- `Breadcrumb` (`Breadcrumb.svelte`) renders `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>` with an `<li>` per item (today it is a fragment styled by the Topbar's `.topbar__crumb`, so it cannot live in a `Toolbar` `titleSlot` without a wrapper); classes `.topbar__crumb-*` become `.breadcrumb__sep|current|link`; `src/styles/components/breadcrumb.css` (new) takes the rules from `layout.css:59-87` and adds `min-width:0; overflow:hidden; text-overflow:ellipsis` on the current item so a long crumb shortens in the one-row bar.
- `Workspace`: `wide` prop deleted. `RecordForm`, `SectionForm`, `BlueprintDocumentEditor`: `wide` prop deleted, and `RecordForm`/`SectionForm` lose their own `max-width` (the container caps the width).

## Investigation results (these gate the plan)

### 1. Today's call sites (all re-verified at 0d8cc7f)

| | GovernanceShell | GuidesShell |
|---|---|---|
| Frame | `<AppShell>` with no props (`:925`) so no Wide and no `shell` | `<AppShell>` (`:543`) likewise, inside `<div data-testid="guides-shell">` |
| Nav | `NavItem href="#"` inside click `div`s (`:946-953`, `:972-977`); only the first `div` calls `e.preventDefault()` | `NavItem` (default `href="#"`) inside `guides-guide-item` click `div`s (`:561-566`); footer `guides-new-guide` (`:573-580`) |
| Bar | `Main > bar > Topbar` (`:992-1025`): crumb, `button.topbar__new` "New {label}" (disabled while `saving`, hidden in a form or without a section), `save-document` (when `onSave`), `readonly-reason` span (when not), `document-dirty-status`, `Download .srs`, `Download .srsj` (when `onExportSrsj`), `Open another file`; a second bare `Topbar` for the Migrations view (`:1109-1115`) | `Topbar` (`:588-623`): crumb, `save-document`, `readonly-reason`, `document-dirty-status`, `guides-export-btn` "Export .srs", "Export .srsj", "Open another file", `guides-preview-toggle` (hidden by CSS at all widths, `:1042`) |
| Notices | `Notice` size-warning (`:1029`) between bar and `Workspace`; `NoticeRegion` and toasts come from `Main` | `Notice` size-warning (`:627`), `guides-error` (`:633`) likewise |
| Scroller | `<Workspace>` (`:1034`, migrations `:1117`) = `.workspace > .canvas` (820px) | `<Workspace wide>` (`:636`) = `.canvas--wide` (none) |
| Width props | none | `SectionForm wide` (`:644`), `RecordForm wide` (`:656`) |
| Inspector | `Inspector` (`:1131`) | `Inspector open={previewOpen}` (`:782`), `previewOpen` `:158` |
| Scoped style | `:1330-1613`, 284 lines; token scan would flag 8 lines: `#c00` x4 (`:1473,1494,1572,1595` approx, `.inspector__btn--danger`, `.inspector__transition-error` etc.), `var(--grey-3, #ccc)`, `var(--surface, #fff)`, `var(--accent, #0066cc)` | `:833-1051`, 219 lines; 19 flagged lines: `rgba(255,255,255,0.45)` (nav empty text), 14 `var(--color-*, #hex)` fallbacks, `#b91c1c`/`#fca5a5`, `rgba(0,0,0,.08)` shadow |
| Agent dock | floating `.mcp-dock` (no menu entry) | same |

Existing semantic tokens cover every raw colour (no new palette): `--color-error` / `--color-error-subtle` (`#c00`, `#b91c1c`), `--color-on-dark-muted` (`rgba(255,255,255,.45)`), `--color-line` / `--color-line-soft`, `--color-hover`, `--color-surface-raised`, `--color-muted`, `--color-text`, `--color-focus` (the `--accent` outline). Where a shadow is needed use `--shadow-popover`; add a `--guides-*` / `--governance-*` component token only where a value has no semantic home (decide while converting; each new token needs a `/styleguide` specimen row or is documented as an alias on an existing specimen).

### 2. Toolbar behaviour that constrains the conversion

- `Toolbar` renders every `kind:"primary"` action in the bar at every tier; Governance and Guides each register exactly one, Save (owner N2), so the 375px bar is `[☰ crumb Save ⋯ inspector]`. The crumb is the shrinking element, hence the Breadcrumb ellipsis, and a 375px bar e2e asserts one row (height < 72 as `mobile-layout.spec.ts:49` does for Essay).
- A group with exactly one non-toggle action is an icon button, not a menu (`Toolbar.svelte:112`). Gov/Guides `View` holds only the Wide toggle (a toggle always gets a menu), `Go` holds Agents… and Open another (a menu), and `Document` holds the exports (Governance: "New {label}" first, then the exports), so every group is a menu.
- `Main` renders `bar` first, then `NoticeRegion`, then children, so the Toolbar goes in `Main`'s `bar` snippet exactly like Generic (`GenericSrsShell.svelte:538`); no Toolbar edit is needed. **This plan does not edit `Toolbar.svelte`, `toolbar.css` or `menu-action.ts`** (rebase-conflict surface with #417, see Coordination).
- Menu items live in the DOM even when the popover is closed (Generic's unit test clicks `toolbar-other` directly, `tests/GenericSrsShell.test.ts:300`), so unit tests re-point to `findByTestId("toolbar-other")` with no menu-opening step; e2e must open the menu (`menuItem(page,"Go","toolbar-other")` already exists, `e2e/helpers.ts:240`).
- `tests/GovernanceShell.test.ts:11` already stubs `matchMedia` to a desktop width (query matches only when `max-width >= 1440`), so Toolbar renders the `full` tier and the drawers stay closed in unit tests. `GuidesShell.test.ts` needs the same stub (it does not have one today; a closed inspector drawer hides the preview panels it asserts) and the `AppShell`-in-test caveat: add the identical `beforeEach`.

### 3. e2e inventory (what changes, exactly)

New or changed helpers in `e2e/helpers.ts` (one definition each, no per-spec copies):

| Helper | Definition | Used by |
|---|---|---|
| `navItem(page, name: string \| RegExp)` | `page.locator(".app__nav, [data-testid=shell-drawer-nav]").locator(".nav__item").filter({ hasText: name })` (role-agnostic: works for `<a>` and `<button>`; `hasText` takes a string or RegExp); hands back a Locator | all 89 `getByRole("link", …)` lookups (below) |
| `openAnother(page)` | `await menuItem(page, "Go", "toolbar-other")` after `openToolbarOverflow` when narrow | `create-document:90,137`, `editor-mode:75`, `export-import:123`, `guides-editor:277` |
| `exportItem(page, "srs" \| "srsj")` | `menuItem(page, "Document", "toolbar-export" \| "toolbar-export-srsj")` | `create-document:131`, `export-import:34-109`, `guides-editor:258`, `walkthrough-r1:270` |
| `newRecord(page)` | `menuItem(page, "Document", "governance-new-record")` | the 26 `button.topbar__new` sites |

(`menuItem`, `openMenu`, `closeMenus` exist; Phase 1 extends `openMenu` so that at the narrow tier (<= 480), where the group buttons do not exist and only `header-menu` does, it opens the overflow and the item testids still resolve. Specs that run at 375 for Gov/Guides are only in `shell-layout`.)

Spec disposition (each re-pointed in the same commit as the markup it follows):

| Spec | Lookups | Phase | Change |
|---|---|---|---|
| `getByRole("link", { name })` for nav items, 89 total in 22 files: `app` 1, `cloud-storage` 5, `create-document` 5, `decision-flow` 2, `decision-link` 4, `decision-tags` 4, `editor-mode` 1, `export-import` 3, `gallery` 21, `guides-editor-width` 1, `lifecycle` 8, `load-repo` 4, `local-folder` 3, `migrations` 6, `navigation` 5, `notices` 1, `record-edit` 3, `rfc038-concurrency` 4, `shell-layout` 2, `validate-on-save` 1, `validation` 1, `walkthrough-r1` 4 | nav item lookups | 1 (own commit, green under the OLD `<a>`) | `navItem(page, name)`. `toBeVisible`/`click`/`not.toBeVisible` forms keep their meaning. |
| `button.topbar__new`, 26 uses in 9 files: `cloud-storage` 3, `decision-flow` 3, `guides-editor-width` 1, `lifecycle` 3, `notices` 1, `record-edit` 9 (incl. `test.fixme` blocks, re-pointed so they do not rot), `rfc038-concurrency` 1, `validate-on-save` 3, `walkthrough-r1` 2 | `button.topbar__new` | 2 | `await newRecord(page)` = `menuItem(page,"Document","governance-new-record")` (opens the Document menu, or `header-menu` at <= 480, clicks, closes). `cloud-storage` disabled/enabled assertions (`toBeDisabled`/`toBeEnabled`) open the Document menu, assert on `governance-new-record`, then `closeMenus` before the next `save-document` click, because an open popover would light-dismiss on that click; a spec step confirms resolving `save-document` works with the menu closed |
| `create-document:131`, `export-import:34,40,51,70,109` (the visibility check at `:34` becomes "the Document menu offers `toolbar-export-srsj`"), `walkthrough-r1:270`, `guides-editor:258` | `getByRole("button",{name:"Download .srsj"})` / `"Export .srsj"` | 2 / 3 | `exportItem(page,"srsj")` inside `Promise.all([waitForEvent("download"), …])` as today |
| `create-document:90,137`, `editor-mode:75`, `export-import:123`, `guides-editor:277` | `getByRole("button",{name:"Open another file"})` | 2 (Governance specs) / 3 (Guides specs) | `openAnother(page)` |
| `export-import:96` | `getByRole("button",{name:"Save"})` | 2 | `getByTestId("save-document")` (the role lookup is ambiguous once menus and dialogs also carry "Save"-named controls) |
| `guides-editor:258,277` | "Export .srsj" (`:258`), "Open another file" (`:277`) | 3 | `exportItem`, `openAnother` |
| `guides-editor-width` | three `record-form--wide` class assertions (`:43,65,110`) and the `maxWidth === "none"` check (`:50-56`) | 4 | the class assertions become "the form fills its container: form width equals `.canvas` width; at 1920 with Wide on it exceeds 46rem and with Wide off it is <= 46rem" (new `setWide` helper moved from `shell-layout.spec.ts:261` to `helpers.ts`); the `none` check stays true and is kept |
| `guides-editor-width` (Governance RecordForm) | `:96-97` expects the form's `maxWidth` not `none` ("max-width should be 42rem") | 1 | rewritten in Phase 4 to "the form's width equals `.canvas`'s width and is ≤ 46rem with Wide off" (forms lose their own cap, N1). The `:90` `topbar__new` → `newRecord` edit lands in Phase 2, so `guides-editor-width` is also in the Phase 2 Playwright line. |
| `guides-html-preview:54-64` | `guides-preview-toggle` `toBeHidden` | 3 | delete the toggle assertion (the element no longer exists); keep "pane not visible at 800, `inspector-trigger` count 1, click opens it" |
| `shell-layout:171-190,241-252` | "old Topbar buttons wrap", `guides-preview-toggle` `toBeHidden` | 2/3 | retitle ("both triggers sit inside the viewport"); drop the toggle line; add bar-one-row (< 72px) at 375 for Governance and Guides |
| `shell-layout:73-87` | "a stored Wide never changes a shell without the toggle (Governance stays 820px, compact)" | 2 | **deleted** with the Governance conversion (it now has the toggle); the "no capability, no effect" guarantee stays in `tests/AppShell.test.ts` (a shell with `wideEnabled:false`). The Wide-in-every-shell test arrives in Phase 4. |
| `agent-library.spec.ts:140+, :178` | Go > Agents… for essay and generic; `:178` "a menu-less Topbar shell (Guides) still reaches the dock at 390px" | 2/3 | add a Governance case (Phase 2) and convert `:178` (Phase 3) to "Guides at 390px reaches the dock through Go > Agents…", keeping its relay add and dock bounding-box assertions; both: choose Go > Agents…, `.mcp-dock` panel is expanded and its first control focused; at 1000px the dock does not hide behind the inspector drawer (reuses the `shell-layout:220` assertion) |
| `mobile-layout`, `mobile-open-editor`, `essay-*`, `annotation-margin`, `popover`, `mcp-relay`, `agent-channels`, `agent-reopen`, `styleguide`, `musrs-fixture`, `instance-notes`, `blueprint-document-editor` | no Gov/Guides surface | none | run in the Phase 4 full pass only (`styleguide` also gets new specimens) |

Specs at drawer widths: the hamburger-first rule from the 424 plan applies unchanged (`openNavDrawer` / `openInspectorDrawer`, no-ops above the breakpoints). New Gov/Guides specs at 375 use them. Viewports in the e2e dir that touch Gov/Guides: `guides-editor-width` (1400/800), `guides-html-preview` (1400 then 800), `shell-layout` (1440x380, 1920, 375); all unaffected by the conversion apart from the lines listed.

Unit tests re-pointed: `tests/GovernanceShell.test.ts` (7 `findByRole("button",{name:/Open another file/i})` mount-waits at `:226,251,274,303,410,665,684` -> `findByTestId("toolbar-other")`; 4 `findByRole("link")` at `:412-430` -> a `.nav__item` query by text; the 3 `New Article` lookups at `:343,461,608` -> `findByTestId("governance-new-record")`; `readonly-reason` at `:667,687` keeps its testid), `tests/GuidesShell.test.ts` (9 `findByRole` mount-waits at `:178,192,204,216,277,367,384,427,443` plus the comment at `:177`; `readonly-reason` `:429,446`; new `matchMedia` stub), `tests/AppShell.test.ts:6,107-135` and `tests/ShellHost.svelte` (Topbar -> Toolbar), new `tests/NavItem.test.ts`, `tests/Breadcrumb.test.ts`, `tests/shell-actions.test.ts`, `tests/governance-toolbar-actions.test.ts`, `tests/print-html.test.ts`, `tests/styles-tokens.test.ts`; `tests/header-actions.test.ts` and `GenericSrsShell.test.ts` stay green unmodified (registry refactor).

### 4. Selector disposition (as in 424: one fate each, re-pointed in the same commit, no aliases)

| Selector | Fate | Becomes |
|---|---|---|
| `.topbar`, `.topbar__crumb`, `.topbar__actions`, `.topbar > .shell-trigger` rules (`layout.css:48-112`), `--topbar-height` (`tokens.css:106`), `Topbar.svelte`, its `index.ts:18` export, README rows | **deleted** (Phase 3, when the last user converts) | `.toolbar` |
| `.topbar__crumb-sep|current|link` | **renamed** (Phase 1) | `.breadcrumb__sep|current|link`, `breadcrumb.css`; `e2e/gallery.spec.ts:195-198` and `load-repo.spec.ts:69-77` are `test.fixme` and cite `.topbar__repo`: update the comment text only |
| `button.topbar__new` | **deleted** | `governance-new-record`, the first Document-menu item (text "New {label}") |
| `topbar__export`, `topbar__reset`, `topbar__save-message`, `guides-save-message` | **deleted** with the style blocks | Document/Go menu items; `readonly-reason` / `document-dirty-status` keep their testids |
| `save-document`, `readonly-reason`, `document-dirty-status` | **kept** | Save is the Toolbar primary (single);  `readonly-reason` renders as a `Notice kind="info"` under the bar (same placement and reason as Generic's `read-only-note`, `GenericSrsShell.svelte:547`: a sentence does not fit the one-row bar); `document-dirty-status` in the Toolbar `status` snippet (Generic pattern, `:540-542`) |
| `guides-export-btn` | **deleted**: no spec or test uses it | `toolbar-export` |
| Export items (both shells) | new ids `export` / `export-srsj`, testids `toolbar-export` / `toolbar-export-srsj`, labels "Export .srs" / "Export .srsj" | |
| `toolbar-other`, `toolbar-agents`, `margin-variant` | **kept** (shared definitions) | |
| `guides-preview-toggle`, `previewOpen`, `Inspector open`, `.inspector--open` (`inspector.css:35-49`), `:global(.guides-preview-toggle)` | **deleted** (Phase 3) | the shell's `InspectorTrigger` |
| `NavItem` `<a href="#">` | **replaced** (Phase 1) | `<button class="nav__item">`; role `link` -> `button` |
| `.canvas`, `.canvas--wide`, `--canvas-max`, `Workspace wide`, `record-form--wide`, `SectionForm` `46rem`, `RecordForm` `42rem` | **deleted** (Phase 4) | `.canvas { max-width: var(--content-max) }` is the one cap; the forms carry no max-width of their own |
| `.nav__footer-stat` (Governance footer), `.guides-nav__empty` | **kept**, move to component CSS | |
| `generic-srs-shell`, `guides-shell`, `package-editor-*`, `guides-*`, `.inspector__*` | **kept** | |
| new testids | `governance-new-record` (a Document-menu item) | |

## Scope

**In scope:** everything in the Summary and 424 acceptance (a)-(d); both shells onto `Toolbar` with Wide, drawers, Go > Agents…; `NavItem` button; `Breadcrumb` wrapper; `governanceActions` + `commonActions`/`exportActions` in `shell-actions.ts` and the Generic/Essay refactor onto them; the scoped-style move to `governance.css` / `guides.css`; deleting `Topbar` and all old width paths; the token scan over all four shells; the Wide-in-every-shell e2e; specimens; ADR-019/020 and README updates.

**Out of scope:** PR-C (#436, margin flow, own plan), #428 (modals), #425 (NavTree), #426, #434 (roving tabindex in nav), #437 (dark theme), Governance/Guides inspector badge (zero until those shells have a signal; the dock is not in the inspector), a Go > Explorer item for Gov/Guides (Essay has `onOpenExplorer`; not asked, adds a menu item with no spec), changes to `Toolbar`/`toolbar.css`/`menu-action.ts`, AgentPanel/McpConnection/AgentFeed. Agents never write essay text.

---

## Phases

### Phase 1: Prep that keeps every spec green (nav buttons, breadcrumb, shared actions, registries)

**Goal:** the element and helper changes land first, behind unchanged behaviour, so Phases 2 and 3 are only the bar swap.

**Agent:** Web App Worker

#### Tasks

- [x] Commit 1 `test: role-agnostic nav item helper (#463)`: add `navItem(page, name: string | RegExp)` to `e2e/helpers.ts`; replace all 89 `getByRole("link", …)` nav lookups in the 22 spec files (per-file counts in the disposition table; one scripted replace, then read the diff) and the 4 in `tests/GovernanceShell.test.ts:412-430` (query `.nav__item` by text). Also extend `openMenu` so it opens `header-menu` when the group button is absent (narrow tier, <= 480). Gate here: the Playwright subset below runs GREEN against the unchanged `<a>`.
- [x] Commit 2 `refactor: NavItem is a button without href (#463)`: `NavItem.svelte` per Contracts (optional `href`, `onclick`, `aria-current`); in `GovernanceShell.svelte:938-980` and `GuidesShell.svelte:556-570` drop the wrapper `div`s, the `href="#"`, `e.preventDefault()` and all `svelte-ignore a11y_*` comments on them, passing `onclick` to `NavItem` (`NavItem` takes `testid` and `onclick` and puts both on the button, so `getByTestId("guides-guide-item")` resolves to the clickable element). Roving tabindex stays out of scope (#434). `tests/NavItem.test.ts`.
- [x] `Breadcrumb.svelte` becomes `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>` with one `<li>` per item (a landmark with a real list, and a wrapper the Toolbar `titleSlot` can style) + `src/styles/components/breadcrumb.css` (move `layout.css:59-87`, rename classes, add the ellipsis rule); register the file in `src/styles/index.css`; `tests/Breadcrumb.test.ts` (labelled `nav`, an `ol`, last item `aria-current="page"`, link vs span); update the stale comment at `src/lib/types.ts:35`. The Topbar's `.topbar__crumb` wrapper keeps the font rules until Phase 3; Breadcrumb carries its own mono/uppercase rule so it looks the same in either bar.
- [x] `shell-actions.ts` gains, with `tests/shell-actions.test.ts`: `saveAction(run, {saving, enabled})`, `openAnotherAction(run)`, `exportActions({onexport, onexportsrsj?})` (two Document actions, ids `export` / `export-srsj`, labels "Export .srs" / "Export .srsj", testids `toolbar-export` / `toolbar-export-srsj`; the second only when its handler is given) and `commonActions(h, s)` = `[save (only with onsave; enabled: !saving, owner N4), ...exportActions, wideAction, agentsAction (only with onopenagents), openAnother]`. `src/lib/governance/toolbar-actions.ts` is `governanceActions = [newAction, ...commonActions]` where `newAction` is the first Document item: id `new`, label `New {label}`, testid `governance-new-record`, `enabled: !saving`, absent when `formMode !== null` or there is no section schema; with `tests/governance-toolbar-actions.test.ts`. Guides has no registry file: it calls `commonActions` directly (one definition; a file that re-exports it would be a second way). Handlers are optional exactly where the Topbar rendered conditionally. Neither shell uses them yet.
- [x] `generic/toolbar-actions.ts` switches its Save and Open-another objects to `saveAction` / `openAnotherAction` (output identical; `GenericSrsShell` tests unmodified). The Essay registry is NOT touched here: it is the last commit of this phase (see the gate), to keep the #465 rebase to one commit.
- [x] `registry.ts` `onOpenAgents?`; `App.svelte` passes it (Contracts); `EssayShell` comment line. `tests/` for App wiring is by e2e (Phase 2/3).

#### Acceptance Criteria

- [x] Governance and Guides look and behave exactly as before (still `Topbar`), except nav items are buttons: no `#` in `location.hash` after clicking a nav item, no scroll, Enter and Space activate, `aria-current="page"` on the active item.
- [x] `grep -rn 'getByRole("link"' e2e` returns no nav-item lookup; `grep -rn 'href="#"' src` is empty.
- [x] Essay and Generic registries produce identical action lists (existing `header-actions` and `GenericSrsShell` tests unmodified and green); `shell-actions.test.ts` and `governance-toolbar-actions.test.ts` cover the new definitions.

#### Testing

```bash
npm run typecheck && npm run lint && npm test -- NavItem Breadcrumb shell-actions governance-toolbar-actions header-actions GovernanceShell GuidesShell GenericSrsShell styles-tokens
npm run build
PLAYWRIGHT_PORT=5195 npx playwright test e2e/navigation.spec.ts e2e/gallery.spec.ts e2e/decision-flow.spec.ts e2e/decision-link.spec.ts e2e/decision-tags.spec.ts e2e/editor-mode.spec.ts e2e/export-import.spec.ts e2e/create-document.spec.ts e2e/lifecycle.spec.ts e2e/validation.spec.ts e2e/migrations.spec.ts e2e/app.spec.ts e2e/load-repo.spec.ts e2e/shell-layout.spec.ts e2e/guides-editor.spec.ts e2e/guides-editor-width.spec.ts
```

(Commit 1's own gate is the same Playwright line run BEFORE commit 2.)

#### Deviations (recorded by the worker, Phases 1 and 2)

- Menu rows exist in the DOM only while their `ActionMenu` is open (`ActionMenu.svelte` `{#if open}`); only a single-action group renders as an always-present icon button. So the plan's "items live in the DOM when closed" holds for `toolbar-other` (Go with no Agents… in unit tests) but not for Document rows: `tests/GovernanceShell.test.ts` clicks `toolbar-menu-document` before `governance-new-record` (helper `newRecordItem`).
- `e2e/export-import.spec.ts:96` is the record form's own Save, not the document Save: re-pointed to `getByTestId("record-form").getByRole("button", {name: "Save"})` (create-document:122 pattern), not `save-document`.
- Two Governance "New" lookups the table missed were also re-pointed to `newRecord`: `export-import:92` ("New Article") and `create-document:110` ("New Decision").
- `editor-mode:75` ("Open another file from guides") is a Guides case: left for Phase 3.
- A locally loaded file has no Save (read-only), so the new 375px Governance bar test asserts one row, at most one primary and `readonly-reason`; the single-Save-primary bar is covered by the cloud specs at desktop width.
- Styleguide: the three existing `ShellSpecimen` frames now carry the long `Breadcrumb` title slot (no new specimen row); `styleguide.spec.ts` asserts the breadcrumb is present and the frame does not overflow.
- Governance `.empty-state` is renamed `.governance-empty-state` (the moved global rule would otherwise leak into `DecisionLogView`'s own `.empty-state`).
- `nav.css` `.nav__item` gained the button reset (width, border, background, font, cursor) so one rule serves `<a>` and `<button>`.

#### Milestone gate

1. Criteria met. 2. Gate command plus the Playwright line. 3. Tick boxes. 4. Commits, in order: `test: role-agnostic nav item helper (#463)`; `refactor: NavItem is a button without href (#463)`; `refactor: breadcrumb nav, shared actions and Governance registry (#463)`; LAST, `refactor: essay registry uses the shared save/open-another actions (#463)` (the only commit that touches `essay/header-actions.ts`, the #465 rebase point).

---

### Phase 2: Governance onto Toolbar, scoped style to component CSS

**Goal:** Governance uses `Toolbar` with Wide, drawers and Go > Agents…; `GovernanceShell.svelte` has no `<style>`.

**Agent:** Web App Worker

#### Tasks

- [x] `GovernanceShell.svelte`: `const shell = new ShellState({ wideEnabled: true })` (A5 pattern from the 424 plan: the registry is built in the shell's own script); `<AppShell {shell}>` with `navLabel="Governance navigation"`, `inspectorLabel="Record"`. One shared `{#snippet bar()}` used by both `Main`s (governance and migrations views): `<Toolbar title={repoName} titleSlot=… actions={barActions} groups={BASE_GROUPS}>` with `lead` = `NavTrigger`, `trail` = `InspectorTrigger`, `titleSlot` = `<Breadcrumb items={…}/>` (governance view: `governanceCrumbItems()`; migrations view: `[{label: repoName},{label:"Migrations"}]`), `status` = `document-dirty-status` (role="status"); the bar has no button but Save, and the actions come from `governanceActions` = `[newAction, ...commonActions]`. `readonly-reason` becomes `<Notice kind="info" testid="readonly-reason">` under the bar when `!onSave && readOnlyReason`. The size-warning `Notice` and any form error stay where they are (fixed, between bar and scroller). Using one bar for the migrations view also gives it Save and the exports (it had none; a migration dirties the document, owner N5).
- [x] Delete the `Topbar`/`topbar__*` markup (`:992-1025`, `:1109-1115`), the `Topbar` import (`:48`), and the `.topbar__*` rules in the style block.
- [x] Move the `<style>` block (`:1330-1613`) into `src/styles/components/governance.css` (layer `components`, imported in `src/styles/index.css`): keep selectors, replace the 8 raw-colour lines with semantic tokens (`#c00` -> `var(--color-error)`; the `var(--grey-3,#ccc)` / `var(--surface,#fff)` / `var(--accent,#0066cc)` fallbacks -> `--color-line`, `--color-surface-raised`, `--color-focus`); rem/px literals that duplicate spacing/size tokens (`0.75rem`, `1.5rem`, `0.8125rem`) move to `--space-*`/`--size-*` where an exact token exists, otherwise stay (no behaviour change; do not hunt pixel-perfect token mapping beyond raw colours). Delete the `.topbar__*` and Topbar-extras rules. Any `:global(...)` becomes a plain selector.
- [x] `Workspace` is still used here with the 820px `.canvas` (width collapse is Phase 4).
- [x] Specs/tests per the disposition table: `newRecord`, `exportItem`, `openAnother`, `export-import:96`, `GovernanceShell.test.ts` re-points (`findByTestId("toolbar-other")`, `findByTestId("governance-new-record")` for the three `New Article` lookups). Add the `agent-library` Governance case; update `shell-layout` Governance cases (drawer triggers inside the viewport; both bar triggers once; bar one row at 375; Governance migrations view still exactly one `nav-trigger`). **Delete `shell-layout.spec.ts:73-87`** ("a stored Wide never changes a shell without the toggle (Governance stays 820px, compact)"): Governance has the toggle now, and the "no capability, no effect" guarantee stays covered by `tests/AppShell.test.ts`.
- [x] `/styleguide`: a `Toolbar` specimen row "document bar with a long breadcrumb title, lead and trail triggers and the single Save primary, at 375" (extends `ShellSpecimen`/`ToolbarSpecimen` fixtures: `fx.shellFixture` gets a `crumb` and the specimen passes `titleSlot`); `styleguide.spec.ts` asserts it does not overflow its 375px frame.

#### Acceptance Criteria

- [x] `grep -n "<style" src/lib/governance/GovernanceShell.svelte` finds nothing; `governance.css` is flagged by the token scan for nothing.
- [x] At 1400: Save is the only bar button; the Document menu offers "New {label}" first (absent in a form or with no section, disabled while saving), Export .srs, Export .srsj; View has Wide; Go has Agents… and Open another; `document-dirty-status` and `readonly-reason` appear as before; `save-document` saves as before (the cloud/local-folder save specs).
- [x] At 375 with `gallery.srsj`: the bar is `[☰ crumb … Save ⋯ inspector]` on one row (< 72px) with the crumb ellipsised; the two drawers work; Go > Agents… in the narrow overflow opens the dock above nothing else (dock z-order test unchanged).
- [x] Wide toggled in Governance at 1920 sets `data-margin="expanded"` on `.app` and persists across a Governance -> Essay -> Governance switch (the width itself is asserted in Phase 4; between Phases 2 and 4 the 820px cap still applies, accepted inside one PR).

#### Testing

```bash
npm run typecheck && npm run lint && npm test -- GovernanceShell AppShell styles-tokens
npm run build
PLAYWRIGHT_PORT=5195 npx playwright test e2e/guides-editor-width.spec.ts e2e/navigation.spec.ts e2e/lifecycle.spec.ts e2e/decision-flow.spec.ts e2e/decision-link.spec.ts e2e/decision-tags.spec.ts e2e/validation.spec.ts e2e/validate-on-save.spec.ts e2e/record-edit.spec.ts e2e/cloud-storage.spec.ts e2e/local-folder.spec.ts e2e/notices.spec.ts e2e/rfc038-concurrency.spec.ts e2e/export-import.spec.ts e2e/create-document.spec.ts e2e/walkthrough-r1.spec.ts e2e/gallery.spec.ts e2e/migrations.spec.ts e2e/agent-library.spec.ts e2e/shell-layout.spec.ts e2e/styleguide.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Gate command plus the Playwright line. 3. Tick boxes. 4. Commit: `feat: governance shell on Toolbar with Wide and Go > Agents, styles to tokens (#463)`.

---

### Phase 3: Guides onto Toolbar, delete Topbar and the preview toggle

**Goal:** same as Phase 2 for Guides; `Topbar`, `previewOpen`, `Inspector open` and `.inspector--open` are gone.

**Agent:** Web App Worker

#### Tasks

- [x] Print HTML out of the shell: `handlePrint` (`GuidesShell.svelte:527-538`) builds a document containing `<style>` in a template literal, which the Phase 4 "no scoped style" regex (`/<style[\s>]/`) would match. Move the string builder to `src/lib/guides/print-html.ts` (`printHtml(themeCss, bodyHtml): string`, pure) with `tests/print-html.test.ts` (both style blocks, theme CSS and body embedded verbatim); the shell keeps only the `window.open` / `print()` calls. The file is not a `.svelte` file, so the scan does not see it.
- [x] `GuidesShell.svelte`: `ShellState({ wideEnabled: true })`, `<AppShell {shell} navLabel="Guides navigation" inspectorLabel="Guide">`; `Toolbar` in `Main`'s `bar` with `commonActions(...)`, `titleSlot` = `<Breadcrumb items={guideCrumbItems()}/>`, `lead`/`trail` triggers, `status` = `document-dirty-status`; `readonly-reason` as an info `Notice` under the bar (as Phase 2). Keep `size-warning` and `guides-error` notices between bar and scroller. Delete `previewOpen` (`:158`), the toggle button (`:615-621`), `Inspector open` (`:782`), `:global(.guides-preview-toggle)` (`:1039-1045`), `.guides-save-message`.
- [x] `Inspector.svelte`: delete the `open` prop and the `inspector--open` class; `inspector.css:35-49` rule deleted (also drops its `bp: wide` annotation; confirm the drift guard in `tests/breakpoints.test.ts` stays green because `wide` is still used by `DRAWER_INSPECTOR`).
- [x] Move `<style>` (`:833-1051`) to `src/styles/components/guides.css`, tokens only (19 flagged lines: the 14 `var(--color-*, #hex)` fallbacks lose the fallback and use the same semantic names where they exist (`--color-border` is not a defined token: map to `--color-line`/`--color-line-soft`, `--color-surface-hover` -> `--color-hover`, `--color-surface-0/1` -> `--color-surface-raised`/`--color-hover`, `--color-muted` exists); `#b91c1c`/`#fca5a5` -> `--color-error` + `--color-error-subtle`; `rgba(255,255,255,.45)` -> `--color-on-dark-muted`; the shadow -> `var(--shadow-popover)`). Verify the nav empty-state and guide-list visuals in the `/styleguide`-adjacent screenshot at 1400 and 375 (the worker attaches before/after screenshots to the PR; a token swap that changes contrast is a finding).
- [x] Delete the last Topbar: `Topbar.svelte`, `components/index.ts:18` export, `layout.css:48-112` (`.topbar*`, the `.shell-trigger` Topbar rules, the 720px wrap rule and its `bp: compact` annotation if unused elsewhere in the file), `--topbar-height` (`tokens.css:106`), `README.md` rows (`:25,49,50`), the comments in `Main.svelte:3`, `NavTrigger`, `InspectorTrigger`, `shell-context.svelte.ts:4`. `tests/AppShell.test.ts:107-135` and `tests/ShellHost.svelte` render a `Toolbar` with `lead`/`trail` triggers instead (same assertions: setShell ran before children, both triggers present, a standalone Toolbar renders none).
- [x] Specs/tests per the table: `guides-editor` (`exportItem`, `openAnother`), `editor-mode:75`, `guides-html-preview:54-64`, `shell-layout` Guides case (drop toggle line; one row at 375), `agent-library.spec.ts:178` renamed to "Guides at 390px reaches the dock through Go > Agents…" (its relay add and dock bounding-box assertions are kept, the click on the dock header becomes the menu item) plus a Governance case, `GuidesShell.test.ts` (matchMedia stub, `findByTestId("toolbar-other")`).

#### Acceptance Criteria

- [x] `grep -rn "Topbar\|topbar" src tests` returns only history in plans/ADR text; `grep -n "<style" src/lib/guides/GuidesShell.svelte` finds nothing; no `preview-toggle`, `previewOpen` or `inspector--open` anywhere in `src`/`e2e`.
- [x] Guides at 800 and 375 use the two drawers; at 800 the preview is reachable only through `inspector-trigger`; `toolbar-export` is in the Document menu and still downloads; Go > Agents… opens the dock.
- [x] Both converted shells pass the full Phase 2 list plus all `guides-*` specs.

#### Testing

```bash
npm run typecheck && npm run lint && npm test -- GuidesShell GovernanceShell AppShell Inspector Toolbar styles-tokens breakpoints
npm run build
PLAYWRIGHT_PORT=5195 npx playwright test e2e/guides-editor.spec.ts e2e/guides-html-preview.spec.ts e2e/guides-json-export.spec.ts e2e/guides-ordering.spec.ts e2e/guides-table-editor.spec.ts e2e/guides-view-discovery.spec.ts e2e/guides-editor-width.spec.ts e2e/editor-mode.spec.ts e2e/export-import.spec.ts e2e/create-document.spec.ts e2e/agent-library.spec.ts e2e/shell-layout.spec.ts e2e/styleguide.spec.ts e2e/mobile-layout.spec.ts e2e/mobile-open-editor.spec.ts
```

#### Deviations (recorded by the worker)

- `mobile-layout.spec.ts:98` timed out once on `locator.tap` under the 10-worker load; rerun alone, 11/11 passed.
- `tests/AppShell.test.ts`: the Toolbar wraps `lead` in `.toolbar__lead`, so the order assertion checks the first child contains `nav-trigger`.
- `GuidesShell` Go group has a single action in unit tests (no agents handler), so `toolbar-other` is an always-present icon button there.

#### Milestone gate

1. Criteria met. 2. Gate command plus the Playwright line. 3. Tick boxes. 4. Commit: `feat: guides shell on Toolbar, Topbar and the preview toggle removed (#463)`.

---

### Phase 4: One width token, token scan over all four shells, Wide everywhere, docs, sign-off

**Goal:** `--content-max` is the only content width; every shell is scanned; docs are current; the branch is ready for owner review.

**Agent:** Web App Worker, then Verification (Haiku) and Lead Integrator

#### Tasks

- [x] Delete the `wide` prop from `Workspace` (and the `canvas--wide` class), `RecordForm`, `SectionForm`, `BlueprintDocumentEditor` (its two forwards at `:436,:494`) and the call sites: `GuidesShell.svelte:636,644,656`, `GenericSrsShell.svelte:651`. One cap per container: `layout.css` `.canvas { max-width: var(--content-max) }` is the only cap in Governance and Guides; delete `.canvas--wide` (`:129-131`), `tokens.css:107-108` `--canvas-max`, and the forms' OWN `max-width` (`RecordForm.svelte:132-138` 42rem, `SectionForm.svelte:294-300` 46rem, with `.record-form--wide`), so a form fills its container (`.canvas`, or the Generic inspector column). Effective-width changes (flag in the PR description, owner N1): Governance canvas 820px -> 46rem (736px) with Wide off and forms 42rem -> the canvas; Guides forms and lists (previously unbounded) -> 46rem with Wide off, 80rem with Wide on.
- [x] `tests/styles-tokens.test.ts`: `SHELL_FILES = [...svelteIn("src/lib/generic"), ...svelteIn("src/lib/governance"), ...svelteIn("src/lib/guides"), ...svelteIn("src/lib/essay")]` (all four shells); the existing "a converted shell has no scoped style block" case then covers them; the `EDITOR_FILES`/`svelte` scan stays; the CSS side already walks `src/styles/**` so `governance.css`, `guides.css`, `breadcrumb.css` are scanned with no new entry; ALLOW list gains nothing. Update the file's comment ("Governance and Guides join in PR-B" -> done) and `src/styles/README.md:36` (scan scope now all four shells) and its token/file list (new css files; `--canvas-max` and `--topbar-height` removed).
- [x] `grep -rn "46rem\|42rem\|820px\|72rem\|--wide\|wide=" src` is empty except `--content-max*`, `--margin-width-wide`, `styleguide.css` (excluded in the scan config with its reason) and the `Styleguide.svelte` Wide captions.
- [x] `e2e/shell-layout.spec.ts`: one parameterised test "Wide in every shell": for each of Essay, Generic, Governance, Guides at 1920x1000 (fixtures: `essay.srsj`, `gallery.srsj` for Generic/Governance, `muSrs.srsj` for Guides), Wide off => the main content width is <= 46rem, Wide on (`setWide`) => > 46rem; the setting persists after switching editor and after a reload (re-upload the fixture: only localStorage survives). Content width is read from the element that carries the cap in each shell: `.essay-shell__page`, `.generic-page`, `.canvas`, `.canvas` (Guides). The "stored Wide never changes a shell without the toggle" test is removed (Governance has the toggle) and its guarantee stays in `AppShell.test.ts`. Also `guides-editor-width.spec.ts` rewritten (table above), 375px drawer flow for Governance and Guides in one test each (open nav drawer, choose an item, drawer closes, main shows it; inspector trigger opens the drawer), resized-width persistence reuse (existing).
- [x] Docs: ADR-019 Consequences (known limit closed); ADR-020 (g) wording `the text column widens with Wide` (owner D5), (h) Toolbar/Breadcrumb note, (i) updated in full: the Wide bullet, the tokens list (`--canvas-max` removed, `--content-max` described as the one cap for all four shells), the "until their conversion" wording, Topbar removed, scan scope = all four shells; (k) D7 rewritten as "every shell has Go > Agents… (`onopenagents`); the dock is the placement when the shell has no rail". `src/lib/components/README.md`: the Usage import line (`:25`, drop `Topbar`), rows `AppShell`, `Main`/`Workspace` (no `Topbar`, no `wide?`), `NavItem` (button + `onclick`/`testid`), `Breadcrumb`, `NavTrigger/InspectorTrigger` (`:49`), Go > Agents… now on all four shells (`:86`); `src/styles/README.md`; component header comments (`Workspace`, `AppShell`, `Main`).
- [x] `/styleguide`: confirm the Phase 2 specimen row, and add `Breadcrumb` (short, long ellipsised, at 375) to the component grid if it has no row; `styleguide.spec.ts` no-overflow check.
- [ ] Verification pass: full `npm test`, `npm run build`, `npx playwright test` (all of it) with `PLAYWRIGHT_PORT=5195`, compared with the last green `origin/main` run; record any pre-existing red spec (the 424 plan's baseline-honesty rule) before attributing it to this branch. Review the diff against ADR-001, ADR-019/020, DRY (one resize, one drawer, one Wide setter, one width token, one registry-per-shell, shared actions in `shell-actions.ts`).
- [ ] Claim-style progress comment on #463 and #424 (Lead Integrator, not the worker); push the branch only. Owner reviews the diff, then opens the PR (`Closes #463`, `Closes #424`).

#### Acceptance Criteria

- [ ] All Final Acceptance items below.
- [ ] No pre-existing-red excuse hidden: the baseline list is in the PR description.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
PLAYWRIGHT_PORT=5195 npx playwright test e2e/shell-layout.spec.ts e2e/guides-editor-width.spec.ts e2e/guides-editor.spec.ts e2e/blueprint-document-editor.spec.ts e2e/styleguide.spec.ts
PLAYWRIGHT_PORT=5195 npx playwright test
```

#### Deviations (recorded by the worker)

- Guides forms sit in a 1rem-padded `.guides-form-panel`, so `guides-editor-width` asserts "fills the canvas less that panel padding" for Guides and exact equality for Governance.
- The "Wide in every shell" test replaces the earlier Governance-only Wide persistence test; it covers Essay, Generic, Governance and Guides at 1920 (cap element per shell), with reload persistence. Editor-switch persistence stays covered by the existing Essay -> Generic -> Essay test.
- `/styleguide`: no separate Breadcrumb row; the shell specimen bars carry it (long crumb, 375px frames, no-overflow asserted).
- Full Playwright run: 376 passed; changed/new specs with `--repeat-each=2`: 486 passed. Left for the Verification agent / Lead: the progress comment, review against ADR-001/019/020, push, and the baseline comparison with the last green `origin/main`.

#### Milestone gate

1. Criteria met. 2. Gate command plus the full Playwright run. 3. Tick boxes. 4. Commit: `refactor: one --content-max replaces the wide classes; all shells in the token scan; docs (#463)`. 5. Push; owner reviews, then PR.

---

## Final Acceptance

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass; full `npx playwright test` is at or better than the last green `origin/main` baseline.
- [ ] Governance and Guides are on `Toolbar` + `AppShell`: Save is the single primary (`save-document`); Document (Governance: "New {label}" first, then Export .srs / Export .srsj), View (Wide, `margin-variant`) and Go (Agents…, `toolbar-agents`, opening the dock; Open another) menus; nav and inspector triggers at <= 720 / <= 1100.
- [ ] The Wide toggle in **every** shell (Essay, Generic, Governance, Guides) gives content width > 46rem at 1920 when on and <= 46rem when off, persists across editor switches and reload (`shell-layout.spec.ts`, one parameterised test).
- [ ] One `--content-max` token: no `--canvas-max`, `Workspace wide`, `.canvas--wide`, `record-form--wide`, and no max-width on `RecordForm`/`SectionForm` themselves (the container caps).
- [ ] No scoped `<style>` in any of the four shells; `tests/styles-tokens.test.ts` scans all four plus the new CSS files with no allowlist growth; no raw colours.
- [ ] No `Topbar`, `previewOpen`, `guides-preview-toggle`, `Inspector open`, `.inspector--open`, `href="#"`; nav items are buttons with `aria-current`; no `button.topbar__new` (New {label} is `governance-new-record`, first item of the Document menu).
- [ ] 375px: both shells' bar is one row (< 72px) with the single Save primary; drawers open, an item is chosen, the drawer closes, main shows it; the agent dock never covers an open drawer.
- [ ] `/styleguide` has the breadcrumb bar specimen (long crumb ellipsised, lead and trail triggers, single Save primary, at 375); ADR-019/020 and both READMEs are current.
- [ ] #424 acceptance (a)-(d) all hold; PR-C (#436) is unblocked.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only; no SRS semantics in TypeScript (ADR-001). Worktree `/home/greenman/dev/semanticops/srs-web-worktrees/463-shell-prb` only; branch `feat/463-shell-prb`.
- One mechanism per goal: one `Toolbar`, one registry per shell with shared actions in `shell-actions.ts`, one Wide setter, one width token, one `NavItem`, one dock.
- Each changed selector is re-pointed in the same commit as its markup (table); no aliases.
- **semanticops-fa (#417, essay snapshot export, PR #465)** touches `src/lib/essay/header-actions.ts`, `EssayShell.svelte`, `essay-document.ts` and `srs-client.ts`, and may touch the shared Toolbar / ⋯ menu. This plan does not edit `Toolbar.svelte`, `toolbar.css`, `menu-action.ts`. It edits `shell-actions.ts` (Phase 1: added exports only), `generic/toolbar-actions.ts` and, as the LAST commit of Phase 1 (so it is the single rebase point), `essay/header-actions.ts` plus the one comment in `EssayShell.svelte`. If #465 lands first, rebase onto it before that last commit and keep its Document-group additions; if it lands second it rebases onto this. Gov/Guides registries are per shell, so a new Essay Document item never reaches them.
- **semanticops-95 (#464, SRS mark)** is merged (main `0d8cc7f`); nothing to rebase. This plan adds NO token to `tokens-components.css` unless Phase 2/3 finds a value with no semantic home (then it appends a clearly separated `/* governance, guides (#463) */` block at the end of the file) and removes `--canvas-max` / `--topbar-height` from `tokens.css`. Re-run `npm test -- styles-tokens` after any rebase.
- After any rebase run `npm run fetch-bindings` (#460) before trusting a red.
- Agents push the branch only; the owner reviews the diff, then opens the PR. Do not touch #425, #426, #428, #434, #436.
- Verification Agent runs after each gate and before the push.

## Assumptions

- A1: The Phase 1 prep commits keep every spec green under the OLD markup; any spec that cannot is a plan error to report, not to patch around.
- A2: Governance's and Guides' registries are built in each shell's own script, so each shell creates its `ShellState` and passes it to `AppShell` (the 424 plan's A5), keeping `setShell` before children.
- A3: The inspector badge stays 0 in Governance and Guides (424 A3): the agent dock is not part of their inspector, and there is no other unseen-event signal.
- A4: `Save` in Governance and Guides stays enabled whenever the shell is not `saving` (today's behaviour; specs click it on a clean document in places). Essay's dirty-gated Save (#423 D4) is not extended to them in this PR (owner N4).
- A5: The Migrations view of Governance shares the shell's bar (owner N5).
- A6: Export items are `Export .srs` / `Export .srsj` in both shells (ids `export`, `export-srsj`; testids `toolbar-export`, `toolbar-export-srsj`); the old "Download" wording and the `guides-export-btn` testid (no spec or test uses it) are retired. Harmonising with Essay's plain "Export" is a copy question, not structure.
- A7: happy-dom unit tests for Governance and Guides stub `matchMedia` to a desktop width (the 424 A7 note); Toolbar then renders the `full` tier and its menu items are in the DOM without opening.
- A8: Pre-existing known red (424 A9 f: `each_key_duplicate` opening Records on `essay.srsj`) is unrelated; do not fix here.

---

## Decided by owner 2026-10-04 (unchanged)

| Ref | Decision | Status |
|---|---|---|
| D1 | Two PRs under #424: PR-A (merged, #440) and PR-B (this plan, #463). | decided |
| D2 | Light-only now. Both scoped dark blocks are deleted (already done by #441, which replaced the banners with `Notice`); a real dark theme is srs-web#437. | decided |
| D3 | Borrow-free-space margin flow, as PR-C under srs-web#436, after Wide lands. Not part of this plan. | decided |
| D4 | The right column on phones is a side drawer, using the same `Drawer` component. | decided |
| D5 | Wide is one persisted per-viewer toggle, shared by all editors, that widens the content cap and the margin column. Side columns keep their own resize handles. | decided |

## Decided by owner 2026-10-05

Rulings on the questions this plan raised; each is folded into the body above and this table is the record.

| # | Ruling |
|---|---|
| N1 | One width for all four editors: `--content-max` (46rem; 80rem with Wide). Governance's 820px canvas, its 42rem forms and Guides' unbounded forms all go. |
| N2 | **Save is the single bar primary** in Governance, as in every editor. "New {label}" is the first item of the Document menu. |
| N3 | Nav items become buttons with `aria-current="page"`; the 89 e2e link lookups are re-pointed in a prep commit (they may become real links again under #426). |
| N4 | Governance and Guides keep Save enabled unless saving (no unification with Essay's clean-disable in this PR). |
| N5 | Governance's Migrations view gets the full bar. |
| N6 | Go → Agents… in every editor: `onOpenAgents` joins the editor-shell contract, and ADR-020 (k) D7 is rewritten. |
