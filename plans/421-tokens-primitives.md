# Plan: Tokens as theming API and primitive consolidation (#421)

## Summary

Phase 2 of story muDemocracy.org#282. The `/styleguide` route (#420) exposed three problems:
1. **Components bypass the token surface.** Many read raw palette tokens (`--ink`, `--paper`, `--black`, `--grey-*`) or hard-coded colours, so a theme that re-points only the semantic `--color-*` tokens misses them. Some use undefined fallbacks (`var(--white,#fff)`, `var(--paper,#fff)`). The `ink-surface` SVG filter exists only inside `GovernanceShell.svelte`.
2. **Small controls are inconsistent.** There are about ten button looks, four "×" buttons, three popovers with three dismissal models, and emoji/Unicode glyphs used as icons.
3. **Rail components do not fit the rail.** `McpConnection`, `BinTray` and the panel actions use raw `btn` classes or their own button styles, and `McpConnection` overflows at the real rail width (18rem).

This plan fixes them in five ordered phases, each with its own gate and commit:
1. Token tiers and theme hardening.
2. `Button size="sm"`, `IconButton` on Lucide, every glyph replaced.
3. One `Popover` primitive.
4. Conformance sweep of the remaining components.
5. Styleguide at real widths, plus the overflow and "no stray colour" checks.

It is presentation only. It adds no SRS semantics and no WASM change.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrating session |
| Web App Worker | Sonnet subagent (one worker, phases in order) |
| Verification | Haiku subagent (after each phase gate and before sign-off) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client: this is presentation only; no SRS semantics in TS | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | The skinning surface is tokens plus the `theme` layer; `/styleguide` is the single specimen surface. This plan makes it true: components read only semantic and component tokens | accepted (this plan implements its "Consequences" item on hard-coded colours) |
| ADR-020 (new, `docs/adr/020-icon-set-and-component-token-api.md`) | (a) **Lucide (`@lucide/svelte`, ISC) is the single icon set**: per-icon imports, `currentColor`, no icon-name strings, no full-set import. (b) **Component tokens `--<block>-<property>[-<state>]` are the public skin API**, declared on `:root` in the `tokens` layer, never on the component selector. (c) **`data-part="<name>"` marks documented component internals**: short lower-kebab-case names scoped to their component. (d) One breakpoint source, `src/lib/breakpoints.ts`, plus a drift test. (e) **`Popover` uses the native HTML `popover` attribute (top layer) with CSS anchor positioning where supported and a small JS fallback** | accepted (owner decided all of (a)-(e) on 2026-10-04) |
| [ADR-007](../docs/adr/007-frontend-css-themes.md) | Out of scope: rendered-document preview themes | accepted |

The owner has decided the three formerly open choices (see "Decided by owner 2026-10-04"). ADR-020 uses the ADR-019 header format (Status, Date, Issue, Supersedes, Amends, Superseded by). It lists the alternatives considered. For icons: Phosphor (heavier, weight variants we do not need) and Tabler (larger set, same idea). For tiers: component tokens declared on the component selector (rejected because a `:root` skin cannot override them).

## Contracts

### WASM API surface

**No** new or changed WASM methods.

### TypeScript types

No SRS types change. Two UI types change:
- `MenuAction.icon` in `src/lib/components/menu-action.ts` becomes a Lucide icon component (`import type { Component } from "svelte"`), no longer a glyph string.
- `ParagraphAction.icon` in `src/lib/essay/paragraph-actions.ts` changes in the same way.

### New dependency

`@lucide/svelte`, added with `npm install @lucide/svelte`. It is the only new dependency. Commit the `package.json` and `package-lock.json` changes. Import each icon from its own path, for example `import Eye from "@lucide/svelte/icons/eye"`. The worker verifies each icon name against `node_modules/@lucide/svelte/dist/icons/` before use, because Lucide renames icons between releases.

## Scope

**In scope**
- Token tiers and theme hardening (Phase 1).
- `Button` size `sm`, `IconButton`, and replacing every emoji, Unicode glyph and hand-drawn SVG icon (Phase 2).
- `Popover`, with ActionMenu, MarkdownHelp, the ParagraphMargin "+N" list and HoverCard on it (Phase 3).
- A conformance sweep of the components listed in Phase 4.
- The styleguide at real widths and the two new checks (Phase 5).

