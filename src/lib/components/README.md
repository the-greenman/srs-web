# srs-web Svelte component library

Typed **Svelte 5** (runes) wrappers over the modular CSS design system in
[`../../styles`](../../styles/README.md). Styling lives in the global CSS
`@layer`s; each component just applies the BEM classes and provides typed props.
This keeps the design system framework-agnostic and already-verified, while
giving the app ergonomic, reusable building blocks.

> Part of **Track B — governance web editor**. Epic:
> [#1](https://github.com/the-greenman/srs-web/issues/1).

## Why thin wrappers (not scoped styles)

- The CSS system is the single source of truth — visual changes happen in one
  place and stay consistent across HTML showcases and Svelte alike.
- Components carry **no SRS semantics** (ADR-001) — they render what the WASM
  engine produces. State logic here is UI-only (e.g. dirty-count tracking in
  `SaveBar`).
- A rebrand is still a one-file change in `tokens.css`.

## Usage

```svelte
<script lang="ts">
  import { AppShell, Nav, NavGroup, NavItem, Main, Workspace,
           Card, CardField, Inspector, Diagnostics,
           Lifecycle, Tag, Button } from '$lib/components';
  import type { Diagnostic } from '$lib/components';
</script>
```

The global stylesheet is imported once at the app root (wired by B1
[#2](https://github.com/the-greenman/srs-web/issues/2)):

```ts
import './styles/index.css';
```

The `#ink-surface` SVG filter (printed-ink texture) is defined once in `index.html`, so every host
(including `/styleguide`) has it. Every component is shown live at `/styleguide`.

## Components

| Component | Props (key) | CSS block | Issue |
|---|---|---|---|
| `AppShell` | `nav?` `main` `inspector?` `wide?` `shell?` | `.app` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3), srs-web [#424](https://github.com/the-greenman/srs-web/issues/424) |
| `Drawer` | `open` (bindable) `side` `label` `closeOnPick?` (a modal `<dialog>`: the nav and inspector below 720 / 1100px) | `.drawer` | srs-web [#424](https://github.com/the-greenman/srs-web/issues/424) |
| `ResizeHandle` | `kind` `value` `controls` `onchange` `oncommit` (the one column resizer, used by `Nav` and `Inspector`) | `.resize-handle` | srs-web [#424](https://github.com/the-greenman/srs-web/issues/424) |
| `NavTrigger` / `InspectorTrigger` | none (read the shell context; render only in drawer mode; the Toolbar puts them in `lead` / `trail`) | `.shell-trigger` | srs-web [#424](https://github.com/the-greenman/srs-web/issues/424) |
| `Main` / `Workspace` | snippets (`Main` takes `bar` and `children`) | `.app__main` `.workspace` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3) |
| `Nav` / `NavGroup` / `NavItem` | `repo` `label` `count?` `active?`; `NavItem` is a `<button>` (`onclick`, `testid`; `aria-current` when active), a link only with `href` | `.nav*` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3) |
| `Inspector` / `Meta` | `title` `aside?` `rows` | `.inspector*` `.meta` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3) |
| `Card` / `CardField` | `id` `title` `status?` `grid?` `empty?` | `.card*` | B5 [#4](https://github.com/the-greenman/srs-web/issues/4) |
| `LogTable` | `columns` + row children | `.log-table` | B5 [#4](https://github.com/the-greenman/srs-web/issues/4), B12 [#8](https://github.com/the-greenman/srs-web/issues/8) |
| `Field` | `label` `required?` `typeHint?` `error?` | `.field` | B9 [#5](https://github.com/the-greenman/srs-web/issues/5), B13 [#9](https://github.com/the-greenman/srs-web/issues/9) |
| `Input` / `Textarea` / `Select` | `bind:value` `options` | `.input` `.textarea` `.select` | B9 [#5](https://github.com/the-greenman/srs-web/issues/5) |
| `SaveBar` | `dirtyCount` + action children | `.save-bar` | B9 [#5](https://github.com/the-greenman/srs-web/issues/5) |
| `Tag` | `status` `onDark?` | `.tag` | B11 [#7](https://github.com/the-greenman/srs-web/issues/7) |
| `Button` | `variant` `size?` (`md` \| `sm`; `sm` for rails, trays, panels: wraps its label) `onDark?` `active?` | `.btn` | B1 [#2](https://github.com/the-greenman/srs-web/issues/2), B10 [#6](https://github.com/the-greenman/srs-web/issues/6) |
| `Diagnostics` | `diagnostics` `variant?` (`panel` \| `notice`) `documentKey?` `testid?` `expanded?` (grouped by identical message; the notice variant is collapsible and dismissible per document) | `.diag*` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3), B13 [#9](https://github.com/the-greenman/srs-web/issues/9), #441 |
| `Notice` | `kind?` (`info` \| `success` \| `warning` \| `error`) `onDismiss?` `testid?` (error is `role=alert`, the rest `role=status`) | `.notice` | #441, ADR-020 (j) |
| `Toast` | `kind?` `text` `testid?` `onDismiss?` (one toast row; the text is aria-hidden) | `.toast` | #441 |
| `ToastHost` | none (reads the notice store; mounted once by `Main`) | `.toast-host` | #441, ADR-020 (j) |
| `NoticeRegion` | none (renders the pinned notices; `Main` places it below the bar) | `.notice`, `.diag*` | #441 |
| `Lifecycle` | `status` `transitions` `onTransition` | `.lifecycle` | B11 [#7](https://github.com/the-greenman/srs-web/issues/7) |
| `Block` | `id` `title?` `body?` `hidden?` `handle` `margin?` (one right-margin snippet) `onzoom?` `onpull?` `oncopylink?` + callbacks (hover tools + ellipsis menu both render `paragraphActions`) | `.block` | srs-web [#328](https://github.com/the-greenman/srs-web/issues/328) |
| `InlineText` | `value` `placeholder?` `label` `oncommit` `as?` `editing?` (bindable) | `.inline-text` | srs-web [#363](https://github.com/the-greenman/srs-web/issues/363) |
| `IconButton` | `icon` (a Lucide component) `label` (required: name and tooltip) `size?` `variant?` (`plain` \| `outline`) `pressed?` `ref?` | `.icon-btn` | srs-web [#421](https://github.com/the-greenman/srs-web/issues/421) |
| `Popover` | `open?` (bindable) `label` `placement?` `mode?` (`auto` \| `manual`) `role?` `anchor?` `id?` `trigger?` snippet `onclose?` | `.popover` | #421, ADR-020 (e) |
| `AttachmentPreview` | `kind` `title` `text?` `relation?` `clamp?` | `.attachment-preview` | #421 |
| `TrayRow` | `label` `labelProps?` `actions?` snippet | `.tray__row` | #421 |
| `MarkdownHelp` | `open?` (bindable) `id?` `anchor?` `onclose?` | `.md-help` | srs-web [#365](https://github.com/the-greenman/srs-web/issues/365) |
| `ActorChip` | `actor?` | `.actor-chip` | srs-web [#330](https://github.com/the-greenman/srs-web/issues/330), [#372](https://github.com/the-greenman/srs-web/issues/372) |
| `ActorMark` | `actor?` (none = Unattributed) `size?` (`sm` \| `md`) | `.actor-mark` | srs-web [#422](https://github.com/the-greenman/srs-web/issues/422) |
| `ActorStack` | `actors` (`(Actor \| undefined)[]`) `max?` | `.actor-stack` | #422 |
| `AgentPresence` | `status` (AgentStatus): an `ActorStack` of the connected agents | `.presence` | #422 |
| `CommentThread` | `comments` (`Comment[]`, src/lib/comments.ts) `needsName?` `onadd` (bounded list, clamped comments, earlier collapsed, same-author runs) | `.comments` | #227, #422 |
| `MarkdownView` | `value`: read-only rendered markdown, the one display `{@html renderMarkdown}` site | `.md-view` | #422 |
| `AgentFeed` | `status` (AgentStatus) `paragraphLabel` `onselect` `now?` `limit?` | `.agent-activity` | srs-web [#372](https://github.com/the-greenman/srs-web/issues/372) |
| `CommentBadge` | `count` `label` `open?` `onclick` | `.comment-badge` | srs-web [#364](https://github.com/the-greenman/srs-web/issues/364) |
| `AnnotationMargin` | `annotations` (`Annotation[]`, src/lib/annotations.ts) `variant?` (`compact` \| `expanded`) `active?` `max?` `onopen` | `.margin` | srs-web [#374](https://github.com/the-greenman/srs-web/issues/374) |
| `BlockStack` | `items` `source` `ondrop` `row` snippet `nest?` | `.block-stack` | #328 |
| `Panel` | `title` `aside?` `open?` `persistKey?` `collapsible?` `actions?` | `.panel` `.panel-rail` | srs-web [#362](https://github.com/the-greenman/srs-web/issues/362) |
| `AttachmentGlyph` / `HoverCard` / `PinnedPane` | `kind` `title` `text?` `pinned?` `onpin?` / `open?` `anchor?` `static?` `onremove?` / `items` `onunpin` | `.glyph` `.hover-card` `.pinned` | srs-web [#329](https://github.com/the-greenman/srs-web/issues/329) |
| `AgentPanel` | `relays` `agents` (`PanelAgent[]`, agent-panel.ts) `ctx?` `now` + `onAddRelay/onUpdateRelay/onRemoveRelay/onSetDefault/onConnectNew/onConnect/onDisconnect/onForget/onRename/onRotate/onTakeover/pair` (the agent and relay library as rows; presentational, App owns the stores) | `.agent-panel` | srs-web [#442](https://github.com/the-greenman/srs-web/issues/442) |
| Toolbar **Go > Agents…** | `agentsAction(run)` in `shell-actions.ts`, fed by `onopenagents` (all four shells; the essay hosts its own panel, the other three open the floating dock through `onOpenAgents`) | `toolbar-agents` | #442 |
| `Disclosure` | `label` `open?` (bindable) `testid?` (ghost `Button` + chevron + `aria-expanded`; `Panel` stays `<details>`) | `.disclosure` | #442 |
| `McpConnection` | `status` `callerUrl?` (shown only while the Direct URL view is open) `error?` `pairingView?` `onTakeover?` `onClosePair?` `onRetryPair?` (the per-agent detail block under an `AgentPanel` row: pairing view, or the direct URL while its view is open) | `.mcp-conn` | #307, #442, #447 |
| `CopyField` | `value` `label` `buttonLabel` `testid` (readonly value + Copy button that flips to "Copied") | `.mcp-conn__url` | #447 |
| `PairingLoader` | `pair` `now` `children(view, retry)` (headless: fetches the pairing code, refreshes at expiry, announces a new code) | none | #447 |
| `LayersPanel` | `layers` `ondrop` `onhide` `onfold` `onkey` (touch: per-row ellipsis menu via `ActionMenu`) | `.layers` | #328, [#382](https://github.com/the-greenman/srs-web/issues/382) |
| `ActionMenu` | `actions` (`MenuAction[]` from `menu-action.ts`, `icon` is a Lucide component; `essay/paragraph-actions.ts` builds the paragraph list) `label` `testid?` `focusKey?` `placement?` (a `Popover role="menu"`) | `.action-menu` | srs-web [#382](https://github.com/the-greenman/srs-web/issues/382) |
| `DraftTray` / `BinTray` | `items` `available?` `ondrop` `onputback` / `items` `onrestore` `onforget` | `.tray` `.draft-tray` `.bin-tray` | #328, #397 |
| `EyeToggle` | `hidden?` `label?` | `.eye` | #328 |

## Icons, popovers, `data-part`

- Icons are Lucide components imported per file (`@lucide/svelte/icons/<name>`), never name strings
  and never from the package root (ADR-020 a). `IconButton` is the one small icon control.
- Every floating surface (menus, the markdown cheat-sheet, the margin "+N" list, hover previews) is a
  `Popover`: a native top-layer `popover`, so nothing is clipped and no `z-index` is needed
  (ADR-020 e).
- Documented component internals carry `data-part="<name>"` (short, lower-kebab-case, scoped to the
  component); the per-component table is in ADR-020 (c).

## Status

Compiled by the Vite/Svelte build. The live visual reference is `/styleguide`
(`src/Styleguide.svelte`, ADR-019).
