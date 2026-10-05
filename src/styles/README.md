# srs-web design system

A modular, layered CSS foundation for the SRS governance editor. Plain CSS — no
build step, no framework lock-in. It extends the [muDemocracy](https://mudemocracy.org)
design language (paper + ink, **no accent colour**, IBM Plex Sans/Mono) into an
application shell.

> Part of **Track B — governance web editor**.
> Epic: [#1](https://github.com/the-greenman/srs-web/issues/1).

## How it's organised

Everything is wrapped in a named [`@layer`](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer)
so cascade order is explicit and independent of import order:

```
tokens  →  base  →  layout  →  components  →  theme  →  utilities
```

## Token tiers (ADR-020)

Three tiers, each referencing the one above, so a skin re-points the tier it needs:

| Tier | Where | Examples | Read by |
|---|---|---|---|
| Primitive | `tokens.css` | `--paper`, `--ink`, `--black`, `--grey-1..4` | semantic tokens only, never components |
| Semantic | `tokens.css` | `--color-text`, `--color-surface-raised`, `--color-on-dark`, `--radius-md`, `--shadow-popover`, `--z-overlay`, `--focus-ring`, `--hit-target`, `--inspector-width`, `--content-max` | components and component tokens |
| Component | `tokens-components.css` | `--btn-bg`, `--btn-primary-bg`, `--icon-btn-fg`, `--popover-bg`, `--modal-bg`/`--modal-pad`/`--modal-backdrop`, `--checkbox-accent`, `--hue-pill-s`, `--actor-mark-size`, `--margin-width`, `--comment-thread-max`, `--toolbar-gap`, `--block-tools-bg` (the paragraph hover strip) | the component's own CSS |

Component tokens are named `--<block>-<property>[-<state>]` and are declared on `:root` in the
`tokens` layer, **never on the component selector**: a skin's `:root[data-theme]` rule would lose
to the component's own declaration. The component reads them (`.btn { background: var(--btn-bg) }`);
a variant re-assigns the token on the variant selector (`.btn--primary { --btn-bg: var(--btn-primary-bg) }`).
No `var(--x, <colour>)` fallbacks: a read token must be defined.
`tests/styles-tokens.test.ts` enforces this for `src/styles/**`, every `src/lib/components` `<style>` block
and the converted shells (`src/lib/generic`); the Governance and Guides shells enter the scan with #424 PR-B.

## `data-part`

`data-part="<name>"` marks documented component internals (short lower-kebab-case, scoped to the
component, e.g. `.block [data-part="handle"]`). BEM classes stay; `data-part` is additive. The tables
are in [ADR-020](../../docs/adr/020-icon-set-and-component-token-api.md).

## Breakpoints

One source: `src/lib/breakpoints.ts` (`BREAKPOINTS`, `NARROW`). CSS custom properties cannot be used
inside `@media`, so CSS keeps literal widths with a `/* bp: <role> */` comment above each query, and
`tests/breakpoints.test.ts` fails when a width under `src/` is not in `BREAKPOINTS`.

```
src/styles/
  index.css            entry — declares the layer order and @imports everything
  tokens.css           primitive + semantic tokens (palette, colour roles, type, spacing, radius, shadow, z-index, focus, hit target)
  base.css             reset, document defaults, typography, paper grain
  layout.css           the 100dvh nav | main | inspector frame (#424): each column scrolls itself, Wide carrier on .app
  utilities.css        single-purpose helpers (win against components)
  themes/              optional reskins in the `theme` layer (demo.css is styleguide-only)
  components/
    button.css         .btn          actions
    tag.css            .tag          lifecycle status vocabulary
    srs-mark.css       .srs-mark     the SRS mark (SrsMark.svelte); painted by --srs-mark-ink|paper|line
    nav.css            .nav          dark navigation rail (.nav__scroll is its one scroller)
    inspector.css      .inspector    right rail + .meta key/value list
    shell.css          .drawer .resize-handle  frame parts (#424): the off-canvas Drawer, the column resizer, trigger badge
    card.css           .card         record reading view
    log-table.css      .log-table    tabular profile views (decision log)
    field.css          .field        form control + label/help/error + save bar
    diagnostics.css    .diag         validation panel, grouped rows and the collapsible notice variant (#441)
    notice.css         .notice       the inline Notice (#441)
    toast.css          .toast        the toast host and rows (#441)
    lifecycle.css      .lifecycle    status transition control
    icon-button.css    .icon-btn     the one small icon control (Lucide)
    popover.css        .popover      the one floating surface (native top-layer popover)
    modal.css          .modal        the titled native <dialog> (showModal; `inline` specimen)
    action-menu.css    .action-menu  the menu of rows (plain and checkable, grouped)
    toolbar.css        .toolbar      the generic document bar (#423): context row + grouped menus, three width tiers
    draft-tray.css     .tray         DraftTray and BinTray rows
    ... and one file per remaining block (see index.css)
  tokens-components.css  component tokens (--btn-*, --icon-btn-*, --popover-*, --hue-pill-*, --actor-*, --margin-*, --comment-*, --toolbar-*, --block-tools-*)
```

## Conventions

- **BEM naming.** `.block`, `.block__element`, `.block--modifier`. Each component
  is self-contained and reusable in isolation.
- **Tokens only.** Components never hard-code a colour, font, or size — they
  reference semantic or component tokens, never the raw palette. Rebranding is a one-file change.
- **No accent colour.** This is a brand constraint, not an oversight. Hierarchy
  and state come from weight, size, fill, and mono/sans contrast. Validation
  severity (`diagnostics.css`) and invalid fields (`field.css`) follow this rule —
  errors are ink-filled, not red.
- **Presentation only (ADR-001).** These styles render data the WASM engine
  produces. No SRS semantics live here.

## Usage

```css
/* one import pulls the whole system in the right cascade order */
@import url("./styles/index.css");
```

The `ink-surface` SVG turbulence filter (printed-ink texture, referenced by `nav.css` and
`card.css`) is defined once in `index.html`, so every host, including `/styleguide`, has it.

The Vite entry wires `index.css` in once **B1** lands
([#2](https://github.com/the-greenman/srs-web/issues/2)).

## Component → Track B issue map

| Component | Primary issue(s) |
|---|---|
| tokens, base, utilities, button | B1 scaffold [#2](https://github.com/the-greenman/srs-web/issues/2) |
| layout, nav, inspector | B4 viewer [#3](https://github.com/the-greenman/srs-web/issues/3) |
| card, log-table | B5 renderer [#4](https://github.com/the-greenman/srs-web/issues/4), B12 [#8](https://github.com/the-greenman/srs-web/issues/8) |
| field | B9 edit forms [#5](https://github.com/the-greenman/srs-web/issues/5), B5 [#4](https://github.com/the-greenman/srs-web/issues/4) |
| diagnostics | B4 [#3](https://github.com/the-greenman/srs-web/issues/3), B13 validate-on-save [#9](https://github.com/the-greenman/srs-web/issues/9) |
| tag, lifecycle | B11 lifecycle/supersession [#7](https://github.com/the-greenman/srs-web/issues/7) |
| button (`--mono`) | B10 import/export [#6](https://github.com/the-greenman/srs-web/issues/6) |

## Svelte components

Typed **Svelte 5** wrappers that apply these classes live in
[`../lib/components`](../lib/components/README.md) — the chosen framework for
srs-web. Styling stays here in the global `@layer`s; the components are thin and
carry no SRS semantics (ADR-001). Import once at the app root:

```ts
import './styles/index.css';
```

## Live showcase

`/styleguide` (hidden, unlinked, `src/Styleguide.svelte`) mounts the **real** components with
fixture props in a theme switcher: tokens, buttons, menus, chips, actors, annotations and
comments, paragraphs, panels and trays, form controls. It is the single specimen surface
([ADR-019](../../docs/adr/019-ui-theming-surface-and-live-styleguide.md)); the static
`docs/design/*.html` pages it replaced drifted from the components and were deleted.

## Reskinning (the `theme` layer)

- **Re-point tokens.** The normal way to reskin; it works from any layer. `themes/demo.css`
  (`:root[data-theme="demo"]`) does exactly and only this, and only for semantic tokens: it gives
  every colour token a sentinel value, so `/styleguide` under the Demo theme proves (e2e) that no
  component paints a default palette colour.
- **`theme` layer.** Sits between `components` and `utilities` as the documented escape hatch for
  overriding a component rule that tokens cannot reach.
- **Known limit.** Unlayered scoped Svelte `<style>` blocks (e.g. the dark-mode blocks in
  `GuidesShell.svelte` and `GovernanceShell.svelte`) beat every layer, including `theme`.
- Rendered-document preview themes (ADR-007) are a separate concern from UI chrome.