**Out of scope**
- `Toolbar` (#423).
- AppShell and the hamburger (#424).
- Compact `ActorChip`, `ActorStack` and annotations (#422).
- `NavTree` (#425).
- The Guides, Governance and Generic shells' own scoped `<style>` blocks, and the rest of the shells' raw colours. They are unlayered and are retired by #424, so Phase 1 only changes shared component CSS and the files named below. The Phase 1 static check is scoped to `src/styles/**` and `src/lib/components/**`.
- `CommentBadge`'s "+" and numeric count are plain text, not glyph icons, and stay as they are.

**Deviations from the story plan**
- The story plan says BinTray moves onto `BlockStack`. BinTray's rows are not draggable and not drop targets, so `BlockStack`'s drag logic would be dead weight. BinTray and DraftTray instead share one new `TrayRow` component (Phase 4). DraftTray keeps `BlockStack` because it does drag-and-drop.
- The story plan promised "one inline-SVG icon set". The owner chose Lucide instead, which is the same intent.

## Existing tests likely affected

**Selector disposition rule.** A deleted class has exactly one of two fates, listed here: (re-point) the selector is changed in the same commit as the markup; or (keep) the class survives. No aliases are added. The table is the contract.

| Class | Fate | Selector becomes |
|---|---|---|
| `draft-tray`, `bin-tray`, `pinned__item`, `layers__label`, `layers`, `panel-rail`, `pinned__full`, `margin__item`, `margin__text`, `eye`, `eye--inherited`, `is-off`, `block__handle`, `block__render`, `block__body`, `block__title`, `glyph`, `comments__text` | **kept** (root and content classes) | unchanged |
| `draft-tray__row`, `draft-tray__label` (essay-editor 159, 375) | deleted in Phase 4 (`TrayRow`) | `.draft-tray [data-part="row"]`, `.draft-tray [data-part="label"]` |
| `pinned__action` (essay-editor 296) | deleted in Phase 3 (`Button sm`) | `.pinned__item` `getByRole("button", { name: "Open" })` |
| `hover-card__kind` / `__text` (essay-editor 287, 302, 305; AttachmentGlyph.test 18, 62, 74) | renamed in Phase 3 | `.attachment-preview__kind` / `.attachment-preview__text` |
| `hover-card__remove` (essay-write-guard 187; essay-editor 309) | **kept** (the "Remove link" button keeps this class and gains `data-part="remove"`) | unchanged |
| `block__action` (tests/Block.test.ts:67) | deleted in Phase 2 | `.block__tools [data-part="action"]` |

The worker must keep `data-testid`s, `aria-label`s and accessible names unchanged. Visible glyph text may change because it becomes an SVG.

**e2e (class selectors that must be re-pointed in the same commit as the markup change)**
- `e2e/essay-editor.spec.ts`: `.eye`, `.layers .eye--inherited`, `.layers .eye.is-off` (~129-135); `.layers .layers__label` (line 24); `.draft-tray` (~3 uses); `.draft-tray__label` (159); `.draft-tray__row` (375); `.glyph`; `.hover-card__text` (287), `.hover-card__kind` (302, 305), `.hover-card__remove` (309); `.pinned__item` (289, 311), `.pinned__action` (296), `.pinned__full` (297); `.block__render`, `.block__body`, `.block__title`; `getByRole("button", { name: "Hide Opening" | "Show Opening" | "Put back Claim" | "Restore Claim" | "Delete Opening permanently" | /Delete Opening$/ | /^Move Claim\./ })`. All role names must still resolve.
- `e2e/essay-write-guard.spec.ts:187`: `.hover-card__remove`.
- `e2e/essay-touch.spec.ts`: `paragraph-menu` and `layer-menu` (testids), "44px" size assertions on the ⋯ trigger, eye and fold (the hit-target token must keep the 44px minimum under `pointer: coarse`), `.block__body`.
- `e2e/mobile-layout.spec.ts`: `getByRole("region", { name: "Markdown cheat-sheet" })` and `getByRole("button", { name: "Close Markdown help" })` (both stay), `Reply` textbox, the `Comment` button, 360/390/844 widths, `.block__render`.
- `e2e/essay-comments.spec.ts`: `getByLabel("Your name")`, `.comments__text`, `comment-thread`, `comment-badge`, `/^Zoom to/`.
- `e2e/agent-channels.spec.ts` and `e2e/mcp-relay.spec.ts`: testids `mcp-status`, `mcp-caller-url`, `mcp-connect-open`, `mcp-connect-agent`, `mcp-library-connect`, `mcp-library-forget`, `mcp-copy`, `mcp-disconnect`, `mcp-rotate`, `mcp-takeover`, `mcp-agent-label`, `mcp-library-item`, `mcp-in-use`, plus `.mcp-relay`.
- `e2e/essay-purpose.spec.ts`, `e2e/essay-arrow-nav.spec.ts` and `e2e/essay-export-markdown.spec.ts`: header actions (`header-menu`, `header-menu-comments`) and the essay `<select aria-label="Essay">`.
- `e2e/styleguide.spec.ts`: extended in Phase 5.

**Vitest (`tests/`)**
- `tests/Block.test.ts:67` counts `.block__tools .block__action`. Change it to `[data-part="action"]` within `.block__tools` when `.block__action` is replaced.
- `tests/AttachmentGlyph.test.ts` (lines 18, 62, 74) reads `.hover-card__text`, `.hover-card__kind` and `.pinned__item .hover-card__kind`. Re-point them in Phase 3.
- `tests/ParagraphMargin.test.ts` reads `.margin__item > *:first-child` (30) and `.margin__text` (55, 61). `ParagraphMargin` keeps both classes (only the "+N" list changes), so these need no edit; re-run to confirm.
- `tests/ParagraphMargin.test.ts` (the "+N" overflow, `margin-more`, `margin-overflow`), `tests/McpConnection.test.ts`, `tests/ActorChip.test.ts`, `tests/CommentBadge.test.ts`, `tests/EssayShell.test.ts`, `tests/Panel.test.ts` and any `ActionMenu` or `Select` test. Run the whole suite after every phase.

---

## Phases

### Phase 1: Token tiers and theme hardening

**Goal:** Every shared component stylesheet reads only semantic or component tokens; the missing token families exist; `ink-surface` is defined once for every host.

**Agent:** Web App Worker

#### Tasks

**1. Component-token tier.**
- Create `src/styles/tokens-components.css`, imported from `index.css` as `layer(tokens)` right after `tokens.css`.
  - Naming convention: `--<block>-<property>[-<state>]`. Examples: `--btn-bg`, `--btn-fg`, `--btn-border`, `--btn-primary-bg`, `--icon-btn-fg`, `--popover-bg`, `--popover-border`, `--popover-shadow`, `--comment-surface`, `--hue-pill-s`.
  - Declare each on `:root`, with a default that references a **semantic** token. Do **not** declare them on the component selector: a skin's `:root[data-theme]` rule would then lose to the component's own declaration.
  - Component CSS reads them, for example `.btn { background: var(--btn-bg); }`. Variants re-assign the token on the variant selector, for example `.btn--primary { --btn-bg: var(--btn-primary-bg); }`.
- Add the missing semantic tokens to `tokens.css`, each with a default derived from the existing palette, so no component needs a raw `--paper`, `--ink`, `--black` or `--grey-*`:
  - Colour: `--color-text-strong`, `--color-nav-bg`, `--color-focus`, `--color-overlay`, `--color-on-accent` (for filled controls), `--color-surface-raised` (popover and card surface, defaulting to `--color-page`), `--color-hover`.
  - `--radius-sm|md|pill`.
  - `--shadow-popover`.
  - z-index tokens: `--z-sticky: 5` (`layout.css` topbar), `--z-raised: 10` (`inspector.css:40`), `--z-dock: 50` (`mcp-connection.css:68`, `inspector.css:60`), `--z-overlay: 100` (the four modals: `DecisionLinkPicker`, `GitSaveModal`, `SuccessorModal`, `SourceChooser`), `--z-grain: 9999` (`base.css:38`, the paper-grain `body::after`; it must stay above everything and is a deliberate exception to the scale, so it is a named token rather than a literal).
  - The popover surface z-indexes (`action-menu.css:34`, `attachment.css:33`, `md-help.css:29`, `margin.css:54`) are **not** tokenised: they disappear in Phase 3 because top-layer popovers need no z-index. Leave them untouched in Phase 1.
  - Excluded: `GuidesShell.svelte:927` (shell, #424).
  - Checklist: `grep -rn "z-index" src` returns only `var(--z-*)` uses plus the four popover lines (until Phase 3) and `GuidesShell.svelte`.
  - `--focus-ring: 2px solid var(--color-focus)` and `--focus-offset: 1px`.
  - `--hit-target: 24px`, with `@media (pointer: coarse) { :root { --hit-target: 44px; } }`.
  - `--rail-width: 18rem`, and change the `18rem` literal in `essay-shell.css:50` to use it.
  - Breakpoints: see task 4.
- Move the on-dark tokens to derived values: `--color-on-dark-muted`, `-faint`, `-line` and `-hover` become `color-mix(in srgb, var(--color-on-dark) N%, transparent)`, so a skin that changes `--color-on-dark` carries them along.

**2. Replace raw palette and hard-coded colour use in shared styles.**
- Files: all of `src/styles/components/*.css`, `base.css`, `layout.css` and `utilities.css`, plus `src/lib/components/*.svelte` scoped `<style>` blocks.
- Rule: no `var(--ink|--paper|--black|--grey-N|--white)`, no hex, `rgb()` or `hsl()` literal outside `tokens.css`, `tokens-components.css` and `themes/`.
- Delete every `var(--x, <fallback>)` where the token is not defined (`--white`, `--paper`, `--color-border`, `--color-warn-bg`, `--accent`, `--error` and others). Map each to the correct defined token. If none fits, add a semantic token rather than keeping a fallback. `grep -rnE 'var\(--[a-z-]+, ?[#a-z0-9]' src` must return nothing in `src/styles/**` and `src/lib/components/**`.
- **Hue pills** (`.actor-chip`, `.glyph`). Their `hsl(var(--x-hue) S% L%)` literals move to tokens `--hue-pill-s`, `--hue-pill-l-border`, `--hue-pill-l-bg`, `--hue-pill-l-fg`, `--hue-pill-l-solid` in `tokens-components.css`, with defaults copied exactly from today's numbers so computed colours are identical. `.glyph.is-pinned` text `#fff` becomes `var(--color-on-accent)` (default `#fff`). Unifying the two classes is #422.
- `SourceChooser.svelte` and `DecisionLogView.svelte` carry the most raw uses of the palette tokens in components (26 and 15). Convert both.
- The static check (task 6) enforces the rule from now on.

**3. Define `ink-surface` once, for every host.**
- Move the `<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs><filter id="ink-surface" …>…</filter></defs></svg>` markup from `GovernanceShell.svelte:~931-941` into `index.html`, as the first child of `<body>`, before `<div id="app">`.
- Why `index.html`: Vite serves the same `index.html` for `/` and `/styleguide`, so every host gets it with no component, no mount order and no duplicate `id`. The Svelte `mount` targets `#app` only.
- Delete the markup from `GovernanceShell.svelte`. Fix the stale comments in `Nav.svelte:5`, `nav.css:8` and `src/lib/components/README.md:39`.
- Verify with `document.getElementById("ink-surface")` on `/` and `/styleguide`.

**4. One breakpoint source.**
- Constraint: CSS custom properties cannot be used inside `@media`, and PostCSS custom-media is not installed. Add no tooling.
- Create `src/lib/breakpoints.ts`:
  - Export `BREAKPOINTS = { phone: 480, compact: 720, rail: 960 /* plus any other width a current @media uses, named by role */ } as const`.
  - Export `NARROW = "(max-width: 480px)"`, derived from `BREAKPOINTS.phone`.
  - Delete `src/lib/components/narrow.ts` and update both importers (see below).
- In CSS, keep literal widths, but annotate each query as `@media (max-width: 480px) { /* bp: phone */ …`.
- Add `tests/breakpoints.test.ts` as the drift guard. It reads every `*.css` and `*.svelte` under `src/`, extracts each `(max-width|min-width: Npx)` and fails if N is not in `BREAKPOINTS` (a `min-width: 1101px` is accepted as `max 1100 + 1`). It prints the offending file and width.
- The `@media` widths actually in use today (verified by grep) and the role name for each, to be used verbatim in `BREAKPOINTS`:

  | px | role name | used by |
  |---|---|---|
  | 480 | `phone` | `block.css`, `comments.css`, `margin.css`, `essay-shell.css` |
  | 600 | `genericNarrow` | `GenericSrsShell.svelte` (shell; listed, not changed) |
  | 640 | `form` | `base.css`, `SourceChooser.svelte`, `CreateGovernanceDocumentPanel.svelte` |
  | 720 | `compact` | `layout.css`, `nav.css`, `card.css`, `block.css`, `essay-shell.css` |
  | 900 | `genericStack` | `GenericSrsShell.svelte` (shell; listed, not changed) |
  | 960 | `rail` | `panel.css`, `essay-shell.css` |
  | 1100 | `wide` | `layout.css`, `inspector.css`, `GuidesShell.svelte` (as `min-width: 1101px`, i.e. `wide + 1`) |

  The worker re-greps before writing the file and adds any width found that is not in this table. Do not change behaviour or merge widths.
- **Drift test regex** (`tests/breakpoints.test.ts`) is anchored to `@media`: scan each file for `/@media[^{]*\{/g`, and inside each match extract every `/\(\s*(max|min)-width\s*:\s*(\d+)px\s*\)/g`. A `min-width` of N passes when N-1 is in `BREAKPOINTS` (the 1101px case). Do not scan outside `@media` prelude text, so `width: 480px` declarations and `min-width:` properties are ignored. Non-width queries (`hover: none`, `pointer: coarse`) are ignored.
- **`narrow.ts` removal.** Its only importers are `src/lib/components/PinnedPane.svelte:8` (`'./narrow.js'`) and `src/lib/essay/EssayShell.svelte:33` (`"$lib/components/narrow.js"`). Update both to `$lib/breakpoints`. Acceptance is mechanical: `grep -rnE "narrow(\.js)?['\"]" src tests` returns nothing, and `src/lib/components/narrow.ts` does not exist.

**5. Theme layer plumbing.**
- `src/styles/themes/demo.css` is rewritten in Phase 5, not here. In this phase only confirm it still parses and that the `theme` layer order is unchanged.

**6. Static guard.**
- Add `tests/styles-tokens.test.ts` (vitest, node `fs`).
  - Scope: `src/styles/**/*.css` (excluding `tokens.css`, `tokens-components.css`, `themes/**`, `components/styleguide.css`) and the `<style>` blocks of **all** `src/lib/components/*.svelte`. Shells, editors and `App.svelte` are out of scope (#424) and are not scanned. Comments are stripped before matching.
  - Flags: `var\(--(ink|paper|black|grey-\d|white)\b`; hex `#[0-9a-fA-F]{3,8}\b`; `rgba?\(`; `hsla?\(`; and **colour fallbacks only**: `var\(--[\w-]+\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|(white|black|red|gray|grey|blue|green|yellow|orange)\b)`. Numeric fallbacks (`var(--x, 12px)`) and `transparent`/`currentcolor` are **not** flagged.
  - It has an explicit `ALLOW` array of `{file, pattern, reason}`. Every entry needs a one-line reason, for example "SVG feTurbulence has no colour".
- **Dead fallbacks on defined tokens are removed**, not allow-listed: if a token exists in `tokens.css`, drop the fallback (for example `var(--inspector-width, 320px)` at `inspector.css:59`, and any `var(--color-surface, #fff)`).
- **Files the test will initially flag, with counts from a grep of the base commit** (raw-palette uses, plus fallback/literal counts). The worker converts every one in this phase:
  - `src/styles/**`: `button.css` (26), `field.css` (20), `card.css` (16), `tag.css` (15), `diagnostics.css` (15), `lifecycle.css` (7), `tag-chip.css` (6), `nav.css` (5), `attachment.css` (5 fallbacks, 7 literals), `comments.css` (3 fallbacks, 4 literals), `mcp-connection.css` (2 fallbacks, 3 literals), `inspector.css` (2, 2), and smaller counts in `log-table`, `layers`, `block`, `base`, `utilities`, `layout`, `margin`, `md-help`, `panel`, `inline-text`, `essay-shell`, `agent-activity`, `action-menu`.
  - `src/lib/components/*.svelte`: `SourceChooser` (26 raw palette, 5 literals), `DecisionLogView` (15 fallbacks, 15 literals), `Migrations` (13, 14), `DecisionLinkPicker` (7, 10), `AttachmentsPanel` (5, 7), `ViewPicker` (5, 5), `GitSaveModal` (4, 5), `AttachmentLinkPanel` (2, 3), `RecordReading` (2, 2), `SrsMark` (2, 3), `CreateGovernanceDocumentPanel` (2, 2), `DecisionSummaryCard` (2, 1), `SuccessorModal` (1, 2), `PreviewPane` (1, 1). One-hit files `ActionMenu`, `ActorChip`, `AgentFeed`, `AttachmentGlyph`, `CardField`, `CommentBadge`, `Diagnostics`, `HoverCard`, `MarkdownText`, `McpConnection`, `Panel`, `ParagraphMargin`, `PinnedPane`, `TagChip`: mostly comments; confirm each and fix any real one.
  - Not scanned: `GuidesShell`, `GovernanceShell`, `GenericSrsShell`, `BlueprintDocumentEditor`, `SectionForm`, `App.svelte` (shells, editors and the app frame: #424).
- The test must be green at the end of the phase.

**7. ADR-020.** Write `docs/adr/020-icon-set-and-component-token-api.md` with status `accepted` (the owner decided). Each part is written by the phase that implements it: Phase 1 writes (b) component tokens, (d) breakpoints **and (c) the `data-part` contract** (naming rule only: short lower-kebab-case, scoped to the component; the per-component part tables are added in Phases 2 to 4 as parts are added), so the contract exists before any `data-part` is added; Phase 2 writes (a) icons; Phase 3 writes (e) native popover plus JS positioning.

#### Acceptance Criteria

- [x] `tests/styles-tokens.test.ts` and `tests/breakpoints.test.ts` pass.
- [x] `grep -rn "ink-surface" src index.html` shows the definition only in `index.html`.
- [x] `tests/styles-tokens.test.ts` is green. Its colour-fallback regex is the acceptance grep (the same pattern, nothing looser or stricter), and it scans **all** `src/lib/components/*.svelte` `<style>` blocks and `src/styles/**`; the per-file list in task 6 is the work list, not the scan scope.
- [x] Runnable check (add to `e2e/styleguide.spec.ts`): exactly one `filter#ink-surface` exists, and `document.getElementById("ink-surface")` is non-null, on `/` and on `/styleguide`.
- [x] Default-theme appearance is unchanged to the eye. Spot-check `/styleguide` and the essay editor.
- [x] `src/lib/components/narrow.ts` is gone; `grep -rnE "narrow(\.js)?['\"]" src tests` returns nothing; `NARROW` is imported from `$lib/breakpoints` in `PinnedPane.svelte` and `EssayShell.svelte`.

#### Testing

First, in a fresh worktree: `npm ci` and `npm run fetch-bindings` (the WASM bindings are a prerequisite for `npm test` and every Playwright spec).

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/styleguide.spec.ts e2e/essay-editor.spec.ts e2e/mobile-layout.spec.ts e2e/navigation.spec.ts
```

#### Milestone gate

1. Every acceptance criterion above is met.
2. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
3. Mark the checkboxes `[x]` in this file.
4. Commit: `feat: component-token tier, theme hardening, single ink filter and breakpoint source (#421)`.

Do not start Phase 2 until this passes.

---

### Phase 2: Button `sm`, IconButton on Lucide, every glyph replaced

**Goal:** One small-control component renders every icon; no emoji or Unicode glyph is used as an icon anywhere.

**Agent:** Web App Worker

#### Tasks

1. `npm install @lucide/svelte`. Commit the lockfile.
2. **`Button.svelte`:** add `size?: "md" | "sm"` (default `md`) and the class `btn--sm`.
   - `btn--sm`: reads `--btn-sm-padding` and `--btn-sm-size` tokens, `min-height: var(--hit-target)`, and wraps its label (`white-space: normal`, `min-width: 0`).
   - Convert the hard-coded values in `button.css` to the component tokens from Phase 1.
3. **`IconButton.svelte`** (new, exported from the barrel):
   - Props: `icon: Component` (a Lucide icon), `label: string` (required; becomes both `aria-label` and `title`), `size?: "sm" | "md"`, `variant?: "plain" | "outline"`, `pressed?: boolean` (renders `aria-pressed`), `class`, plus all native button attributes via `...rest`.
   - Renders `<button type="button" class="icon-btn" data-part="icon-btn"><Icon size={16} aria-hidden="true" /></button>`.
   - CSS in a new `src/styles/components/icon-button.css`, added to `index.css`. It reads `--icon-btn-fg`, `--icon-btn-hover-fg` and `--hit-target`, and uses `--focus-ring`.
   - Lucide icons use `currentColor`, so the colour follows the token with no extra work.
   - **Precedence with `.block__handle`.** The handle is `<IconButton class="block__handle" …>`; `.icon-btn` sets `min-width/min-height: var(--hit-target)` (24px, 44px under `pointer: coarse`). `icon-button.css` is imported **before** `block.css` in `index.css`, so same-layer, same-specificity `.block__handle` rules win. `block.css` keeps its `@media (pointer: coarse) { .block__handle, … { min-width: 44px; min-height: 44px } }` rule, so `e2e/essay-touch.spec.ts:35` (handle, menu trigger and `add-paragraph` at least 44px) still passes. The same applies to `.layers__fold`, `.eye` and the ActionMenu trigger.
4. **Replace every glyph control with `IconButton` or a Lucide icon.** Each icon is imported from its own path. Verify the names exist in the installed package.

| Today | Where | Replace with (suggested Lucide name) |
|---|---|---|
| `⋮⋮` drag handle | `Block.svelte` `.block__handle` | `grip-vertical`, as an `IconButton` that still spreads `handle` and `onkeydown` and keeps its `aria-label` and `data-focus-key` |
| `⋯` | `ActionMenu` trigger | `ellipsis`, as an `IconButton`; keeps `data-testid`, `data-focus-key`, `aria-haspopup`, `aria-expanded` |
| `+ ↑ ↓ → ←` and other `icon` strings | `paragraph-actions.ts` entries, `.action-menu__icon` | `plus`, `arrow-up`, `arrow-down`, `indent-increase`, `indent-decrease`, `eye`/`eye-off`, `arrow-down-to-line` (draft, was `↧`), `trash-2`, `maximize-2` (zoom, was `⤢`), `link` (was `🔗`), `bot` (agent), `pencil` (rename) |
| hover tools (`.block__action`) | `Block.svelte` | `IconButton` (delete `.block__action` from `block.css`) |
| `?` | `md-help__btn` in `EssayShell.svelte` | `circle-help` (or the current name) as an `IconButton`. Phase 2 keeps its existing `onclick={a.run}` and `aria-expanded={helpOpen}`; both are **temporary**: Phase 3 replaces the `onclick` with the `popovertarget` invoker and owns `aria-expanded` (do not wire it twice) |
| `×` | `md-help__close`, `pinned__close`, `tag-chip__remove`, the essay notice dismiss in `EssayShell.svelte:519` | `x` as an `IconButton`; keep their `aria-label`s ("Close Markdown help", "Unpin …", "Remove tag …", "Dismiss") and testid `tag-chip-remove` |
| `▸ ▾` | `LayersPanel` fold; `panel.css` `summary::before` | `chevron-right` / `chevron-down` (Panel: one `chevron-down` in the summary rotated by CSS on `:not([open])`; delete the `content:` rules) |
| `→ ←` | `ParagraphMargin` relation marks | `arrow-right` / `arrow-left` |
| `⧉` | `ParagraphMargin` "shared" mark | `copy` |
| `◉` | `paragraph-actions.ts` `hide` entry's menu icon | `eye` (and `eye-off` when the paragraph is hidden) |
| `✕` | `paragraph-actions.ts` `delete` entry | `trash-2` |
| `✎` | `paragraph-actions.ts` `rename` entry | `pencil` |
| `↓` `✓` | `AttachmentLinkPanel.svelte:108,130`, `AttachmentsPanel.svelte:204` | `arrow-down`, `check` (as `IconButton` where it is a button; keep aria-labels) |
| `×` `↑` | `SourceChooser.svelte:344` (close), `:384` (up-folder) | `x`, `corner-left-up` (as `IconButton`) |
| `🔗` | `EssayShell.svelte:559` (`.essay-shell__narrow-icon` in the zoom-bar Copy link) | `link` icon inside the existing `Button`; keep `data-testid="zoom-copy-link"`, `aria-label="Copy link"` and the `.essay-shell__label` text |
| eye SVG | `EyeToggle.svelte` | Lucide `eye` / `eye-off`. Keep the `<button class="eye" aria-pressed>`, `.is-off`, `.eye--inherited` and the aria wording |

- `MenuAction.icon` and `ParagraphAction.icon` become `Component`. `ActionMenu` renders `<Icon size={16} aria-hidden="true" />` inside `.action-menu__icon`.
- Where an icon can stand in for a text label in a rail or tray, use `IconButton` with a `label`: DraftTray "Put back" (`corner-up-left`), BinTray "Restore" (`undo-2`) and "Delete permanently" (`trash-2`), McpConnection "Copy" (`copy` / `check` when copied), "Rotate URL" (`refresh-cw`, with an `sm` text label where there is room). The existing `aria-label`s stay, so e2e role names still resolve.
- `Block.svelte`: add `data-part="gutter" | "handle" | "tools" | "action" | "menu" | "margin" | "head" | "title" | "body"` to the existing elements. Keep the BEM classes.
- **Glyph scope and inventory.** Regex: `[◉✕✎✓×↑↓→←⋮⋯↧⤢🔗⧉▸▾]` (also matches `⋮⋮`). Scope: `src/lib/components/**`, `src/lib/essay/**` (`paragraph-actions.ts`; `header-actions.ts` has none), `src/styles/**`, and `src/App.svelte` (its only hit is a comment). Every hit in scope is either replaced by a Lucide icon or listed as an exception in the commit message with a reason. Decisions:
  - **Replaced:** every row in the table above, plus the glyphs in `ActionMenu`, `Block`, `LayersPanel`, `MarkdownHelp`, `PinnedPane`, `TagChip`, `ParagraphMargin`, `EssayShell`, `EyeToggle`, `Panel` (`panel.css` `\25BE`/`\25B8`), and `RecordReading.svelte:27` (`← {sectionLabel}` becomes an `arrow-left` icon plus the text, because it is a component). Comments in `block.css`, `layers.css`, `ActionMenu.svelte` and `LayersPanel.svelte` that name a glyph are reworded ("ellipsis menu", "drag handle").
  - **Kept, justified:** `GitSaveModal.svelte:78` ("Install / manage on GitHub →" is link text, not an icon), `FieldInput.svelte` header comment and the `24×24` multiplication sign in `field.css`/`card.css` comments, and lifecycle transition names that come from the engine (`→ propose`).
  - **Out of scope, justified:** `GuidesShell`, `GovernanceShell`, `GenericSrsShell` (shells, #424); `BlueprintDocumentEditor.svelte` and `SectionForm.svelte` (editors with their own scoped styles; the owner files a follow-up, not this plan); `src/rendering/*`, `src/lib/storage/github.ts`, `srs-client.ts`, `document-model.ts`, `decision-export-utils.ts`, `governance/types.ts` (data and export strings, not UI icons).
- **`Annotation.icon` strings are data keys, not icons.** In `src/lib/essay/annotations.ts`, `icon` carries `neighbourType` / `relationType` / attachment `kind` (for example `"refines"`, `"spreadsheet"`). They are shown as text and drive the hue. They are not Lucide names and are never passed to `IconButton`. The only icons `ParagraphMargin` draws are the fixed arrows (`arrow-right`/`arrow-left`) and `copy`, chosen in the one map already in that component.
- `tests/Block.test.ts:67`: change to `container.querySelectorAll('.block__tools [data-part="action"]')` (still 3).
- Append the "icons" section to ADR-020 (part a), and add the `Block` and `IconButton` rows to the (c) part table.
- Styleguide: add a "Buttons and icons" specimen row: `Button` md and sm in each variant, `IconButton` in plain, outline, pressed, disabled, and every icon actually used. Add an `#icons` entry to the TOC. No new section heading is needed beyond adding to `#buttons`.

#### Acceptance Criteria

- [x] `rg "[◉✕✎✓×↑↓→←⋮⋯↧⤢🔗⧉▸▾]|\\\\(2192|2190|2191|2193|25BE|25B8|25B4|25BC|2715|22EE|22EF)" src/lib/components src/lib/essay src/styles --glob '!*.md'` returns only the exceptions listed in the commit message. This covers CSS escape forms.
- [x] Decision on `lifecycle.css:56` (`content: "\2192"`, the arrow on a lifecycle transition label): **kept** as a listed exception, because it decorates text that comes from the engine's transition names (`→ propose`) and CSS `content` cannot host an SVG component. `panel.css` `\25BE`/`\25B8` are replaced by the Lucide chevron.
- [x] The bundle imports icons only through `@lucide/svelte/icons/*`: `grep -rn "from \"@lucide/svelte\"\|from '@lucide/svelte'" src` returns nothing.
- [x] Every `IconButton` has a non-empty `label` (a compile-time `label: string`, plus a unit test that renders one and checks `aria-label` and `title`).
- [x] `e2e/essay-editor.spec.ts`, `essay-touch.spec.ts` and `essay-comments.spec.ts` pass.
- [x] 44px hit targets still hold under `pointer: coarse`.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/essay-editor.spec.ts e2e/essay-touch.spec.ts e2e/essay-comments.spec.ts e2e/mobile-layout.spec.ts e2e/styleguide.spec.ts
```

#### Milestone gate

1. Every acceptance criterion above is met.
2. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
3. Mark the checkboxes `[x]`.
4. Commit: `feat: Button sm, IconButton on Lucide, replace glyph controls (#421)`.

---

### Phase 3: Popover primitive and one dismissal model

**Goal:** One `Popover` owns open state, positioning and dismissal; `ActionMenu`, `MarkdownHelp`, the ParagraphMargin "+N" list and `HoverCard` use it; `MarkdownHelp` works standalone.

**Agent:** Web App Worker

#### Tasks

1. **`Popover.svelte`** (new, barrel-exported). **Native top layer plus JS positioning (owner decision).**
   - Props: `open = $bindable(false)`, `placement?: "bottom-start" | "bottom-end"` (default `bottom-start`), `mode?: "auto" | "manual"` (default `auto`), `label: string`, `role?: "menu" | "dialog" | "region" | "tooltip"` (default `dialog`), `onclose?: () => void`, `anchor?: HTMLElement` (defaults to the trigger), `trigger?: Snippet<[{ open: boolean; toggle: () => void; props: Record<string, unknown> }]>`, `children: Snippet`, `class`.
   - Markup: the trigger snippet, then `<div class="popover__surface" data-part="surface" popover={mode} {role} aria-label={label} bind:this={surface}>…</div>`. The surface is **always rendered** (the browser hides it); open/close calls `surface.showPopover()` / `surface.hidePopover()` from an `$effect` on `open`, and a `toggle` event listener on the surface syncs `open` back (so native light-dismiss updates the bound state).
   - **Modes.** Menus, MarkdownHelp and the "+N" list use `mode="auto"`: native light-dismiss (outside click) and Escape come free. Hover/tooltip previews (HoverCard) use `mode="manual"` (the host decides when to show/hide; no light-dismiss).
   - **Positioning, written once** in `src/lib/components/popover-position.ts`:
     - If `CSS.supports("anchor-name: --x")`: give the trigger a unique `anchor-name` (inline style, `--popover-N`), the surface `position-anchor`, `position-area` (`bottom span-right` for `bottom-start`, `bottom span-left` for `bottom-end`) and `position-try-fallbacks: flip-block, flip-inline`.
     - Otherwise a small pure function `placeNextTo(anchorRect, surfaceSize, viewport, placement)` returns `{top, left}` using `getBoundingClientRect()`: it places the surface below the anchor, aligned to the placement edge, **flips above** if it would overflow the viewport bottom, and clamps horizontally into the viewport. It sets `top`/`left` inline on the surface (`position: fixed` is the UA default for popovers). While open it repositions on `scroll` (capture, so scrolling ancestors count) and `resize`, and removes the listeners on close.
     - `placeNextTo` is pure so it is unit-tested directly (`tests/popover-position.test.ts`: below, flip above, clamp left/right).
   - `.popover` wrapper is only `display: inline-flex` (no `position: relative`; nothing is positioned against it). The surface uses `--popover-bg`, `--popover-border`, `--shadow-popover`, `max-width: min(22rem, 90vw)`, `margin: 0` (UA popover margin reset) and `inset: auto` before positioning. No `--z-popover` token exists: top-layer surfaces need no z-index.
   - **Props contract and the surface id.** `Popover` accepts an optional `id` prop and otherwise generates one (`$props.id()`; if the installed Svelte lacks it, a module counter `popover-N`). It passes the id to the trigger snippet as `props.popovertarget` (with `popovertargetaction: "toggle"`), so every trigger is a real invoker. Hosts that render their own trigger (MarkdownHelp, below) pass `id` and put `popovertarget={id}` on their button.
  - **Show/hide guards.** The `open` effect is idempotent: `if (open && !surface.matches(":popover-open")) surface.showPopover(); else if (!open && surface.matches(":popover-open")) surface.hidePopover();`. `CSS.supports` and `matches(":popover-open")` are themselves guarded (`typeof CSS !== "undefined"`, try/catch around the selector) because happy-dom lacks them; the absent case takes the JS-placement fallback and the `is-open` class path.
  - **Dismissal model, written once:**
     - Native `auto` light-dismiss closes on outside pointerdown and on Escape. The `toggle` event handler syncs `open = false` and calls `onclose`. **Focus return relies on the browser's native popover focus restoration** (the invoker regains focus on close). Custom focus code exists only for `role="menu"`, where selecting a row focuses the trigger first (`ActionMenu`'s existing contract); it is not duplicated for dialogs or regions.
     - **Focus return on light-dismiss.** Native restoration only fires when focus is inside the popover at hide time; an outside click on a non-focusable area moves focus to `body` first. So `Popover` keeps one small focus-return for `role="menu"`: in the `toggle` handler, when `newState === "closed"` and `document.activeElement` is `body` or inside the surface, call `trigger.focus()`. A click on another focusable element keeps its own focus. The e2e assertions (focus on the trigger after Escape and after an outside click on non-focusable text) stay.
     - **No close-then-reopen race.** Native light-dismiss closes an `auto` popover on `pointerdown`; a trigger that toggled `open` in `onclick` would then reopen it. Rule: **a trigger never toggles `open` itself.** It is a real `popovertarget` invoker (the browser handles the invoker's own click natively) and `open` follows the `toggle` event. For openers that cannot be invokers (an `ActionMenu` row that opens another popover), see MarkdownHelp below.
     - `Tab` leaving the surface closes it, but only when `role="menu"`.
     - **HoverCard (`mode="manual"`) hover bridge.** There is no light-dismiss, so the host closes it. `AttachmentGlyph` hides the card on `mouseleave`/`focusout` after a 150 ms close delay that is cancelled by `mouseenter`/`focusin` on **either the glyph or the card surface** (the card is a top-layer sibling, so the pointer crossing the gap must not close it). This keeps "Remove link" reachable for mouse and keyboard users, as today. No touch claim is made: there is no hover on touch, and that is not a regression (the touch path to Remove link is `PinnedPane` and the paragraph menu). Escape also hides it. The delay constant lives in one place.
     - `role="menu"` adds the arrow-key row navigation currently in `ActionMenu`, moved into `Popover` unchanged in behaviour (rows are `[role="menuitem"]:not(:disabled)`; the first row is focused on open).
     - `mode="auto"` popovers close each other natively (only nested ancestors stay open), so no module-level `activeId` store is needed.
     - Because a popover is in the top layer, it is **never clipped by an `overflow: hidden/auto` ancestor** and never needs `z-index`. The styleguide frames (Phase 5) may therefore contain open popovers.
   - **happy-dom (vitest):** happy-dom may not implement `showPopover`/`hidePopover`/`:popover-open`. `Popover` must feature-guard: `if (typeof surface.showPopover === "function") …`, and when absent it falls back to toggling an `is-open` class and an inline `display` so component tests can still render and query the open state. Unit tests cover the guarded fallback (renders content, `open` toggles the class) and the pure `placeNextTo`. **All behaviour that depends on the real popover API (light-dismiss, Escape, top layer, anchor positioning, focus return, clipping) is tested in Playwright only**, not in vitest. `tests/Popover.test.ts` therefore asserts only the fallback path and that `showPopover` is called when it exists (via a stubbed method).
2. **`ActionMenu.svelte`:** becomes `Popover role="menu"` with an `IconButton` trigger. Keep the props (`actions`, `label`, `testid`, `title`, `focusKey`, `class`) and every `data-testid` (`paragraph-menu`, `paragraph-menu-<id>`, `layer-menu`, `header-menu`, `header-menu-<id>`). "Selecting a row focuses the trigger first so the shell's focus restore lands on it" must still hold. Delete the local `keydown`, `window onpointerdown` and `close` code. `placement` follows the existing `.action-menu--end` modifier (`class` or a `placement` prop).
3. **`MarkdownHelp.svelte`:** becomes `Popover role="region" label="Markdown cheat-sheet"`, with `open` now `$bindable` and `onclose` optional (see the wiring below).
   - Delete `.md-help__pop`'s positioning against `.essay-shell__bar` and the `data-md-help-trigger` hack in `MarkdownHelp.svelte` and `EssayShell.svelte`.
   - **Exact wiring (fixes the reopen race).** `MarkdownHelp` props: `open` (**`$bindable`**), `onclose?` (optional notification only), `id: string` (the surface id), `anchor?: HTMLElement`. `Popover`'s `open` is also `$bindable`. In `EssayShell.svelte`: `const helpId = "essay-md-help"`; `bind:this={actionsEl}` on `.essay-shell__actions`; `<MarkdownHelp id={helpId} anchor={actionsEl} bind:open={helpOpen} />`. The anchor is the actions cluster, so help is placed next to it in both desktop and narrow layouts.
     - **Desktop `?`** (the `a.id === "help"` branch of the `barActions` loop, `EssayShell.svelte:~506`): an `IconButton` with `popovertarget={helpId}`, `popovertargetaction="toggle"` and **no `onclick`**. The browser toggles natively, so pointerdown light-dismiss followed by click cannot reopen it. The surface `toggle` event handler sets `open` **both ways** (`open = e.newState === "open"`), so `bind:open={helpOpen}` follows native open and close. The `?` button's `aria-expanded` follows `helpOpen` (wired once, here).
     - **Narrow overflow menu:** the overflow `ActionMenu` renders the same `barActions`, whose `help` `run` is `() => requestAnimationFrame(() => { helpOpen = true; })`. Order: `ActionMenu.pick` hides the menu, focuses its trigger, then calls `run`; help opens one frame later, so it never overlaps the menu's close or its focus return. The open effect calls `showPopover()` guarded by `:popover-open`.
     - On open, focus moves to the help's close button. Escape returns focus to the invoker (desktop `?`) or the overflow menu trigger (narrow), both native.
     - **e2e (in `e2e/popover.spec.ts`, using the essay editor fixture from `essay-editor.spec.ts`):** (desktop, 1280px) click `?` opens help; click `?` again closes it and it stays closed (no reopen); open then Escape: closed and focus on `?`; open then click page text: closed. (Narrow, 390px) open `header-menu`, choose help: the menu is closed, the region "Markdown cheat-sheet" is visible and exactly one popover is open; Escape closes help with focus back on the `header-menu` trigger; an outside tap also closes it. `e2e/mobile-layout.spec.ts` (`Close Markdown help`) must still pass.
   - The "×" close is an `IconButton` with `aria-label="Close Markdown help"` (a test depends on it).
   - Standalone: `<MarkdownHelp open anchor={…} />` in `/styleguide` anchors to a labelled specimen button and opens in the top layer. Delete the `.sg__pop` workaround CSS in `styleguide.css`.
4. **`ParagraphMargin.svelte`:** the "+N" button and `.margin__list` become `Popover`. Keep `data-testid="margin-more"`, `data-testid="margin-overflow"` and the `aria-label` "N more annotations". Delete `.margin__list`'s own positioning and surface styling.
5. **Shared surface and preview card.**
   - `.popover__surface` is the single surface style. `.hover-card`, `.action-menu__list` and `.md-help__pop` use it, or become extensions of it that only add sizing. No other component defines `background` + `border` + `box-shadow` for a floating panel.
   - New `AttachmentPreview.svelte` (barrel-exported): the kind line, the title and the clamped text, which today live as `.hover-card__kind|title|text`. Classes become `.attachment-preview__kind|title|text`, with `data-part="kind" | "title" | "text"`.
   - `HoverCard.svelte` renders `AttachmentPreview` in a `Popover mode="manual" role="tooltip"`, shown and hidden by hover and focus on `AttachmentGlyph` (JS `mouseenter`/`mouseleave`/`focusin`/`focusout`, replacing the CSS `.glyph-wrap:hover .hover-card` reveal). Keep the `role="tooltip"` and the "Remove link" button as a `Button size="sm" variant="ghost"`, keeping the `.hover-card__remove` class (per the selector table; `e2e/essay-write-guard.spec.ts:187` and `essay-editor.spec.ts:309` need no change).
   - `PinnedPane.svelte` items render `AttachmentPreview` plus `IconButton` (`x`, `Unpin <title>`) and `Button size="sm"` for Open, Close, Copy and Remove link. Delete `.pinned__close` and `.pinned__action`.
   - **HoverCard standalone state:** add prop `static?: boolean`. When true the card renders in flow (no popover attribute; `position: static`), so `/styleguide` shows it without a hover. Add a `tests/AttachmentGlyph.test.ts` case for the guarded fallback. Update `tests/AttachmentGlyph.test.ts` (lines 18, 62, 74) and `e2e/essay-editor.spec.ts` (~287, 302, 305) to the new class names.
6. Write ADR-020 part (e) (native `popover`, anchor positioning with the JS fallback, the happy-dom guard, `auto` vs `manual`) and add the `Popover` and `AttachmentPreview` rows to the (c) part table. The Phase 3 gate requires part (e) to be present.
7. Styleguide, "Menus and popovers": ActionMenu (closed, and one forced open via a bound `open` if `Popover` exposes it), `MarkdownHelp open` standalone, HoverCard `static`, the ParagraphMargin "+N" overflow with more than `max` annotations, an `AttachmentPreview` specimen, and the **overflow-container popover specimen** (a `div` with `overflow: auto; height: 6rem` holding an `ActionMenu` trigger near its bottom edge, `data-testid="sg-popover-scroll"`; it is the fixture `e2e/popover.spec.ts` uses).

#### Acceptance Criteria

- [ ] One implementation of dismissal and focus-return exists: no component other than `Popover.svelte` listens for Escape or outside pointerdown to close a floating surface, and no floating surface is positioned with `position: absolute` against a wrapper (mechanical check: `grep -nE "position:\s*absolute|z-index" src/styles/components/action-menu.css src/styles/components/md-help.css src/styles/components/margin.css src/styles/components/attachment.css` returns nothing, i.e. the former surface selectors `.action-menu__list`, `.md-help__pop`, `.margin__list` and `.hover-card` no longer carry `position: absolute` or `z-index`).
- [ ] `e2e/popover.spec.ts` passes: a menu inside an `overflow: auto` container is fully visible and closes on Escape and outside click with focus returned.
- [ ] `MarkdownHelp` opens correctly with the essay header, with the narrow overflow menu at 390px, and standalone in `/styleguide`; the desktop and narrow e2e cases above pass.
- [ ] ADR-020 part (e) is present, and the `data-part` rows for `Popover` and `AttachmentPreview` are added.
- [ ] A keyboard user can open ActionMenu, arrow through rows, press Escape and have focus return to the trigger.
- [ ] `tests/AttachmentGlyph.test.ts`, `tests/ParagraphMargin.test.ts`, `e2e/essay-editor.spec.ts`, `essay-write-guard.spec.ts`, `essay-touch.spec.ts` and `mobile-layout.spec.ts` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/popover.spec.ts e2e/essay-editor.spec.ts e2e/essay-write-guard.spec.ts e2e/essay-touch.spec.ts e2e/mobile-layout.spec.ts e2e/essay-purpose.spec.ts e2e/styleguide.spec.ts
```

Add `tests/Popover.test.ts` and `tests/popover-position.test.ts` as described in task 1 (happy-dom: fallback path and the pure placement function only).

Add the Playwright spec `e2e/popover.spec.ts`, run against `/styleguide` with a dedicated specimen: a `div` with `overflow: auto; height: 6rem` containing an `ActionMenu` trigger near its bottom edge.
- Open the menu. Assert every `[role=menuitem]` bounding box lies inside the viewport and is not clipped by the container (compare against `document.elementFromPoint` at each row's centre returning that row), and that the menu flipped above the trigger if there is no room below.
- Press Escape: the menu is closed and `document.activeElement` is the trigger.
- Reopen, click outside on a non-focusable area: closed, and focus returned to the trigger.
- Reopen, click another focusable button outside: closed, and focus stays on that button.
- Scroll the container while open: the surface stays attached to the trigger (its top is within a few px of the trigger bottom, or above it when flipped).
- Run it in Chromium only (the pinned browser); note in the spec that the JS fallback is covered by `popover-position.test.ts`.

#### Milestone gate

1. Every acceptance criterion above is met.
2. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
3. Mark the checkboxes `[x]`.
4. Commit: `feat: Popover primitive; ActionMenu, MarkdownHelp, margin overflow and HoverCard on it (#421)`.

---

### Phase 4: Conformance sweep

**Goal:** No component in a rail, tray or panel uses raw button classes or a one-off control style; panel content wraps; hue pills, row layouts and form controls are shared.

**Agent:** Web App Worker

#### Tasks

1. **Raw `btn` classes and one-off buttons.** After this task `grep -rnE 'class="[^"]*\bbtn\b' src --include='*.svelte'` returns only `Button.svelte`, and no other file defines a `.xxx__put`, `.xxx__action`, `.xxx__close` or `.xxx__remove` button style.
   - `McpConnection.svelte`: Copy becomes `IconButton` (`copy`, changing to `check` for ~1.5 s after a copy; keep `data-testid="mcp-copy"` and the "Copied" state as `aria-label` text). Disconnect, Rotate URL and Take over become `Button size="sm"` (variants `ghost`, `ghost`, `secondary`). Rotate may be `IconButton refresh-cw` plus an `sm` label. Keep testids `mcp-disconnect`, `mcp-rotate`, `mcp-takeover` and the `title` text on Rotate.
   - `McpConnection` layout: `.mcp-conn__head` gets `flex-wrap: wrap`, the repo name drops below the status on narrow widths (no `margin-left: auto` forcing overflow), `.mcp-conn__url` wraps, `.mcp-conn__input` keeps `min-width: 0`, and every note and error uses `overflow-wrap: anywhere`. Drop the 28rem `max-width`; the component fills its container.
   - `DraftTray.svelte` and `BinTray.svelte`: see task 2.
   - `CommentThread.svelte`: the submit becomes `<Button size="sm" variant="mono" type="submit">`.
   - `App.svelte` `agentDock` (lines ~889-923): Connect and Forget become `Button size="sm"`. The name input and the `mcp-library-item` row use `Input` and the shared row layout. Keep every testid (`mcp-library-connect`, `mcp-library-forget`, `mcp-connect-agent`, `mcp-agent-label`, `mcp-library-item`, `mcp-in-use`, `mcp-connect-open`).
   - `EssayShell.svelte`: the notice × dismiss is already an `IconButton` (Phase 2).
2. **`TrayRow.svelte`** (new): `label` text (ellipsis, `min-width: 0`) plus an `actions` snippet that wraps (`flex-wrap`), with `data-part="row" | "label" | "actions"`. DraftTray rows and BinTray rows both render it; DraftTray keeps `BlockStack` and spreads `handle` on the label. Rows keep `data-testid="bin-row"`. Delete `.draft-tray__row|__label|__put` and `.bin-tray__*` duplicates in `draft-tray.css`, leaving one shared tray style (`.tray`). Actions are `IconButton`s with the existing `aria-label`s ("Put back X", "Restore X", "Delete X permanently"), so `e2e/essay-editor.spec.ts` role names still resolve. The "Create draft area" action becomes `Button size="sm"`.
3. **Form controls.**
   - The essay picker `<select aria-label="Essay">` in `EssayShell.svelte:484` becomes `<Select aria-label="Essay" …>`; the native `<select>` stays inside `Select`, so the accessible name "Essay" and the `combobox` role are unchanged. `Select` takes `options: string[]` today, but this picker needs `{value, label}` pairs. Add an optional `options` shape `string | {value: string; label: string}` to `Select`, keeping the string form working for existing callers, and add a `Select` unit test.
   - The comment name and reply inputs in `CommentThread.svelte` become `Input` and `Textarea`. Keep `aria-label="Your name"` and `aria-label="Reply"`, `required`, `rows`, and `field-sizing: content` as a modifier on the textarea. Delete `.comments__input` and `.comments__name`.
   - The link-fallback `<input readonly aria-label="Link">` in `EssayShell.svelte` and the McpConnection caller-URL input become `Input readonly`. Keep the testids `link-fallback` and `mcp-caller-url`.
4. **Hue unification is deferred to #422.** `hueOf`, a shared `.hue-pill` class and any `ActorChip` restructure belong to #422 (compact `ActorChip`/`ActorStack`). In #421 `AttachmentGlyph` and `ActorChip` keep their current hue functions and **their rendered colours must not change**. The only change is Phase 1's tokenisation of the literal `hsl()` values into `--hue-pill-*` tokens whose defaults equal the current numbers. `tests/ActorChip.test.ts` and `tests/AttachmentGlyph.test.ts` need no change.
5. **Panel content must wrap and never overflow at 18rem.**
   - Audit `panel.css`, `agent-activity.css`, `layers.css`, `comments.css`, `attachment.css`, `mcp-connection.css` and `draft-tray.css`. Every flex row that holds text gets `min-width: 0` on the text element and `flex-wrap: wrap` on the container, or `text-overflow: ellipsis` for labels that are meant to truncate.
   - `.panel__body` gets `min-width: 0; overflow-wrap: anywhere`.
6. **`data-part`.** Add `data-part` to the internals of: `Panel` (`head`, `title`, `aside`, `actions`, `body`), `TrayRow`, `McpConnection` (`head`, `dot`, `status`, `url`, `actions`), `CommentThread` (`item`, `meta`, `text`, `reply`), `Popover` and `AttachmentPreview` (the last two were added in Phase 3). `ActorChip` and `AttachmentGlyph` get `data-part` only in #422. Add the part tables to ADR-020 (the naming rule was written in Phase 1). Do not rename existing classes or testids.
7. **Barrel.** Export from `src/lib/components/index.ts`: `ActionMenu`, `BinTray`, `MarkdownHelp`, `Panel`, `MarkdownText`, `Popover`, `IconButton`, `AttachmentPreview`, `TrayRow`. Update `Styleguide.svelte` to import them from the barrel (delete its five direct-path imports).

#### Acceptance Criteria

- [ ] `grep -rnE 'class="[^"]*\bbtn\b' src --include='*.svelte'` returns only `Button.svelte`.
- [ ] No `select`, `input` or `textarea` element is written by hand in `EssayShell.svelte`, `CommentThread.svelte`, `McpConnection.svelte` or the App `agentDock` (a `<select>` or `<input>` inside `Select`/`Input`/`Textarea` themselves is expected).
- [ ] `McpConnection` rendered at 18rem and at 15rem has `scrollWidth <= clientWidth` (checked in Phase 5).
- [ ] `getByRole("combobox", { name: "Essay" })` still resolves in the essay specs.
- [ ] `tests/McpConnection.test.ts`, `tests/ActorChip.test.ts`, `tests/AttachmentGlyph.test.ts`, `tests/EssayShell.test.ts`, `e2e/agent-channels.spec.ts`, `e2e/mcp-relay.spec.ts`, `e2e/essay-comments.spec.ts` and `e2e/essay-editor.spec.ts` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/agent-channels.spec.ts e2e/mcp-relay.spec.ts e2e/essay-comments.spec.ts e2e/essay-editor.spec.ts e2e/essay-touch.spec.ts e2e/mobile-layout.spec.ts e2e/styleguide.spec.ts
```

#### Milestone gate

1. Every acceptance criterion above is met.
2. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
3. Mark the checkboxes `[x]`.
4. Commit: `refactor: conform panels, trays and form controls to shared primitives (#421)`.

---

### Phase 5: Styleguide at real widths, overflow check, token-derived colour check, docs

**Goal:** `/styleguide` shows rail components at the real rail width and a narrow width; two e2e checks prove they do not overflow and that, under the demo theme, nothing paints a colour that is not derived from tokens.

**Agent:** Web App Worker, then the Verification Agent.

#### Tasks

1. **Width frames.** In `Styleguide.svelte`, add a `Frame` snippet or small component, `src/styleguide/Frame.svelte`, that renders `<div class="sg__frame" data-testid="sg-frame" style:width={width}>`.
   - Use `width: var(--rail-width)` (18rem) and a narrow `15rem` frame, each with a caption.
   - `.sg__frame` has `border: var(--rule); overflow: hidden`. The frame **must** clip, so the e2e test can compare a descendant's `scrollWidth` to the frame.
   - Panels, trays and the agent panel are shown in both frames: `Panel` with `LayersPanel`, `DraftTray`, `BinTray`, `PinnedPane`, `AgentFeed`, `McpConnection` (online with a long `repositoryName` and long `callerUrl`; and `status="rejected"` with a long `error`; the existing props `status`, `callerUrl`, `error`, `repositoryName`, `lastActivity`, `actor` and the three callbacks are enough, so no mock is needed), `CommentThread`, and the agent dock rows (`Connect` and `Forget`). Replace the current `sg__grid` of panels with the framed layout. Use long fixture strings to make overflow visible. Add the long-text fixtures to `src/styleguide/fixtures.ts`. Popovers (an open ActionMenu) may sit inside the frames: they render in the top layer and are not clipped.
   - Also give the `#tokens` section a "Component tokens" table (token name, resolved value), listing the `tokens-components.css` entries via `getComputedStyle`, as the existing swatches do.
2. **Rewrite `src/styles/themes/demo.css`** to prove the contract.
   - It re-points **only** semantic and component tokens (not the primitive palette `--paper`, `--ink`, `--black`, `--grey-*`). Every semantic colour token gets a **sentinel** value that is visibly different and is **not** equal to any default palette value, for example a warm sepia set (`--color-bg: #fbf1dc`, and so on). It keeps the font and radius changes.
   - Primitives stay at their default, so any component still painting a primitive-derived default colour is a bypass.
   - **Demo token completeness (task 2b).** `demo.css` must override **every** colour-bearing semantic token in `tokens.css`: `--color-bg`, `--color-surface`, `--color-page`, `--color-text`, `--color-text-strong`, `--color-muted`, `--color-line`, `--color-line-soft`, `--color-line-strong`, `--color-on-dark`, `--color-nav-bg`, `--color-focus`, `--color-overlay`, `--color-on-accent`, `--color-surface-raised`, `--color-hover`, and every `--shadow-*` token (the colour inside, for example `--shadow-popover`). The derived `--color-on-dark-*` tokens come from `color-mix` and follow `--color-on-dark`. Add `tests/demo-theme.test.ts`: it parses `tokens.css` for every `--color-*` and `--shadow-*` declaration and fails if `demo.css` does not redeclare it, so a token added later cannot be forgotten; it also asserts that no demo colour value equals a default palette value.
3. **Overflow e2e** (`e2e/styleguide.spec.ts`).
   - New test: for each `[data-testid="sg-frame"]`, evaluate in the page that `frame.scrollWidth <= frame.clientWidth` and that every descendant has `el.getBoundingClientRect().right <= frameRect.right + 0.5`. On failure, report the frame caption and the offending element's tag, class and `data-part`.
   - Run it in both themes, and at viewport widths 1280 and 390.
   - **Exclude popovers:** skip any element that is, or is inside, a `[popover]` surface. Top-layer popovers are positioned against the viewport and legitimately extend past a frame. Popovers inside frames are checked by `e2e/popover.spec.ts`, not here.
4. **Token-derived colour e2e** (`e2e/styleguide.spec.ts`).
   - **Prepare the page:** inject `*, *::before, *::after { transition: none !important; animation: none !important; }` with `page.addStyleTag` before selecting Demo, and `await page.evaluate(() => document.fonts.ready)`, so no mid-transition colour is sampled.
   - Read the default palette in the default theme: `getComputedStyle(documentElement).getPropertyValue(n)` for `--black --paper --grey-1…4 --ink --color-page`, normalised to `rgb(r, g, b)` by assigning each to a hidden element's `color` and reading the computed value.
   - Select the **Demo** theme. **Scope:** every element inside `main.sg section`, **excluding** the `#tokens` section's swatch elements (`.sg__chip`, `.sg__space`), which deliberately paint a token to show it, and excluding the page chrome outside sections (`.sg__bar`, `.sg__toc`, `h1`), which is styleguide-only CSS in `styleguide.css`. These exclusions form a `SKIP_SELECTORS` list in the test, each with its reason written as a code comment on that entry. Before sampling, wait until no `Loading…` text remains (`await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 })`), so the WASM-gated specimens are rendered. Also include each element's `::before` and `::after`.
   - For each element read `color`, `background-color`, the four `border-*-color` (only when the border width is non-zero), `outline-color` (when `outline-style` is not `none`), `text-decoration-color`, and the colours inside `box-shadow`. Ignore fully transparent values.
   - Compare the RGB triple, ignoring alpha, against the default palette set. **The test fails if any equals a default palette colour.** The message lists the element selector, the property and the value (cap at 20 reports).
   - Keep an `ALLOW` list `{selector, property, reason}`; each entry needs a reason; the worker keeps it empty unless a genuine exception exists.
   - Known limits, in a comment in the test: resting state only (no `:hover`/`:focus`), covered statically by `tests/styles-tokens.test.ts` from Phase 1.
5. **Docs.**
   - Rewrite `src/styles/README.md`: the tier model (primitive, semantic, component); the `--<block>-<property>` naming rule and why component tokens live on `:root`; the `data-part` contract; the breakpoint source; where `ink-surface` is defined (`index.html`); and the new CSS files in the file map.
   - Update the `src/styles/index.css` header (token tiers, the new imports).
   - `src/lib/components/README.md`: add `IconButton`, `Popover`, `AttachmentPreview`, `TrayRow` and the changed `Button` and `ActionMenu` props; fix the `ink-surface` note.
   - Confirm ADR-020 is `accepted` (the owner decided on 2026-10-04) and add a "Consequences" section listing the follow-ups: consolidating the seven breakpoint widths; unlayered shell `<style>` blocks (#424).
   - Update `docs/adr/019-…md` "Consequences": the hard-coded colour note now points at ADR-020.
6. **Plan upkeep.** Mark every checkbox in this file `[x]`.

#### Acceptance Criteria

- [ ] `/styleguide` shows each rail component in an 18rem frame and a 15rem frame, in both themes.
- [ ] The overflow e2e passes in both themes at 1280px and 390px, ignoring `[popover]` surfaces.
- [ ] `tests/demo-theme.test.ts` passes.
- [ ] The token-derived colour e2e passes under the demo theme with an empty or fully justified `ALLOW` list. To prove the check works, the worker temporarily adds `color: var(--ink)` to one component, confirms the test fails naming that element, then reverts it (state this in the commit message, do not commit the break).
- [ ] The three existing styleguide tests still pass, and the console is free of errors and page errors.
- [ ] README, `index.css` header and ADR-020 are consistent with the code (`grep -rn "narrow.ts\|GovernanceShell.svelte:933\|data-md-help-trigger" src docs` returns nothing).

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/styleguide.spec.ts
npx playwright test e2e/essay-editor.spec.ts e2e/essay-touch.spec.ts e2e/essay-comments.spec.ts e2e/mobile-layout.spec.ts e2e/guides-editor-width.spec.ts e2e/navigation.spec.ts e2e/agent-channels.spec.ts e2e/mcp-relay.spec.ts
```

#### Milestone gate

1. Every acceptance criterion above is met.
2. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
3. Mark the checkboxes `[x]`.
4. Commit: `feat: styleguide at rail widths, overflow and token-colour checks, docs (#421)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds, and `/styleguide` is still a separate lazy chunk
- [ ] `npm test` passes, including `tests/styles-tokens.test.ts`, `tests/breakpoints.test.ts` and `tests/Popover.test.ts`
- [ ] `e2e/styleguide.spec.ts` passes (overflow and token-derived colour checks)
- [ ] The e2e specs named in "Existing tests likely affected" pass
- [ ] No component outside `Button.svelte` writes a `btn` class; no emoji or Unicode icon glyph remains; one `ink-surface` definition; one Popover dismissal implementation; one breakpoint source
- [ ] ADR-020 written; ADR-019 "Consequences" updated

## Coordination Rules

- The Web App Worker keeps to `srs-web/**` only, in this worktree.
- No SRS semantics in TypeScript (ADR-001). Everything here is presentation.
- Phases run in order; each ends with its gate and a commit. Do not start phase N+1 before phase N's gate passes.
- Preserve every `data-testid`, `aria-label` and accessible name. Where a CSS class selector in an existing spec must change, change the spec in the same commit as the markup and list it in the commit message. Do not otherwise edit specs.
- The Verification Agent runs after each gate and before sign-off. It reports `npm run typecheck`, `npm run build`, the vitest summary and the named Playwright specs.
- Agents push the branch only; the owner opens and merges the PR after reviewing the diff. Do not touch owner-authored chain steps.
- Do not change shell-level scoped `<style>` blocks (Guides, Governance, Generic). That is #424.

## Assumptions

- (Phase 1) New semantic tokens beyond the plan's list: `--color-muted-strong` (the old `--grey-4` role), `--color-error`, `--color-error-subtle`, `--color-warn`, `--color-success` (replacing undefined `--color-error`/`--error`/`--color-warn`/`--color-success` fallbacks and the four distinct red literals). The hue-pill saturation/lightness numbers needed more than the plan's five tokens (`--hue-pill-s-bg`, `--hue-pill-s-solid`, `--hue-pill-l-fg-chip`) to keep rendered colours identical. `hsl(var(--x-hue) ...)` stays in `attachment.css`/`comments.css` as two ALLOW entries in `tests/styles-tokens.test.ts` (the hue is per element).
- (Phase 1) `SourceChooser` backdrop and shadow now use `color-mix` of semantic tokens instead of `rgb()` literals; the colours shift marginally.
- (Phase 1) Biome formats CSS, so the breakpoint annotation is a `/* bp: <role> */` comment on the line above each `@media`, not inline after the brace.
- (Phase 1) `e2e/styleguide.spec.ts`: the existing heading-count assertion raced the lazy styleguide chunk (flaked once in four runs); it now uses `expect.poll`. Same threshold.
- (Phase 2) Lucide 1.52 file names: `trash` (not `trash-2`), `list-indent-increase/decrease` (not `indent-increase/decrease`), `circle-question-mark` (not `circle-help`); the plan's names exist only as `.js` aliases without Svelte types.
- (Phase 2) Block gutter controls keep a 20px minimum on a mouse (not `--hit-target`) so the vertical tool stack does not stretch every paragraph; coarse pointers still get 44px.

- `@lucide/svelte` is installable in this environment, and its per-icon path `@lucide/svelte/icons/<name>` exists for Svelte 5.
- `color-mix()` is acceptable (baseline since 2023); no older-browser support is required.
- The Playwright WASM-bindings prerequisite is the same as for the other specs.
- Browser-default colours (for example `rgb(0, 0, 0)` for `ButtonText`) are not in the default palette, so the Phase 5 colour check does not flag them. Elements that fall back to the white canvas colour are flagged, which is a real bypass because `--color-page` is `#fff`.

## Decided by owner 2026-10-04

1. **Popover:** native HTML `popover` attribute (top layer; `auto` for menus and help, `manual` for hover/tooltip previews), `showPopover`/`hidePopover`, positioned with CSS anchor positioning when `CSS.supports("anchor-name: --x")` and otherwise a small JS placement function (flip, clamp, reposition on scroll and resize). Focus return is written once. Popovers are never clipped, so they can live inside the 18rem frames.
2. **Component tokens:** `--<block>-<property>[-<state>]`, declared on `:root` in the `tokens` layer.
3. **`data-part`:** short lower-kebab-case names scoped to their component (for example `data-part="handle"` on `Block`).

Lucide as the icon set and the three story principles were decided earlier. ADR-020 is `accepted`. Not listed because the defaults are low-risk and reversible: exact Lucide icon names, `TrayRow` and `AttachmentPreview` as component names, the `15rem` narrow frame width, and leaving the seven existing breakpoint widths as they are.
