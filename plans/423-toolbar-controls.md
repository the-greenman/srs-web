# Plan: Toolbar and paragraph controls (#423)

## Summary

Phase 4 of story muDemocracy.org#282 (epic #224). Two surfaces are replaced, not restyled:

- **The essay header ribbon.** Ten flat buttons in one row, two button styles, toggles drawn as actions, no title, no Save in view, and a 480px all-or-nothing collapse. `headerActions()` is rendered twice from one list (`EssayShell.svelte` ~517-530: a `.essay-shell__buttons` row and a hidden `ActionMenu`). It becomes one registry rendered once by `Toolbar.svelte`: a context bar (title, save state, Save) plus grouped menus Document / View / Go / Help.
- **The paragraph tool stack.** Each `.block` shows a ~7rem vertical column on `:hover` OR `:focus-within`, independently (`block.css` `.block:hover .block__tools, .block:focus-within .block__tools`), so two stacks can show at once and an opaque stack covers the next paragraph's drag handle and "Add paragraph". It becomes one tool surface at a time (hover wins over focus), handle + ⋯ always visible, and a small horizontal strip of 2-3 data-declared "primary" tools on hover. Everything else stays in ⋯ (`paragraphActions()` through `ActionMenu`). Touch keeps ⋯ only.

Presentation and client-side composition only. No SRS semantics in TS (ADR-001). No new WASM method. No spec change.

Required-scope sources, all covered below: the #423 brief; owner comments (a) designed menu, (b) #422 gutter overlay, (c) #433 View -> Comments drives the single thread-visibility state and can show `mixed`, (d) tool stack covers the next drag handle, (e) cramped: one surface at a time, never covers neighbours, e2e for both.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrating session |
| Web App Worker | Sonnet subagent (phases in order) |
| Verification | Haiku subagent (after each gate and before sign-off) |

See [agents.md](agents.md).

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client. Every action calls an existing shell callback; the registry is wiring and presentation. | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | New parts and tokens are skin API; every state is a `/styleguide` specimen. | accepted |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | Lucide icons (components, canonical file names); `--<block>-<prop>` tokens declared on `:root` and read by components; `data-part` tables; one breakpoint source (`src/lib/breakpoints.ts`, `/* bp: role */` comments, drift guard `tests/breakpoints.test.ts`). Phase 5 appends parts for `Toolbar` and the paragraph tool strip, and tokens for both. | accepted, amended in Phase 5 |

Owner decisions (2026-10-04), detailed under "Decided by owner 2026-10-04":

| Ref | Decision | Status |
|---|---|---|
| D1 | Toolbar is generic; adopted in Essay now; Generic, Governance and Guides adopt in #424. | decided |
| D2 | Document / View / Go menus plus a lone `?` Help icon. | decided |
| D3 | Hover strip = Hide, Zoom, Copy link. Draft and Delete are in ⋯ only. The drag handle does not anchor the strip. | decided |
| D4 | Save always visible as the primary; disabled while saving or when there is nothing to save (from `documentDirty`), status beside it. | decided |

No new ADR: the registry shape and tier rules are written into ADR-020 (Phase 5) and the component headers.

## Contracts

### WASM API surface

**No** new or changed WASM methods.

### TypeScript types

