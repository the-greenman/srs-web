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
  `AnnotationMargin`, and the lifecycle transition decoration in `lifecycle.css` (CSS `content`
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
| `Popover` | `popover` (wrapper), `surface` |
| `AttachmentPreview` | `kind`, `title`, `text` |
| `HoverCard` | `remove` |
| `MarkdownHelp` | `close` |
| `PinnedPane` | `actions` |
| `Panel` | `head`, `title`, `aside`, `actions`, `body` |
| `TrayRow` | `row`, `label`, `actions` |
| `McpConnection` | `head`, `dot`, `status`, `url`, `input`, `actions` |
| `CommentThread` | `thread`, `item`, `meta`, `text`, `reply`, `list`, `earlier`, `more`, `time`, `summary` |
| `MarginRow` | `row`, `label` (emitted for `AnnotationMargin`) |
| `AgentFeed` | `name` |
| `ActorMark` | `mark` |
| `ActorStack` | `more` |
| `AnnotationMargin` | `overflow`, `row`, `mark`, `label`, `more` |

### (d) One breakpoint source

`src/lib/breakpoints.ts` exports `BREAKPOINTS` (named by role) and `NARROW`. CSS custom properties
cannot be used in `@media` and no custom-media tooling is installed, so CSS keeps literal widths,
each annotated `/* bp: <role> */`. `tests/breakpoints.test.ts` fails when any `@media` width under
`src/` is not in `BREAKPOINTS` (`min-width: N+1` counts as `max-width: N`).

### (e) Popover

`Popover.svelte` is the one floating-surface primitive. The surface is a native HTML `popover`
(top layer): it is never clipped by an `overflow` ancestor and needs no `z-index`, so there is no
`--z-popover` token and open popovers may sit inside clipped frames.

- **Modes.** `auto` (menus, help, the "+N" list): native light-dismiss and Escape. `manual` (hover
  previews, `HoverCard`): the host decides when to show or hide; there is no light-dismiss.
- **Open state.** `open` is bindable. The surface is always rendered and shown or hidden with
  `showPopover()` / `hidePopover()` (idempotent, guarded by `:popover-open`); the `toggle` event
  syncs `open` back, so native light-dismiss updates the bound state.
- **No close-then-reopen race.** A trigger never toggles `open` itself. It is a real
  `popovertarget` invoker (the trigger snippet receives the props), the browser handles its click
  natively, and `open` follows the `toggle` event. Hosts that cannot be an invoker (an `ActionMenu`
  row opening another popover) set `open` one animation frame later.
- **Focus.** Native popover focus restoration returns focus to the invoker. One fallback for
  `role="menu"`: when an outside click on non-focusable text leaves focus on `<body>`, focus goes to
  the trigger. Menus focus their first row on open and move with Arrow keys; Tab closes them.
- **Positioning, written once** (`popover-position.ts`): CSS anchor positioning
  (`position-anchor`, `position-area`, `position-try-fallbacks: flip-block, flip-inline`) where
  `CSS.supports("anchor-name: --x")`; otherwise the pure `placeNextTo(anchorRect, size, viewport,
  placement)` (below the anchor, aligned to the placement edge, flips above, clamps), repositioned on
  scroll (capture) and resize while open.
- **happy-dom.** It lacks the popover API. `Popover` feature-guards: without `showPopover` it toggles
  an `is-open` class and inline `display`, the trigger props carry an `onclick`, and Escape closes it.
  Component tests cover that fallback and the pure placement; light-dismiss, Escape, top layer,
  anchoring, focus return and clipping are tested in `e2e/popover.spec.ts` (Chromium).
- **Hover bridge.** `AttachmentGlyph` shows its card on hover and focus of the glyph or the card
  (both live under one wrapper) and hides it after a 150 ms delay that re-entry cancels, so the
  pointer crossing the gap does not lose "Remove link". No touch claim: touch reaches Remove link
  through `PinnedPane` and the paragraph menu.

### (f) Actor identity: shape, not colour

`ActorMark` is the compact actor identity; `ActorChip` is the full lozenge; `ActorStack` overlaps
marks. Kind is told by shape so it reads in monochrome: a human is a circle, an agent is a rounded
square with a notched corner (`--actor-mark-radius-human`, `--actor-mark-radius-ai`,
`--actor-mark-notch`). No actor (or no id) is the explicit unattributed state: a neutral, hue-less
mark and the text "Unattributed". Hue is the one `actorHue(id)` function (`src/lib/actor-hue.ts`),
set per element as `--actor-hue` and consumed by the single `.hue-pill` rule set (also used by
`AttachmentGlyph`, whose hue is the attaching actor's). Tokens: `--actor-mark-size`,
`--actor-mark-size-sm`, `--actor-stack-overlap`.

### (g) The annotation margin: one grid column, one kind-icon map

`AnnotationMargin` is a real column of the `Block` grid. The width is the token `--margin-width`
(default `--margin-width-compact`; `--margin-width-wide` when the shell carries
`data-margin="expanded"`, from 721px up). The essay page grows by the difference, so the text column
keeps its width and the margin never crosses the page edge or the rail. `data-margin` is the one
mechanism: the header action sets it today and #424's Wide toggle reuses `src/lib/margin-mode.ts`
rather than adding a second setter. Other tokens: `--margin-mark-size`, `--margin-row-gap`,
`--margin-label-lines`, `--essay-page-width`.

Kind icons are mapped once, in `src/lib/components/annotation-icons.ts` (`KIND_ICONS`, owner decision
D3): the annotation's data key (`Annotation.icon`, the neighbour's type name) to a Lucide component,
with a fallback icon. A letter is never the only cue. `attachment` is a client presentation grouping
by neighbour kind; nothing here infers SRS semantics from it. A mark's hue is the attaching actor's.

## Consequences

- A skin re-points semantic and component tokens and reaches every shared component. The demo theme
  re-points semantic tokens only; `e2e/styleguide.spec.ts` fails if any specimen still paints a
  default palette colour, and `tests/demo-theme.test.ts` fails if a semantic colour token is not
  re-pointed there.
- Rail components are shown at 18rem and 15rem in `/styleguide`, and an e2e check fails if any of
  them overflows its frame.
- Follow-ups:
  - Consolidating the seven `@media` widths (`phone`, `genericNarrow`, `form`, `compact`,
    `genericStack`, `rail`, `wide`) into fewer; today they are only named and guarded.
  - Unlayered scoped `<style>` blocks in the Guides, Governance and Generic shells beat every layer
    and still carry raw colours: #424 (AppShell) retires them.
  - One-off buttons in the modals, `DecisionLogView`, `SourceChooser`, `BlueprintDocumentEditor` and
    the `SectionForm` table editor.
