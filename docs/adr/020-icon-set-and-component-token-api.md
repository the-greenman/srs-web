# ADR-020: Icon set and component-token API — Lucide, `:root` component tokens, `data-part`, one breakpoint source, native popover

- **Status:** accepted
- **Date:** 2026-10-04
- **Issue:** [srs-web#421](https://github.com/the-greenman/srs-web/issues/421) (story [muDemocracy.org#282](https://github.com/the-greenman/muDemocracy.org/issues/282))
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** [ADR-019](019-ui-theming-surface-and-live-styleguide.md) (makes its "hard-coded colours" consequence true)
- **Amended by:** srs-web#423 (Toolbar and paragraph strip parts and tokens, action-registry rule: see "Toolbar and paragraph strip"); srs-web#424 (page frame, Drawer, Wide: see "Shell frame, Drawer, Wide", and parts (g) and (h)); srs-web#441 (notices: see part (j)); srs-web#442 (agent library: see part (k)); srs-web#447 (pairing: see part (k)); srs-web#418 (reopen: see part (k))

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
`--inspector-width`, `--content-max`; in `tokens.css`) and **component** (`--<block>-<property>[-<state>]`, for example
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
| `Block` | `gutter`, `handle`, `strip`, `action`, `menu`, `main`, `head`, `title`, `margin` |
| `Toolbar` | `bar` (the root), `lead`, `title`, `status`, `primary`, `menu` (a group trigger or the lone Help icon), `overflow` (the narrow tier's one menu), `trail` (the shell's inspector button, last in the bar) |
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
| `Notice` | `icon`, `body`, `dismiss` |
| `ToastHost` | `host` |
| `Diagnostics` (notice variant) | `summary`, `toggle`, `group`, `count` |
| `Collection` (lens) | `head`, `by`, `set-bar`, `group`, `row`, `toggle` |
| `Focus` (lens) | `bar`, `mode`, `block` |
| `Context` (lens) | `head`, `by`, `skipped`, `in`, `shown` |
| `ContextGroup` (lens) | `list`, `row`, `item`, `add` |
| `LensSwitcher` | `tab`, `more` |
| `RecordProse` | `title`, `meta`, `body`, `more`, `label`, `composite` |

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
- **Reading-card size.** Surface size is tokenised: `--popover-max-width` / `--popover-max-height`
  (menu values, `min(22rem, 90vw)` / `min(28rem, 80vh)`) and, for `card` popovers (`HoverCard`),
  `--hover-card-min-width: min(20rem, 90vw)`, `--hover-card-max-width: min(36rem, 90vw)`,
  `--hover-card-max-height: min(32rem, 70vh)`. A card sizes to its content between min and max and
  shrinks below min only on a viewport narrower than the 90vw guard. `Popover`'s `card` prop adds
  anchor fallbacks `bottom span-all` / `top span-all` after the flips, and makes `placeNextTo` clamp
  the width and pick the side of the anchor with more room. `HoverCard` places `bottom-end` (the card extends toward the page, away from the right rail). Menus are unchanged.
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
`data-margin="expanded"`, from 721px up). The essay page grows by the difference, so the margin never
crosses the page edge or the inspector, and the text column widens with Wide (owner D5, 2026-10-04:
Wide widens the content cap, `--content-max` 46rem to `--content-max-wide` 80rem, and the margin
column together; `--content-max` is the one cap for all four shells, `--canvas-max` is gone). `data-margin` on `.app` is the one mechanism and the one carrier: its setter is
`src/lib/wide.ts` (`saveWide`, storage key `srs-web.margin` kept so existing viewers keep their
setting), driven by View > Wide. Other tokens: `--margin-mark-size`, `--margin-row-gap`,
`--margin-label-lines`. The essay page reads `--content-max` itself (a custom property that aliased it on `:root` would not see the shell's Wide override).

Kind icons are mapped once, in `src/lib/components/annotation-icons.ts` (`KIND_ICONS`, owner decision
D3): the annotation's data key (`Annotation.icon`, the neighbour's type name) to a Lucide component,
with a fallback icon. A letter is never the only cue. `attachment` is a client presentation grouping
by neighbour kind; nothing here infers SRS semantics from it. A mark's hue is the attaching actor's.

## Consequences

- A skin re-points semantic and component tokens and reaches every shared component. The demo theme
  re-points semantic tokens only; `e2e/styleguide.spec.ts` fails if any specimen still paints a
  default palette colour, and `tests/demo-theme.test.ts` fails if a semantic colour token is not
  re-pointed there.
- Inspector components are shown at 20rem (`--inspector-width`) and 15rem in `/styleguide`, and an e2e check fails if any of
  them overflows its frame.
