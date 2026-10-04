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

```
src/styles/
  index.css            entry — declares the layer order and @imports everything
  tokens.css           design variables only (palette, type, spacing, dimensions)
  base.css             reset, document defaults, typography, paper grain
  layout.css           the nav | main | inspector app shell
  utilities.css        single-purpose helpers (win against components)
  themes/              optional reskins in the `theme` layer (demo.css is styleguide-only)
  components/
    button.css         .btn          actions
    tag.css            .tag          lifecycle status vocabulary
    nav.css            .nav          dark navigation rail
    inspector.css      .inspector    right rail + .meta key/value list
    card.css           .card         record reading view
    log-table.css      .log-table    tabular profile views (decision log)
    field.css          .field        form control + label/help/error + save bar
    diagnostics.css    .diag         validation panel
    lifecycle.css      .lifecycle    status transition control
```

## Conventions

- **BEM naming.** `.block`, `.block__element`, `.block--modifier`. Each component
  is self-contained and reusable in isolation.
- **Tokens only.** Components never hard-code a colour, font, or size — they
  reference custom properties from `tokens.css`. Rebranding is a one-file change.
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

The `ink-surface` SVG turbulence filter (printed-ink texture, referenced by `card.css`) is
not defined anywhere in the app today: the static pages that carried it are gone and the
governance shell no longer defines it, so `filter: url(#ink-surface)` is currently a no-op.
A host that wants the texture must define `<filter id="ink-surface">` once in its markup.

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
  (`:root[data-theme="demo"]`) does exactly and only this.
- **`theme` layer.** Sits between `components` and `utilities` as the documented escape hatch for
  overriding a component rule that tokens cannot reach.
- **Known limit.** Unlayered scoped Svelte `<style>` blocks (e.g. the dark-mode blocks in
  `GuidesShell.svelte` and `GovernanceShell.svelte`) beat every layer, including `theme`.
- Rendered-document preview themes (ADR-007) are a separate concern from UI chrome.
