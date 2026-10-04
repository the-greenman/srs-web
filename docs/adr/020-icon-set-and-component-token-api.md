# ADR-020: Icon set and component-token API — Lucide, `:root` component tokens, `data-part`, one breakpoint source, native popover

- **Status:** accepted
- **Date:** 2026-10-04
- **Issue:** [srs-web#421](https://github.com/the-greenman/srs-web/issues/421) (story [muDemocracy.org#282](https://github.com/the-greenman/muDemocracy.org/issues/282))
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** [ADR-019](019-ui-theming-surface-and-live-styleguide.md) (makes its "hard-coded colours" consequence true)

## Context

ADR-019 made tokens plus a `theme` layer the skinning surface and `/styleguide` the specimen
surface. The styleguide then showed components bypassing the token surface (raw palette tokens,
colour literals, undefined fallbacks), about ten button looks, glyphs used as icons, three popovers
with three dismissal models, and an `ink-surface` filter defined in one shell only. The owner
decided all five parts below on 2026-10-04.

## Decision

### (a) Icons: Lucide

Lucide (`@lucide/svelte`, ISC) is the single icon set. Rules:

- Import each icon from its own file: `import Eye from "@lucide/svelte/icons/eye"`. Never import
  from the package root and never import the full set (the bundle must tree-shake to the icons used).
- Use the canonical file name: Lucide renames icons between releases and keeps `.js` aliases that
  have no `.svelte.d.ts` (so `trash-2`, `indent-increase` and `circle-help` do not typecheck; use
  `trash`, `list-indent-increase` and `circle-question-mark`). Verify a name against
  `node_modules/@lucide/svelte/dist/icons/` before using it.
- Icons draw in `currentColor`, so a control's colour token colours its icon. Pass
  `aria-hidden="true"`; the control carries the accessible name.
- Icons are components, never name strings. `MenuAction.icon` and `ParagraphAction.icon` are
  `IconComponent` (`src/lib/components/icon.ts`). `Annotation.icon` is unrelated: it is a data key
  (relation or attachment kind) shown as text.
- `IconButton` (`label` required: it is the accessible name and the tooltip) is the one small icon
  control. Text controls use `Button`, with `size="sm"` in rails, trays and panels.
- Alternatives considered: Phosphor (heavier, weight variants we do not need) and Tabler (larger
  set, same idea).
- Documented exceptions where a glyph character stays: link text such as `GitSaveModal`
  "Install / manage on GitHub →", the accessible-name wording of relation marks in
  `ParagraphMargin`, and the lifecycle transition decoration in `lifecycle.css` (CSS `content`
  cannot host a component).

### (b) Component tokens are the public skin API

Three tiers: **primitive** (`--paper`, `--ink`, `--black`, `--grey-N`; never read by components),
**semantic** (`--color-*`, `--radius-*`, `--shadow-*`, `--z-*`, `--focus-ring`, `--hit-target`,
`--rail-width`; in `tokens.css`) and **component** (`--<block>-<property>[-<state>]`, for example
`--btn-bg`, `--btn-primary-bg`, `--popover-border`, `--hue-pill-s`; in `tokens-components.css`).

- Component tokens are declared on `:root` in the `tokens` layer, each defaulting to a semantic
  token. They are **never** declared on the component selector: a skin's `:root[data-theme]` rule
  would then lose to the component's own declaration.
- Component CSS reads them (`.btn { background: var(--btn-bg) }`); a variant re-assigns the token
  on the variant selector (`.btn--primary { --btn-bg: var(--btn-primary-bg) }`).
- No `var(--x, <colour>)` fallbacks: a token that is read must be defined. A missing semantic role
  gets a new semantic token.
- `tests/styles-tokens.test.ts` enforces this for `src/styles/**` and every `src/lib/components`
  `<style>` block. Shells, editors and `App.svelte` are out of scope until #424.

### (c) `data-part` marks documented component internals

A skinning client, a test or a theme that needs to reach inside a component uses
`data-part="<name>"`. Names are short lower-kebab-case and scoped to their component (so
`data-part="handle"` on `Block` and `data-part="handle"` elsewhere do not collide; select as
`.block [data-part="handle"]`). BEM classes stay; `data-part` is additive. Part tables are
appended below as components gain parts.

| Component | Parts |
|---|---|
| `Block` | `gutter`, `handle`, `tools`, `action`, `menu`, `main`, `head`, `title`, `margin` |
| `IconButton` | `icon-btn` |

### (d) One breakpoint source

`src/lib/breakpoints.ts` exports `BREAKPOINTS` (named by role) and `NARROW`. CSS custom properties
cannot be used in `@media` and no custom-media tooling is installed, so CSS keeps literal widths,
each annotated `/* bp: <role> */`. `tests/breakpoints.test.ts` fails when any `@media` width under
`src/` is not in `BREAKPOINTS` (`min-width: N+1` counts as `max-width: N`).

### (e) Popover

*Written in Phase 3.*

## Consequences

- A skin re-points semantic and component tokens and reaches every shared component.
- Known gap, tracked by #424: unlayered scoped `<style>` blocks in the shells beat every layer and
  still carry raw colours.
