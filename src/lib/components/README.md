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
  import { AppShell, Nav, NavGroup, NavItem, Main, Topbar, Workspace,
           Card, CardField, Inspector, InspectorSection, Diagnostics,
           Lifecycle, Tag, Button } from '$lib/components';
  import type { Diagnostic } from '$lib/components';
</script>
```

The global stylesheet is imported once at the app root (wired by B1
[#2](https://github.com/the-greenman/srs-web/issues/2)):

```ts
import './styles/index.css';
```

Each host page also defines the `#ink-surface` SVG filter once (gives the nav
rail + record headers their printed-ink texture) — see `docs/design/*.html`.

## Components

| Component | Props (key) | CSS block | Issue |
|---|---|---|---|
| `AppShell` | `nav` `main` `inspector?` | `.app` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3) |
| `Main` / `Topbar` / `Workspace` | snippets, `wide?` | `.app__main` `.topbar` `.workspace` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3) |
| `Nav` / `NavGroup` / `NavItem` | `repo` `label` `count?` `active?` | `.nav*` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3) |
| `Inspector` / `InspectorSection` / `Meta` | `title` `aside?` `rows` | `.inspector*` `.meta` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3) |
| `Card` / `CardField` | `id` `title` `status?` `grid?` `empty?` | `.card*` | B5 [#4](https://github.com/the-greenman/srs-web/issues/4) |
| `LogTable` | `columns` + row children | `.log-table` | B5 [#4](https://github.com/the-greenman/srs-web/issues/4), B12 [#8](https://github.com/the-greenman/srs-web/issues/8) |
| `Field` | `label` `required?` `typeHint?` `error?` | `.field` | B9 [#5](https://github.com/the-greenman/srs-web/issues/5), B13 [#9](https://github.com/the-greenman/srs-web/issues/9) |
| `Input` / `Textarea` / `Select` | `bind:value` `options` | `.input` `.textarea` `.select` | B9 [#5](https://github.com/the-greenman/srs-web/issues/5) |
| `SaveBar` | `dirtyCount` + action children | `.save-bar` | B9 [#5](https://github.com/the-greenman/srs-web/issues/5) |
| `Tag` | `status` `onDark?` | `.tag` | B11 [#7](https://github.com/the-greenman/srs-web/issues/7) |
| `Button` | `variant` `onDark?` `active?` | `.btn` | B1 [#2](https://github.com/the-greenman/srs-web/issues/2), B10 [#6](https://github.com/the-greenman/srs-web/issues/6) |
| `Diagnostics` | `diagnostics` | `.diag*` | B4 [#3](https://github.com/the-greenman/srs-web/issues/3), B13 [#9](https://github.com/the-greenman/srs-web/issues/9) |
| `Lifecycle` | `status` `transitions` `onTransition` | `.lifecycle` | B11 [#7](https://github.com/the-greenman/srs-web/issues/7) |
| `Block` | `id` `title?` `body?` `hidden?` `handle` `margin?` (one right-margin snippet) `onzoom?` + callbacks | `.block` | srs-web [#328](https://github.com/the-greenman/srs-web/issues/328) |
| `InlineText` | `value` `placeholder?` `label` `oncommit` `as?` `editing?` (bindable) | `.inline-text` | srs-web [#363](https://github.com/the-greenman/srs-web/issues/363) |
| `CommentBadge` | `count` `label` `open?` `onclick` | `.comment-badge` | srs-web [#364](https://github.com/the-greenman/srs-web/issues/364) |
| `BlockStack` | `items` `source` `ondrop` `row` snippet `nest?` | `.block-stack` | #328 |
| `Panel` | `title` `aside?` `open?` `persistKey?` `collapsible?` `actions?` | `.panel` `.panel-rail` | srs-web [#362](https://github.com/the-greenman/srs-web/issues/362) |
| `AttachmentGlyph` / `HoverCard` / `PinnedPane` | `kind` `title` `text?` `pinned?` `onpin?` / `items` `onunpin` | `.glyph` `.hover-card` `.pinned` | srs-web [#329](https://github.com/the-greenman/srs-web/issues/329) |
| `LayersPanel` | `layers` `ondrop` `onhide` `onfold` `onkey` | `.layers` | #328 |
| `DraftTray` | `items` `available?` `ondrop` `onputback` | `.draft-tray` | #328 |
| `EyeToggle` | `hidden?` `label?` | `.eye` | #328 |

## Status

The `.svelte` files are authored against the locked CSS contract but are **not
yet compiled** — there is no Vite/Svelte build in the repo until B1
([#2](https://github.com/the-greenman/srs-web/issues/2)) scaffolds it. The
verified visual proof is the static showcase in
[`docs/design`](../../../docs/design). Type imports (`svelte`, `svelte/elements`)
resolve once B1 installs dependencies.