- `MenuAction` (`src/lib/components/menu-action.ts`) gains `checked?: boolean | "mixed"` (present = rendered as `menuitemcheckbox`).
- `ToolbarAction` is the base type, declared in `src/lib/components/menu-action.ts`: `MenuAction & { group: string; kind: "action" | "toggle" | "primary"; popovertarget?: string; expanded?: boolean }` (`checked` already on `MenuAction`). `Toolbar` imports only it.
- `HeaderAction` (`src/lib/essay/header-actions.ts`) is `ToolbarAction` narrowed to `group: "document" | "view" | "go" | "help"` plus `testid?`, with no duplicated fields. It gains: "document" | "view" | "go" | "help"`, `kind: "action" | "toggle" | "primary"`; `checked` (inherited) replaces `pressed`; `variant` is deleted (no per-action button styling: ADR-020 "one button look"). Optional `popovertarget?: string` and `expanded?: boolean` so the Help invoker keeps native popover toggling.
- `ParagraphAction` gains `primary?: boolean`; `HOVER_TOOLS` is deleted. The existing `tool: { aria, title }` wording is kept (the strip's aria-label/title come from it). The strip and the ⋯ menu both render from `paragraphActions()`.

## Investigation results (these gate the plan)

1. **Menu primitives.** `ActionMenu` is an ellipsis `IconButton` + `Popover role="menu"` with ArrowUp/Down, Escape, outside click and focus return to the trigger already done (`ActionMenu.svelte`). It renders `role="menuitem"` only, testids `${testid}-${a.id}`. So Phase 2 extends `ActionMenu` (one way): `checked` rows render `role="menuitemcheckbox"` with `aria-checked` ("true" | "false" | "mixed"); an optional `triggerLabel` + `triggerIcon` renders a small `Button` with a chevron instead of the ellipsis. No second menu component.
2. **Comments (c).** `thread-visibility.ts` (#433) is the single source: `summary(open, shownIds)` returns `all | none | mixed`, `toggleAll(open, shownIds)` is the symmetric action. The existing `comment-mode` button already does this (`EssayShell` `oncomments`, `aria-pressed` incl. `mixed`). The View -> Comments item is the same callback with `checked: summary` mapped to `true | false | "mixed"`. No new flag, no new state.
3. **Margin notes.** `marginMode` + `toggleVariant` in `EssayShell.svelte:212-214` call `saveMargin` from `src/lib/margin-mode.ts` (the one setter; `data-margin` on `.essay-shell`). View -> Margin notes is `checked: marginMode === "expanded"` on that. Wide (#424) will reuse the same setter: not wired here.
4. **Help.** Today an `IconButton` with `popovertarget={helpId}` toggles `MarkdownHelp` (`Popover role="region"`, anchor = `actionsEl`) on desktop and the overflow item sets `helpOpen = true` on narrow. Two paths for one goal. Phase 3 keeps a single invoker per tier: wide = a lone `IconButton` (a one-action group renders as an icon, not a menu) with `popovertarget`/`aria-expanded`, so the "? opens, ? again closes and stays closed" race coverage in `e2e/popover.spec.ts` survives unchanged; narrow = the menu item calling `run` (`helpOpen = true`).
5. **Tiers: one renderer, no double DOM.** `Toolbar` reads one `matchMedia` per tier from `BREAKPOINTS` (no new breakpoint): `>960` full (labelled menu triggers), `481-960` compact (icon-only triggers, accessible name = group name), `<=480` (`NARROW`) title + Save + one overflow `ActionMenu` holding all groups as separated sections. Only the active tier's DOM exists (`{#if}`), so there is no hidden second copy and no CSS `display:none` list.
6. **Hamburger ownership.** #424 owns the shell-level hamburger that opens the **nav drawer** (AppShell). The Toolbar's narrow-tier `⋯` is the **toolbar's own overflow menu** for document actions. They are two different controls with two different jobs; the plan does not render a hamburger in the Toolbar. Toolbar exposes a `lead` snippet (empty here, rendered first in the bar) where #424 places its drawer trigger. At 390px the bar is `[lead] title Save ⋯`; with #424 it reads `☰ title Save ⋯`.
7. **Cross-editor adoption.** Generic has per-view `<header>` and a nav-foot "Open another" button (`GenericSrsShell.svelte` ~469, 481...), Governance and Guides use `Topbar` (breadcrumb + actions snippet; `GuidesShell` ~588-631, `GovernanceShell` ~999, ~1135) with different save/export/open actions and many `data-testid`s that e2e depends on. #424 puts Generic and Essay on `AppShell` and moves the top bar, so editing those headers now means editing them twice. Decision D1: build Toolbar generic (props: `title`, `status`, `actions`, `lead`), adopt it in Essay only; the other three adopt in #424.
8. **Paragraph surface.** `Block.svelte` renders `HOVER_TOOLS` (`hide` via `EyeToggle`, `draft`, `delete`, `zoom`, `link`) in `.block__tools` (absolute, `top: 3rem`, opaque since #433) plus `ActionMenu .block__menu` (opacity 0 until hover/focus). The only stack-per-block rule is CSS `:hover`/`:focus-within`. "Hover wins over focus" is therefore expressible as one CSS rule on the stack container (`.block-stack:has(.block-stack__item:hover) .block-stack__item:not(:hover) .block__strip { visibility: hidden }`), not per-block flags. The `:has()` rule is the module. (Chromium, Firefox 121+, Safari 15.4+: fine; Playwright here is Chromium.)
9. **Why geometry is safe by construction.** The gutter column (handle, ⋯) is the left 2rem/44px; a horizontal strip placed at the block's top-right (main column) is disjoint horizontally from every neighbour handle and ⋯, and sits above the block's top edge so it cannot overlap Add paragraph (which is below the last block). It does overlap the previous block's bottom padding (<= `--space-xs`). The e2e asserts the box does not intersect neighbour handle, neighbour ⋯, Add paragraph or an open thread's composer; it does not assert against neighbouring text boxes (a strip straddling a paragraph boundary is accepted).

### Selector disposition

**Rule (as #421/#422):** each changed selector has one fate, re-pointed in the same commit as the markup. No aliases. Testids and accessible names are kept unless listed. The one new item testid scheme: `a.testid ?? \`toolbar-${a.id}\``, identical at every tier (no `header-menu-*` at narrow and something else at wide).

| Selector | Used by | Fate | Becomes |
|---|---|---|---|
| `new-document` | essay-editor:467, EssayShell.test:195 | **kept** (item testid; click opens Document menu first) | `getByRole("button",{name:"Document"}).click()` then the item; add helper `openMenu(page, "Document")` in `e2e/helpers` (or the local spec header) used everywhere |
| `copy-document` | essay-editor:431, EssayShell.test:193 | **kept** (item) | as above |
| `copy-for-agent` | essay-purpose:51 | **kept** (item) | as above |
| `export-markdown` | essay-export-markdown:30 (inside a `Promise.all` with the download) | **kept** (item) | open Document menu, then `Promise.all([download, item.click()])` |
| `margin-variant` | EssayShell.test:167, annotation-margin:40,63,94 | **kept** as a `menuitemcheckbox` in View; assert `aria-checked` and `data-margin` | `openMenu("View")` then click; checks via `toHaveAttribute("aria-checked", ...)` |
| `comment-mode` | essay-comments:161,214-234,281-293,327-332; EssayShell.test:117; mobile-layout:50 | **kept** (item); `aria-pressed` assertions re-point to `aria-checked` (`true`/`false`/`mixed`); rows exist only while the menu is open, so a helper `commentsState(page)` opens View, reads `aria-checked`, closes it with Escape | essay-comments 214-226, 327, 332 |
| `header-menu` (narrow overflow trigger) | popover:181,195; mobile-layout:51,74,92 | **kept** (trigger of the narrow overflow menu) | unchanged |
| `header-menu-help`, `header-menu-comments`, `header-menu-{new,copy,margin,export,other}` | popover:184-196; mobile-layout:53-55,75,93 | **re-point** (single item scheme) | `toolbar-help`, `comment-mode`, `new-document`, `copy-document`, `margin-variant`, `toolbar-export`, `toolbar-other`; mobile-layout loops this list |
| `getByRole("button",{name:"Markdown help",exact:true})` (desktop) | popover:128,141,151 | **kept** (lone Help `IconButton`, `aria-expanded`, `popovertarget`) | unchanged |
| `.essay-shell__bar` height < 72 | mobile-layout:49 | **kept** class on the Toolbar root, bar still one row | unchanged |
| `.essay-shell__bar`, `.essay-shell__heading`, `.essay-shell__actions`, `.essay-shell__buttons`, `.essay-shell__overflow` | CSS only (`essay-shell.css` 11-34, 114-140) | **deleted**; the class is not carried over to the Toolbar | `.toolbar` with `data-part` `title`/`status`/`primary`/`menu`/`overflow`/`lead`; `mobile-layout:49` re-points to `.toolbar` |
| `document-dirty-status` | essay-editor (many), essay-write-guard:104,114, mcp-relay:85,113,127, essay-purpose:33, blueprint-document-editor:87 | **kept** (the Toolbar status span; same testid, same `role="status"`) | unchanged |
| header "Save" button (essay) | none in essay specs (the `Save` role hits in blueprint-document-editor:81 and create-document:89 are Generic) | n/a | new `data-testid="save-document"` on the Toolbar primary (same id Guides uses) |
| strip buttons `name: /Move .* to draft/` and `/Delete <title>$/` (Draft and Delete leave the strip, D3) | essay-editor:157-158, 376-379, 491, 500-501, 516-517 | **re-point** to the ⋯ menu | hover/focus the paragraph, `getByTestId("paragraph-menu").click()`, then `paragraph-menu-draft` / `paragraph-menu-delete` (the `Delete Opening permanently` confirm buttons at 520-523 are unrelated and unchanged) |
| `paragraph-menu`, `paragraph-menu-*` | essay-touch, essay-purpose:61-62, popover:162-169, mobile-layout:83-84, Block.test:66-71, paragraph-actions.test | **kept** | unchanged; `Block.test` item list unchanged |
| `.block__tools [data-part="action"]` count = 3 | Block.test:67 | **re-point** (hover stack becomes the strip) | `.block__strip [data-part="action"]` (count = the `primary` set from `paragraphActions`, asserted from the registry not a literal) |
| `.block__tools` hidden on touch | essay-touch:34 | **re-point** | `.block__strip` hidden on touch (assert `toBeHidden`) |
| new testids | Phases 2-4 | **new** | `toolbar`, `toolbar-menu-document` / `-view` / `-go` (group triggers), `toolbar-<id>` (items without a testid), `save-document`, `block-strip` |
| `essay-shell__page`, `block-stack__item`, `block__handle`, `add-paragraph`, `comment-thread` | many | **kept** | unchanged |

Affected specs and tests (every one edited in the phase that changes the markup): `e2e/essay-comments.spec.ts` (also: its `.hover()` comments at 168-186 refer to the old stack; keep the `.hover()` before any force click), `e2e/essay-editor.spec.ts` (also lines above), `e2e/essay-purpose.spec.ts`, `e2e/essay-export-markdown.spec.ts`, `e2e/annotation-margin.spec.ts`, `e2e/mobile-layout.spec.ts`, `e2e/popover.spec.ts`, `e2e/essay-touch.spec.ts`; `tests/EssayShell.test.ts`, `tests/Block.test.ts`. Unchanged and must stay green: `e2e/essay-write-guard.spec.ts`, `e2e/mcp-relay.spec.ts`, `e2e/agent-channels.spec.ts`, `e2e/blueprint-document-editor.spec.ts`, Generic/Governance/Guides specs and tests (their headers are untouched).

## Scope

**In scope:** the four things in the Summary plus the owner scope comments (a)-(e); `ActionMenu` extension; `Toolbar.svelte`; the registry; essay adoption; paragraph tool surface; styleguide specimens; ADR-020 parts; component headers and `src/styles/README.md`.

**Out of scope (each owned elsewhere; nothing here may touch them):**

- **#424:** AppShell, the nav hamburger/drawer, the Wide toggle and its implementation, moving Generic/Governance/Guides headers onto Toolbar. This plan lists no Wide item (an unwired, disabled item would be dead UI); #424 adds one View item whose callback is the existing `saveMargin`-style setter and nothing else in the registry changes.
- **#425:** the searchable document picker and NavTree. The Toolbar title slot renders today's essay `Select` (when more than one essay) or the plain title; #425 replaces that one slot.
- **#426:** address model. **#428:** modals.
- Agents never write essay text (write guard unchanged).

---

## Phases

### Phase 1: Action registry

**Goal:** `headerActions()` describes groups, kinds and checked state, purely, with unit tests; nothing renders differently yet.

**Agent:** Web App Worker

#### Tasks

- [x] `src/lib/components/menu-action.ts`: add `checked?: boolean | "mixed"`.
- [x] `src/lib/components/menu-action.ts`: add `checked` and the `ToolbarAction` base type (explicit task; see Contracts). `src/lib/essay/header-actions.ts`: `HeaderAction extends ToolbarAction` (no duplicate fields), adding group/kind values; drop `variant` and `pressed`; map `margin` -> `{group:"view", kind:"toggle", checked: s.expanded}`, `comments` -> `{group:"view", kind:"toggle", checked: s.comments === "mixed" ? "mixed" : s.comments === "all"}`, `save` -> `{group:"document", kind:"primary"}`, new/copy/agent/export/export-md -> `document`/`action`, explorer/other -> `go`/`action`, help -> `help`/`action` (+ `popovertarget`, `expanded` passthrough). Order inside a group is the array order. Update the file header comment (no longer "buttons on wide / menu on narrow").
- [x] Export `HEADER_GROUPS: { id, label }[]` = Document, View, Go, Help in that order, plus a pure `groupedActions(actions)` returning `{group, label, items}[]` skipping empty groups and splitting off the `primary` action (rendered by the bar, not a menu).
- [x] Registry state gains `dirty: boolean`; `save` is `enabled: !s.saving && s.dirty`, label `Saving…` while saving, and absent without `onsave`.
- [x] `tests/header-actions.test.ts` (EXISTS: update, do not create; it asserts `.pressed` at lines 50-51, re-point to `.checked`): groups and order; `margin`/`comments` are `toggle` with `checked`; comments `mixed` -> `"mixed"`; absent handlers (`oncopy`, `onagent`, `onexportmd`, `onexplorer`, `onsave`) drop their entries and an emptied group disappears; `save` label `Saving…` and `enabled=false` while saving, disabled when clean, enabled when dirty; every id unique; `primary` is never in a menu group.

#### Acceptance Criteria

- [x] Registry is pure (no DOM, no stores); `grep -n "variant" src/lib/essay/header-actions.ts` finds nothing.
- [x] No render change: existing specs still green (EssayShell still maps `HeaderAction` through its inline bar until Phase 3, using `checked` for `aria-pressed`).

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- header-actions EssayShell
```

#### Milestone gate

1. Criteria met. 2. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass. 3. Tick boxes. 4. Commit: `refactor: header action registry gains group, kind and checked (#423)`.

---

### Phase 2: ActionMenu checkables and Toolbar.svelte

**Goal:** a generic `Toolbar` renders context + status + primary + grouped menus from the registry, with three width tiers, ready for any editor.

**Agent:** Web App Worker

#### Tasks

- [ ] `Popover.svelte` is NOT untouched: `rows()` at line 76 selects only `[role="menuitem"]` and arrow handling is at ~189-193. Change the selector to `[role^="menuitem"]:not(:disabled)` so `menuitemcheckbox` rows are navigable, and add Home/End there (the one place keyboard nav lives; not in ActionMenu). Add a `tests/Popover.test.ts` case: ArrowDown/Up/Home/End traverse a mix of `menuitem` and `menuitemcheckbox` rows.
- [ ] `ActionMenu.svelte`: rows with `checked !== undefined` render `role="menuitemcheckbox"` with `aria-checked` (`"mixed"` for mixed) and a leading Lucide `Check` / `Minus` indicator in a fixed-width slot (no layout shift); selecting a checkable item **keeps the menu open** and does not move focus (so the reader sees the state change): a new branch in `ActionMenu.pick`, taken only for `checked` rows and only when the new `keepOpenOnCheck` prop is true (Toolbar passes true on the wide tiers and false in the narrow overflow, item 8). Plain rows behave as today, so the paragraph ⋯ menu is unaffected (it has no `checked` rows). New optional props `triggerLabel?: string` and `triggerIcon?: IconComponent`: render a small `Button` (`size="sm"`, `ghost`) with a `ChevronDown` instead of the ellipsis `IconButton`; icon-only trigger when `triggerLabel` is omitted and `triggerIcon` given (accessible name stays `${title} for ${label}`... for group menus pass `title` = group label, `label` = document title). Keyboard: Arrow navigation (Popover, above); Space and Enter activate; Escape closes and returns focus to the trigger (existing).
- [ ] `src/lib/components/Toolbar.svelte` (new). Props: `title: string` (document name; renders as text, plus an optional `titleSlot` snippet where #425's picker goes, and the essay `Select` today), `status?: string | null` (renders `role="status"`), `actions: HeaderAction[]`-shaped `MenuAction & {group, kind}` generic over a `ToolbarAction` type declared in `menu-action.ts` (so no `essay/` import: generic layer never imports `essay/`), `lead?: Snippet` (reserved for #424's nav trigger), `label` for menu names. Renders:
  - Bar (`data-part="bar"`): `lead`, title, status, primary `Button size="sm" variant="primary"` (Save; `data-testid="save-document"`; disabled when `!enabled`), then the menus.
  - Full tier (`> BREAKPOINTS.rail`): Document, View, Go as labelled `ActionMenu` triggers; Help as a lone `IconButton` (a one-item group renders as an icon, carrying `popovertarget`/`aria-expanded` when given, never as a menu).
  - Compact tier (`NARROW < width <= rail`): same menus, icon-only triggers (Document `FileText`, View `Eye`, Go `Compass`, all Lucide canonical names verified under `node_modules/@lucide/svelte/dist/icons/`).
  - Selecting a checkable item inside the narrow overflow closes the menu, so the content is not covered (`mobile-layout:55-56` reads a thread right after). On wide tiers View stays open on toggle.
  - Narrow tier (`<= NARROW`): bar is `lead`, title (ellipsised, `min-width:0`), Save, then **one** overflow `ActionMenu` (`testid="header-menu"`, `title="Document actions"`) listing every group's items with a visible group label row (`role="presentation"`/separator) between groups. **This ⋯ is the toolbar's own overflow, not a nav hamburger; #424's drawer trigger goes in `lead`.** Hit targets >= 44px on `pointer: coarse` and on this tier.
  - Tier chosen by a helper in `breakpoints.ts`: add derived query constants `RAIL = "(max-width: 960px)"` built from `BREAKPOINTS.rail` (alongside `NARROW`), and a `tierOf(narrow: boolean, rail: boolean)` pure function. The Toolbar initialises its `$state` synchronously from `matchMedia(...).matches` (no first-paint flash) and updates on `change`. Boundaries match CSS `bp: rail` (`max-width: 960px`, `essay-shell.css:91`): full is `>= 961`. `tests/breakpoints.test.ts` gains a case that the derived constants embed the `BREAKPOINTS` values. Only the active tier's DOM exists.
  - `lead` renders nothing when absent. The essay `Select` in the title slot is today's select, not #425's picker.
  - The root element is exposed with `bind:root` (an `HTMLElement` prop); the shell passes it to `MarkdownHelp` as `anchor`.
  - Item testid = `a.testid ?? \`toolbar-${a.id}\``; group triggers `toolbar-menu-<group>`; root `data-testid="toolbar"`, class `toolbar`.
- [ ] `src/styles/components/toolbar.css` (new, in the `components` layer, imported by `src/styles/index.css`): reads component tokens only. Tokens in `tokens-components.css` (declared on `:root`, default to semantic tokens): `--toolbar-bg`, `--toolbar-border`, `--toolbar-gap`, `--toolbar-pad`, `--toolbar-title-size`, `--toolbar-title-max`. No `var(--x, <colour>)` fallbacks; `tests/styles-tokens.test.ts` stays green. `/* bp: rail */` and `/* bp: phone */` comments on any `@media` width.
- [ ] D4: the Toolbar always renders the registry's `primary` action (Save, `save-document`); the enabled logic lives in Phase 1's registry. `tests/Toolbar.test.ts`: the primary renders disabled when `enabled:false` and enabled otherwise; absent when the registry has no primary (read-only).
- [ ] Export `Toolbar` from `src/lib/components/index.ts`.
- [ ] Tests (`tests/Toolbar.test.ts`, `tests/ActionMenu.test.ts`): menuitemcheckbox roles and `aria-checked` incl. `mixed`; checkable selection keeps the menu open; arrow/Home/End/Escape; one-item group is an icon button not a menu; narrow tier renders title + Save + exactly one overflow trigger and no group triggers (matchMedia stubbed); full tier has Document/View/Go triggers; no duplicate action ids in the DOM at any tier (one renderer).

#### Acceptance Criteria

- [ ] `Toolbar` imports nothing from `src/lib/essay/`.
- [ ] Exactly one DOM copy of each action at every tier.
- [ ] The narrow tier has no group triggers, one overflow, and no hamburger.
- [ ] `tests/styles-tokens.test.ts` and `tests/breakpoints.test.ts` stay green.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- Toolbar ActionMenu Popover styles-tokens breakpoints
```

#### Milestone gate

1. Criteria met. 2. typecheck, lint, test, build pass. 3. Tick boxes. 4. Commit: `feat: Toolbar with grouped checkable menus and width tiers (#423)`.

---

### Phase 3: EssayShell adopts the Toolbar

**Goal:** the inline bar and its double rendering are gone; the essay header is the Toolbar; every previous action is reachable; View items drive the existing single states.

**Agent:** Web App Worker

#### Tasks

- [ ] `EssayShell.svelte`: replace `<header class="essay-shell__bar">...` with `<Toolbar title={model?.title ?? repoName} status={...} actions={barActions} lead={...}>` (pass the essay `Select` through the title slot when `essays.length > 1`; the repo-name eyebrow stays as the title's prefix text). Delete `.essay-shell__buttons`, `.essay-shell__overflow`, `actionsEl`, the `{#each barActions}` button loop, and the `ActionMenu` `header-menu` instance in the shell.
- [ ] D4 wiring: pass `dirty: documentDirty` into the `headerActions` state so Save is disabled when clean; add an `EssayShell.test.ts` case (Save disabled with no edits, enabled after `documentDirty`).
- [ ] Status: `document-dirty-status` is its own `role="status"` span rendered ONLY while `documentDirty` (count 0 when clean: essay-editor/essay-write-guard/mcp-relay assert `toHaveCount(0)`); `saveMessage` stays a separate span. The Toolbar takes `status` as a snippet (or two optional strings, `dirtyStatus` with a fixed testid and `message`); Save primary from the registry (`onsave`). Read-only (`readOnlyReason`) hides Save as today (absent `onsave`).
- [ ] View -> Comments: `oncomments: () => (openThreads = toggleAll(openThreads, shownIds))` and `comments: summary(openThreads, shownIds)` stay the only wiring (item `checked` `"mixed"` when mixed). Add a unit test that the item is `aria-checked="mixed"` with one thread open, and a click goes mixed -> all -> none, matching `thread-visibility.ts` (no fourth flag: assert `grep` below).
- [ ] View -> Margin notes: `toggleVariant` (existing setter), `checked: marginMode === "expanded"`.
- [ ] Help: `MarkdownHelp` stays mounted by the shell with `anchor` = the Toolbar root (expose `bind:root` or pass the bar element); wide tier invoker is the Toolbar's lone Help `IconButton` with `popovertarget={helpId}`; narrow tier item `run` sets `helpOpen = true` (selecting it closes the overflow menu and focuses its trigger first, as `ActionMenu.pick` does, so Escape returns focus to `header-menu`).
- [ ] Delete the dead CSS in `essay-shell.css`: `.essay-shell__bar`, `__heading`, `__actions`, `__buttons`, `__overflow`, `__narrow-icon` (still used by `zoom-copy-link`: keep that one rule), the `.essay-shell__bar .btn` rule, and the phone-tier bar rules (~114-140). Keep `.essay-shell__status` if still used elsewhere (it is: notice rows).
- [ ] Update every affected spec per the disposition table (essay-comments, essay-editor, essay-purpose, essay-export-markdown, annotation-margin, mobile-layout, popover, `tests/EssayShell.test.ts`), adding a small shared helper `openMenu(page, "Document" | "View" | "Go")` for the e2e specs. New e2e `e2e/essay-toolbar.spec.ts`:
  - 1440 (and 768): Document / View / Go / Help reachable by role and name; Margin notes and Comments are `menuitemcheckbox` with `aria-checked` toggling; Comments shows `mixed` when one thread is open; Escape closes a menu and returns focus to its trigger; the bar holds title, status, Save, menus on one row.
  - 390: bar children are exactly title, Save, overflow trigger (assert by role count); every action is reachable from the overflow; there is no second menu button.
  - Every action that existed before the change is reachable (a table-driven loop over the old ten names: New document, Copy document, Copy for agent, Markdown help, Margin notes, Comments, Export, Export markdown, Explorer, Open another).

#### Acceptance Criteria

- [ ] `grep -n "essay-shell__bar\|essay-shell__buttons\|actionsEl\|aria-pressed" src/lib/essay/EssayShell.svelte src/styles/components/essay-shell.css` finds nothing; `headerActions(` is called once.
- [ ] `grep -rn "pressed:" src/lib/essay/header-actions.ts` finds nothing; View -> Comments introduces no new `$state` (diff check: the only visibility state is `openThreads`).
- [ ] All eight listed specs updated and green; the "unchanged" specs green unmodified.
- [ ] The narrow bar is one row (< 72px), as asserted by `mobile-layout`.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/essay-toolbar.spec.ts e2e/essay-comments.spec.ts e2e/essay-editor.spec.ts e2e/essay-purpose.spec.ts e2e/essay-export-markdown.spec.ts e2e/annotation-margin.spec.ts e2e/mobile-layout.spec.ts e2e/popover.spec.ts e2e/essay-write-guard.spec.ts e2e/mcp-relay.spec.ts
```

#### Milestone gate

1. Criteria met. 2. typecheck, lint, test, build pass. 3. Tick boxes. 4. Commit: `feat: essay header is the Toolbar; View menu drives thread visibility and margin (#423)`.

---

### Phase 4: One paragraph tool surface

**Goal:** at most one tool surface visible at a time (hover wins, else focus); handle and ⋯ always visible; a horizontal hover strip of primary tools that never covers neighbouring controls; touch unchanged.

**Agent:** Web App Worker

#### Tasks

- [ ] `paragraph-actions.ts`: add `primary?: boolean`; set it on `hide`, `zoom`, `link` (owner D3); delete `HOVER_TOOLS`; remove the now-dead `tool` data on `draft` and `delete` (`paragraph-actions.ts` ~116, ~124), keeping it on `zoom` and `link`. The strip renders `actions.filter((a) => a.primary)`; the ⋯ menu still lists everything (the strip tools are in it too, so nothing is hover-only: touch and keyboard reach all). Unit test: `primary` set is 2-3 entries, every primary id is also in the menu list, `delete` and `draft` are not primary.
- [ ] `Block.svelte`: replace `.block__tools` with `.block__strip` (`data-part="strip"`, `data-testid="block-strip"`), a horizontal row rendered from the registry (same `EyeToggle` special case for `hide`, `IconButton data-part="action"` for the rest). Always render `.block__handle` and the ⋯ `ActionMenu .block__menu` (remove its opacity 0 rule; they are the persistent gutter controls). Update the header comment (gutter = handle + ⋯; strip = hover shortcuts).
- [ ] `block.css`:
  - `.block__strip`: `position:absolute` inside `.block__main`, which becomes `position:relative` (that is the positioned ancestor; the strip is NOT inside `.block__gutter`, which is `position:relative` and only 2rem wide). `top:0; right:0; transform:translateY(-50%)`: it sits at the top-right of the MAIN column, ends left of the margin column (`.block` grid is `2rem | 1fr | var(--margin-width)`, `block.css:41`, so `.block__margin` is never under it), and straddles the paragraph's top edge. On the phone grid (`display:contents` on `.block__main`, `block.css` ~480px rules) the strip is hidden (phone is touch-like; ⋯ only); state that in a `/* bp: phone */` rule. Opaque `--block-strip-*` tokens (renamed from `--block-tools-*`, ADR-020 note). 24px buttons on a mouse. `opacity:0; pointer-events:none` when idle.
  - Show: `.block-stack__item:hover .block__strip`, and keyboard focus: `.block__strip:focus-within` and `.block:has(:focus-visible) .block__strip`. Pointer (mouse) focus alone does not show a strip once another paragraph is hovered.
  - **The single-surface rule (the one module for "hover wins")**, scoped to the essay's paragraph list so draft tray, Layers and Bin `BlockStack`s (also used by `DraftTray`, `LayersPanel`) do not count: `.essay-shell__page .block-stack:has(.block-stack__item:hover) .block-stack__item:not(:hover) .block__strip:not(:focus-within) { opacity:0; pointer-events:none }`. Hover wins over pointer/stale focus only; a strip whose own controls hold keyboard focus stays visible (B5). Keep the strip in the tab order (opacity, not display).
  - Delete `.block__tools` rules, the `block.css:4-5` header-comment wording ("actions on hover/focus" -> handle, ⋯, hover strip) and the `(hover: none)` rule that hid it; replace with `@media (hover: none) { .block__strip { display:none } }`.
- [ ] Do not reintroduce per-block state: no `hovered`/`focused` prop or `$state` in `Block.svelte` or `BlockStack.svelte` (grep check below).
- [ ] Re-check `e2e/annotation-margin.spec.ts` ~47-60 (margin rows vs rail/page boxes) with the strip present; update `e2e/essay-editor.spec.ts` Draft/Delete selectors (disposition table, B2).
- [ ] Update `tests/Block.test.ts` (strip count from the registry, primary ids also in the menu) and `e2e/essay-touch.spec.ts` (`.block__strip` hidden on touch; ⋯ >= 44px unchanged).
- [ ] New `e2e/essay-paragraph-controls.spec.ts` (essay fixture; add one hidden paragraph and one one-line paragraph via the editor helpers):
  - Single surface: focus paragraph A (click into it), hover paragraph B: `block-strip` visible count is exactly 1 (B's), `toHaveCSS("opacity","1")` for B and `"0"` for A's; move the pointer off all paragraphs: only A's remains.
  - No overlap, on a one-line paragraph and on a hidden paragraph: hover it, take `block-strip` `boundingBox()`, assert it does not intersect the next paragraph's `.block__handle`, its `paragraph-menu`, the `add-paragraph` button (for the last paragraph) or an open `comment-thread` composer (open one on the neighbour first). A shared `intersects(a, b)` helper with 0px tolerance.
  - Strip placement: with a comment badge and margin rows present, the strip does not intersect `.comment-badge` or `.essay-shell__page .margin > [data-part="row"]`; and it straddles the top edge (`strip.y < block.y`) and stays within the block's main-column x-range.
  - Keyboard: with paragraph B hovered, Tab into paragraph A's strip: A's strip is visible (opacity 1) and the focused control is `:focus-visible`.
  - Handle and ⋯ are visible with no hover or focus (`toBeVisible`, opacity 1) on a desktop pointer.
  - The strip's actions run the same callbacks as their ⋯ items (e.g. Hide from the strip hides; same result as `paragraph-menu-hide`).
  - Touch project: no strip, ⋯ menu works (existing `essay-touch` assertions).

#### Acceptance Criteria

- [ ] `grep -rn "HOVER_TOOLS\|block__tools\|data-part=\"tools\"" src tests e2e` finds nothing.
- [ ] No hover/focus state in `Block.svelte`/`BlockStack.svelte`: `grep -n "hover\|focused" src/lib/components/Block.svelte src/lib/components/BlockStack.svelte` shows only comments or none.
- [ ] The owner's two hard requirements (one surface at a time; never covers neighbouring controls) are asserted by the new e2e.
- [ ] The #422 note is moot: the strip never renders below the paragraph's own top edge region (`strip.bottom <= block.top + strip.height`, measured against `.block`, not the item, which includes the thread frame).

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/essay-paragraph-controls.spec.ts e2e/essay-touch.spec.ts e2e/essay-editor.spec.ts e2e/popover.spec.ts e2e/annotation-margin.spec.ts e2e/essay-comments.spec.ts e2e/mobile-layout.spec.ts e2e/agent-channels.spec.ts
```

#### Milestone gate

1. Criteria met. 2. typecheck, lint, test, build pass. 3. Tick boxes. 4. Commit: `feat: one paragraph tool surface, handle and menu always visible, hover strip (#423)`.

---

### Phase 5: Styleguide, docs, README

**Goal:** the new surfaces are specimens, documented as skin API, and the styleguide gate covers them.

**Agent:** Web App Worker

#### Tasks

- [ ] `src/Styleguide.svelte`: add a **Toolbar** section (after "Menus and popovers") with `Toolbar` specimens at fixed widths 1440, 768 and 390 (framed containers that force the tier, via an optional `tier?: "full" | "compact" | "narrow"` override prop on `Toolbar`: when set it replaces the `matchMedia` result; used only by specimens, documented in the component header), each with a menu pinned open (use `ActionMenu`'s controlled `open`/an `defaultOpen` specimen prop): Document, View (one checkable `mixed`), Go, and the narrow overflow. Add to `sections` and fixtures in `src/styleguide/fixtures.ts`.
- [ ] Extend the **Paragraph** section with the states: idle (handle + ⋯ only), hover (strip visible), focus (strip), hover-wins-over-focus (two adjacent blocks), hidden paragraph, one-line paragraph with a neighbour (showing no overlap), touch (⋯ only, via a forced-state class used only in the specimen).
- [ ] `e2e/styleguide.spec.ts`: bump the `section h2` minimum, add: Toolbar renders three tier specimens, each menu role present, no console errors, demo theme leaves no hard-coded colour (existing computed-style check covers the new parts).
- [ ] ADR-020 (`docs/adr/020-icon-set-and-component-token-api.md`): append `data-part` tables for `Toolbar` (`bar`, `lead`, `title`, `status`, `primary`, `menu`, `overflow`) and the paragraph strip (`strip`, `action`), the new `--toolbar-*` and `--block-strip-*` tokens, and the rule "an action registry carries `group` and `kind`; one renderer per surface; a one-item group is an icon, not a menu". Note the amended status in the header.
- [ ] `src/styles/README.md`: the new files and token families; component header comments for `Toolbar`, `ActionMenu` (checkables), `Block` (strip), `header-actions.ts`, `paragraph-actions.ts` updated.
- [ ] Final sweep: `grep -rn "variant: \"ghost\" | \"mono\"\|essay-shell__bar\|HOVER_TOOLS\|header-menu-" src tests e2e docs plans/423-toolbar-controls.md` shows only intended references; `grep -rn "name: /Move\|name: /Delete" e2e` shows no use against strip buttons. `.essay-shell__narrow-icon` STAYS (still used by `zoom-copy-link`, `EssayShell.svelte:577`).

#### Acceptance Criteria

- [ ] `/styleguide` shows the Toolbar at 1440/768/390 with each menu open, and every paragraph state, in both themes, no console errors.
- [ ] ADR-020 documents the new parts and tokens; `tests/styles-tokens.test.ts` green.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/styleguide.spec.ts
```

#### Milestone gate

1. Criteria met. 2. typecheck, lint, test, build pass. 3. Tick boxes. 4. Commit: `docs: Toolbar and paragraph controls specimens, ADR-020 parts (#423)`.

---

## Final Acceptance

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- [ ] Full Playwright run green, including `essay-toolbar`, `essay-paragraph-controls`, `essay-touch`, `mobile-layout`, `popover`, `essay-comments`, `styleguide`, `agent-channels`, `mcp-relay`.
- [ ] Every one of the ten old header actions (the registry has 11 entries: those ten, with Markdown help as Help, plus Save) is reachable by role and name at 1440, 768 and 390; toggles report `aria-checked`; Comments shows `mixed`.
- [ ] At 390px the Toolbar holds title, Save and one overflow (plus the empty `lead` slot for #424).
- [ ] With A focused and B hovered exactly one tool surface is visible; on a one-line and a hidden paragraph it never intersects the next handle, ⋯, Add paragraph or thread composer.
- [ ] One registry (`headerActions`), one renderer (`Toolbar`), one visibility state (`thread-visibility.ts`), one margin setter (`margin-mode.ts`), one paragraph registry (`paragraphActions`); no `HOVER_TOOLS`, no inline bar.
- [ ] Generic, Governance and Guides unchanged and green.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only. No SRS semantics in TypeScript (ADR-001).
- Do not touch `AppShell`, nav, Generic/Governance/Guides headers, or add a Wide item (#424); do not build the picker (#425).
- Lead Integrator freezes the `ToolbarAction` shape (`group`, `kind`, `checked`) after Phase 1 so #424/#425 can consume it.
- Agents push the branch only; review the diff, then the owner opens/merges the PR.

## Assumptions

- Playwright runs Chromium, so `:has()` and CSS anchor positioning behave as in the existing specs.
- The Lucide icon names for Document/View/Go (`file-text`, `eye`, `compass`, `chevron-down`, `check`, `minus`) exist as `.svelte` files in the installed `@lucide/svelte`; the worker verifies each against `node_modules/@lucide/svelte/dist/icons/` before use (ADR-020 a).
- A strip straddling the previous paragraph's bottom padding is acceptable; if the owner disagrees the fallback is a reserved head row (layout shift on hover), noted in D3. **Superseded by N1 below.**

### Late review decisions (override the phase text above)

- **N1:** the paragraph hover strip does NOT straddle the top edge. It sits INSIDE the paragraph's own title row (`.block__head`) at its right end: `.block__head` is `position:relative`; the strip is absolute at `right:0`, vertically centred in the head row, with the opaque `--block-tools-*` surface (the `--block-tools-*` token family is kept, not renamed to `--block-strip-*`). It never leaves the block, so it cannot touch the previous paragraph's thread composer or the margin column. On hover it may cover the end of a very long title; accepted and documented. The e2e asserts the strip does not intersect: the previous paragraph's open thread composer or Comment button, the next paragraph's handle, the ⋯ button, Add paragraph, `.comment-badge`, margin rows. Phase 4's "straddles the top edge" / `strip.y < block.y` assertions and the acceptance line about the top edge region are replaced by "strip lies inside the block's `.block__head` box".
- **N2:** the title-row overlap is accepted.
- **N3:** a focused editable body matches `:focus-visible`, so clicking into a paragraph's text shows its strip when nothing else is hovered; hover still wins. The "exactly one surface" e2e uses paragraph A with a focused body plus paragraph B hovered.
- **N4:** the phone hide rule for `.block__strip` lives inside the existing `@media (max-width: 480px)` block of `block.css`.
- **Worker note (Phase 1):** `ToolbarAction` also carries `testid?` (the Toolbar builds item testids from it). `onvariant` (a handler name) remains in `header-actions.ts`; only the `variant` field is gone.

---

## Decided by owner 2026-10-04

- **D1:** Toolbar is built generic and adopted in Essay now; Generic, Governance and Guides adopt it in #424 (avoids touching their headers twice).
- **D2:** Document (New, Copy, Copy for agent, Export, Export markdown) / View (Margin notes, Comments; Wide arrives with #424) / Go (Explorer, Open another) menus, plus a lone `?` Help icon.
- **D3:** The hover strip is Hide, Zoom and Copy link (`primary: true`). Draft and Delete are in ⋯ only. The drag handle does not anchor the strip.
- **D4:** Save is always visible as the primary, disabled while saving or when there is nothing to save (wired from `documentDirty`), with the status beside it. Read-only repositories keep today's behaviour: no Save, `readOnlyReason` shown.