- Follow-ups:
  - Consolidating the five `@media` widths (`phone`, `form`, `compact`, `rail`, `wide`) into fewer;
    today they are only named and guarded (#424 removed `genericNarrow` and `genericStack`).
  - One-off buttons in the modals, `DecisionLogView`, `SourceChooser`, `BlueprintDocumentEditor` and
    the `SectionForm` table editor.

### (h) Toolbar and paragraph strip (#423)

- **Action registry.** A client's action list is one array of `ToolbarAction` (`menu-action.ts`): `group`
  (the menu it lives in), `kind` (`primary` = a bar button, `toggle` = a checkable row, `action` = a plain
  row) and `checked` (`true | false | "mixed"`, present = `menuitemcheckbox`). The essay's list is
  `headerActions()`; a shell passes its own groups. One renderer per surface (`Toolbar`), at every width: tiers
  `full` (labelled menus), `compact` (icon-only menus) and `narrow` (title, primary and one overflow menu
  with a section per group) are chosen from `BREAKPOINTS` (`RAIL`, `NARROW`, `tierOf`), and only the active
  tier's DOM exists, so no action is rendered twice. A group with one action is an icon button, not a menu
  (the Help icon keeps its native `popovertarget`). The narrow overflow is the toolbar's own; a shell's nav
  hamburger goes in the `lead` slot (#424). A `Breadcrumb` (`nav`/`ol`, parts as `breadcrumb__sep|current|link`) is
  `titleSlot` content: the Governance and Guides bars put it there, the current item ellipsising in the one-row bar.
- **Checkable rows** keep a View-style menu open on toggle (wide tiers) so the reader sees the state change;
  the narrow overflow closes. `Popover` keyboard handling covers `menuitem` and `menuitemcheckbox` rows with
  Arrow, Home and End. State is never duplicated: View > Comments reads and drives `thread-visibility.ts`,
  View > Wide drives `wide.ts`.
- **Paragraph strip.** `paragraphActions()` marks `primary` actions (hide, zoom, copy link). `Block` renders
  them as a small strip INSIDE the paragraph's own title row at its right end (`.block__head`, absolute,
  `right:0`; centred in a titled head, hanging from the content top in an untitled one), so it never leaves
  the block and cannot touch a neighbour's handle or thread composer or the margin column; on hover it may
  cover the end of a long title. The handle and the ellipsis menu are always visible; everything (the strip's
  tools included) is in the menu. One surface at a time, in CSS only: hover wins over pointer and stale
  focus, a strip whose own controls hold keyboard focus stays, and a focused editable body matches
  `:focus-visible`. The strip is hidden on touch and on a phone.
- **Tokens.** `--toolbar-bg`, `--toolbar-border`, `--toolbar-gap`, `--toolbar-pad`, `--toolbar-title-size`,
  `--toolbar-title-max`; the strip keeps the opaque `--block-tools-bg|border|shadow` surface (the family was
  the old tool stack's, and is not renamed).

### (i) Shell frame, Drawer, Wide (#424)

- **One frame.** `AppShell` is a `100dvh` grid `nav | main | inspector` that never scrolls the window:
  the nav scrolls `.nav__scroll`, main has exactly one scroller (`.workspace`, the bar is outside it) and
  the inspector scrolls `.inspector__body`. Nav and inspector are resizable (`ResizeHandle`, pointer and
  keys) and persisted per viewer, globally, in `srs-web.columns` (`columns.ts`; limits and defaults are
  tokens). The state is `ShellState` (`shell-context.svelte.ts`, read with the undefined-safe
  `getShell()`), so a standalone bar renders no drawer triggers.
- **Parts.** `AppShell`: `nav main inspector` (the `.app__*` classes). `Drawer`: `scrim` (the dialog, the
  backdrop hit area), `panel`. `ResizeHandle`: `grip`.
- **Tokens.** `--nav-width`, `--inspector-width`, `--content-max` (46rem), `--content-max-wide` (80rem),
  (the one content cap for all four shells; `--canvas-max` and `--topbar-height` are removed), and in `tokens-components.css`
  `--shell-nav-min|max`, `--shell-inspector-min|max`, `--shell-resize-hit`, `--shell-drawer-width`,
  `--shell-drawer-bg`, `--shell-drawer-bg-dark`, `--shell-drawer-motion`, `--shell-scrim`,
  `--shell-badge-bg|fg`, `--resize-handle-active`.
- **Breakpoint roles.** `compact` (720) is the nav drawer: at and below it the nav is off-canvas, opened
  by `NavTrigger`. `wide` (1100) is the inspector drawer, opened by `InspectorTrigger` with an activity
  badge. `DRAWER_NAV` and `DRAWER_INSPECTOR` are built from `BREAKPOINTS`; one `matchMedia` each, read
  synchronously. The old 480/600/720/900 per-shell collapses are gone.
- **Drawer is a second top-layer primitive.** It is a native modal `<dialog>` (`showModal()`), because a
  drawer is modal (focus trap, inert background) which a popover is not. Dismissal is Popover's (part e):
  Escape and a backdrop click close it, focus returns to the trigger. It is the only `showModal` user;
  the `GitSaveModal` and `SuccessorModal` z-index modals stay with #428 and a drawer must be closed
  before one opens (`ShellState.navOpen` / `inspectorOpen`).
- **Wide.** One persisted per-viewer switch shared by all editors: `data-margin` on `.app` (the one carrier; set to `expanded` only when `wideEnabled` and Wide is on, else `compact`) widens the content cap and the margin column. Every shell (Essay, Generic, Governance, Guides) has the capability
  (`ShellState.wideEnabled`) and shows the action; a shell without it would ignore a stored Wide. Forms carry no
  max-width of their own: the container (`.canvas`, the essay page, the generic page) caps the width.

### (j) Notices (#441)

One notice system, three shapes, one store (`src/lib/notices.svelte.ts`):

- **Toast = an event** ("Link copied", a save result). **Notice = persistent state** (an error beside its
  cause, a read-only note, a size warning). **Diagnostics = the engine's findings**, grouped by identical
  message with a count, built on `Notice`. `Toast` is one row; `ToastHost` is the host; `NoticeRegion`
  renders pinned document notices (today the catalog diagnostics).
- **Roles.** `Main` always renders `LiveRegions`: two visually-hidden regions outside the popover, a plain
  `aria-live="polite"` div for non-error toasts and an `aria-live="assertive" aria-atomic="true"` div for
  sticky errors. The assertive region has **no** `role="alert"`: an empty always-present alert node would
  break every "no alert on this path" assertion. The text is written into the already-rendered node and
  cleared when the toast goes. The visual toast text is `aria-hidden` (never the row: it holds the
  focusable close button), so a toast is heard once. Inline `Notice`: `role="alert"` for `error`,
  `role="status"` for the rest. The grouped Diagnostics notice is always a status (kind `warning` or `info`),
  never an alert; errors read strong through their own rows.
- **Strength.** Errors are sticky (no timer) and strong (error rule and fill, medium weight); everything
  else is quiet and auto-dismisses (`TOAST_MS`, 4000 ms by default).
- **Anchoring.** `ToastHost` is a native `popover="manual"` (part e): top layer, out of flow, so it never
  shifts layout and needs no `z-index`. It is placed bottom-centre of its own `.app__main` by the pure
  `placeBottomCentre` (the bottom edge comes from `visualViewport`, so it clears a mobile keyboard);
  `--toast-offset-bottom` lifts it clear of the agent dock.
- **Re-stack.** A new toast, and a drawer opening (`ShellState.navOpen` / `inspectorOpen`), do
  `hidePopover()` then `showPopover()`, so the host re-enters the top layer above the modal Drawer and its
  scrim. The live regions are outside the popover, so nothing is re-announced. **Limitation:** while a modal
  drawer is open the toast is painted above the scrim but inert (the dialog makes everything outside it
  inert), so its close button cannot be clicked; a sticky error stays until the drawer closes and it is
  dismissed, or the next save replaces it. (Hit-testing cannot see an inert element; the e2e checks pixels.)
- **One save key.** Every save result (App's, and Governance's local recovery copy) uses `key: "save"` and
  testid `save-status`, so a later result replaces an earlier one: the next save, success included,
  replaces a sticky save-failure toast. A save failure is the one error that is a toast (it has no
  location); location-bound errors (an export beside its button, a form, a picker) stay inline.
- **Pinned notices.** `pinNotice` / `unpinNotice`; `Main`'s `NoticeRegion` renders them directly below the
  bar and above the scroller. `Main` takes a `bar` snippet and renders bar, notice region, children in real
  DOM order (no CSS `order`); shells pass their Toolbar as `bar`. `resetNotices()` runs first on
  every document load (toasts, timers, diagnostics dismissals); pinned notices are replaced or unpinned by
  the load path.
- **Dismissal** of a diagnostics notice is per session and per `documentKey`, and re-shows when the
  diagnostics content changes (D3).
- **Grouping** keys on the exact (trimmed) message and severity until the engine exposes a structured
  `code` (srs-rust#1264); `groupDiagnostics` is the one function that changes then. The engine's string
  arrays (render, find, navigation) have no severity and are shown as warnings (`toUiDiagnostic`, the one
  adapter).
- **Toolbar status keeps state** ("Unsaved changes"), never events.
- **Guard.** `tests/no-adhoc-notices.test.ts` fails on a new or removed `role="alert"` (or dynamic
  `role={...}`) in a Svelte file unless it is in its allowlist (modal #428,
  form errors #426, `Notice` itself, `HoverCard`'s own role, the styleguide specimen).
- **Parts.** `Notice`: `icon body dismiss`. `ToastHost`: `host`. `Diagnostics` (notice variant):
  `summary toggle group count`; the dismiss control is `Notice`'s `dismiss`.
- **Tokens.** `--notice-bg|border|pad|gap|radius|warn-rule|error-bg|error-rule` and
  `--toast-bg|border|shadow|width|offset-bottom|gap`, in `tokens-components.css`.

### (k) Agent library (#442)

The agent and relay libraries are one presentational component, `AgentPanel`, used by the essay rail and the
floating dock. It takes data and handlers through props from `App.svelte` (the only owner of stores, hosts and
sessions) and never imports a store. This is client configuration, not SRS semantics (ADR-001).

- **Rows, not headings.** Agents and relays are `<li>` rows (`data-part="agent" | "relay"`): a compact
  `ActorMark`, the name (a `<span>`, truncated, full name in `title`), the relay label and "Connected 2 min
  ago" in the muted meta size, a status dot (`aria-hidden`; the status word is visually-hidden text with
  `data-testid="mcp-status"`), `Button size="sm"` Connect or Disconnect, and the other actions in a `⋯`
  `ActionMenu`. No `h1`-`h6` and no `<details>` inside the panel.
- **`Disclosure`** is the one inline show/hide pattern: a ghost small `Button` with a Lucide chevron,
  `aria-expanded` and `aria-controls`. `Panel` stays a native `<details>`; `Disclosure` is for sections inside a
  panel ("Connect an agent", "Add a relay").
- **Errors are inline** (part j): add, edit and remove errors come back from App's handlers as text and render as
  `Notice kind="error"` beside their cause; a connection error renders in the agent's `McpConnection` block.
  Confirmations ("Relay added", "Relay removed", "Agent forgotten") are `info` toasts raised by App's handlers,
  never by the panel.
- **Decisions.** D1 a relay with agents cannot be removed (no cascade that destroys channel credentials). D2 an
  agent's relay is fixed at creation (credentials are per agent per relay). D3 a relay's URL is editable only
  while no agent uses it; its label always is. D4 `VITE_MCP_RELAY_URL` and the legacy `srs-web.mcp-relay-url`
  key seed the library once; a later env change does not re-seed. D5 first run keeps one seeded agent, hidden
  until a relay exists and bound by `adoptRelay` when one is added. D6 rename only while disconnected (the actor
  name is fixed when a session opens). D7 Go → Agents… is an `onopenagents` handler in every shell (`onOpenAgents` is in the
  editor-shell contract): the essay hosts its own panel, the other shells open the floating dock, which is the placement when a shell has no rail.
- **Parts.** `AgentPanel`: `agents relays agent relay name meta dot actions`. `Disclosure`: `disclosure body`.
- **Tokens.** `--agent-panel-gap|row-pad|row-gap|dot-size|name-size|meta-size`, in `tokens-components.css`.
- **Pairing (#447).** "Pair an agent…" in an open agent's `⋯` menu shows the connector URL, the pairing code and a
  minute-granular expiry in `McpConnection` (parts `pairing`, `direct`); the raw capability URL is a second `⋯` item,
  "Direct URL…", opening in the same slot (one view at a time, #456). `PairingLoader` owns the fetch, the refresh timer and the announcement, so
  `McpConnection` stays presentational. A pairing error is location-bound (part j): an inline `Notice` beside the
  kept code, never a toast. A refreshed code is announced through `notify` (polite `LiveRegions`); that is also a
  visible 4 s toast, accepted. No new tokens.
- **Specimens.** `/styleguide` renders five groups (no relay, one relay and no agents, several relays and agents,
  connection errors, pairing shown) at 20rem, 18rem and 16rem.
- **Reopen (#418).** Agents that were open on a repository when the page closed reopen when the same repository
  opens again, reusing the same channel and credentials (the agent's `reopen` field holds the repositoryId; a
  Disconnect or Forget clears it). A channel another tab holds stays "in use elsewhere" (part j, no toast); a
  failed reopen shows the row's existing error state. The host also keeps each agent's last `initialize` body
  (client metadata only) and replays it into the fresh session, so paired clients keep working. No new part or
  token, so no specimen change.
