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
tokens  →  base  →  layout  →  components  →  utilities
```

```
src/styles/
  index.css            entry — declares the layer order and @imports everything
  tokens.css           design variables only (palette, type, spacing, dimensions)
  base.css             reset, document defaults, typography, paper grain
  layout.css           the nav | main | inspector app shell
  utilities.css        single-purpose helpers (win against components)
  components/
    button.css         .btn          actions
    tag.css            .tag          lifecycle status vocabulary
    nav.css            .nav          dark navigation rail
    inspector.css      .inspector    right rail + .meta key/value list
    card.css           .card         record reading view
    log-table.css      .log-table    tabular profile views (decision log)
    field.css          .field        form control + label/help/error + save bar
    repeatable.css     .repeat       array-valued field widget
    field-group.css    .field-group  labelled cluster of fields
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

Each host page must define the `ink-surface` SVG turbulence filter once (it gives
the dark nav rail and record headers their printed-ink texture). See the
`<svg>…<filter id="ink-surface">` block in `docs/design/*.html`.

The Vite entry wires `index.css` in once **B1** lands
([#2](https://github.com/the-greenman/srs-web/issues/2)).

## Component → Track B issue map

| Component | Primary issue(s) |
|---|---|
| tokens, base, utilities, button | B1 scaffold [#2](https://github.com/the-greenman/srs-web/issues/2) |
| layout, nav, inspector | B4 viewer [#3](https://github.com/the-greenman/srs-web/issues/3) |
| card, log-table | B5 renderer [#4](https://github.com/the-greenman/srs-web/issues/4), B12 [#8](https://github.com/the-greenman/srs-web/issues/8) |
| field, repeatable, field-group | B9 edit forms [#5](https://github.com/the-greenman/srs-web/issues/5), B5 [#4](https://github.com/the-greenman/srs-web/issues/4) |
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

`docs/design/index.html` links two screens built entirely from these components,
populated with the LiMoMa gallery fixture:

- `viewer.html` — read-only governance viewer (B4/B5)
- `editor.html` — generated edit form with repeatable + field-group widgets (B9/B13)

These are static HTML (no build needed) and are the verified visual reference;
the Svelte components mirror them 1:1.
