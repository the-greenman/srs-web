# Plan: Live /styleguide route with theme switcher (#420)

## Summary

srs-web's component specimens live in static HTML (`docs/design/index.html`, `editor.html`, `viewer.html`). That markup is a hand-copied copy of what the Svelte components render, so it drifts, and it cannot show agent participation states or prove that the widgets can be reskinned.

This plan adds a hidden `/styleguide` route that mounts the **real** components with fixture props, plus a theme switcher that applies a deliberately different demo skin through a new `theme` cascade layer. It then deletes the static pages.

This is phase 1 of story muDemocracy.org#282. Later phases (#421–#426) add their new components' specimens here, so this is the surface every later phase builds against.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrating session |
| Web App Worker | Sonnet subagent |
| Verification | Haiku subagent |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client: the styleguide is presentation only, with fixture props and no SRS semantics | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) (new) | The UI skinning surface is tokens plus a `theme` cascade layer between `components` and `utilities`. The live `/styleguide` route is the single specimen surface, and the static `docs/design/*.html` pages are retired | accepted |
| [ADR-007](../docs/adr/007-frontend-css-themes.md) | Out of scope: rendered-document preview themes are a separate concern from UI chrome. ADR-019 says so | accepted |

The owner approved both ADR-019 choices in the story plan (2026-10-04): a hidden-but-live route, and the theme layer as the reskin API. That is why ADR-019 is written as `accepted`.

ADR-019 uses the ADR-001/ADR-018 header format (Status, Date, Issue, Supersedes, Amends, Superseded by). Its Context says three things:
- ADR-007 (`007-frontend-css-themes.md`) covers rendered-document preview CSS for GuidesShell. It is a different concern, so there is no conflict. Do not renumber the duplicate ADR-007 files.
- **Layer semantics.** Re-pointing tokens is the normal way to reskin and works from any layer. The `theme` layer sits above `components` as the documented escape hatch for overriding component rules. `demo.css` deliberately uses tokens only.
- **Known limit.** Unlayered scoped Svelte `<style>` blocks, such as the dark-mode blocks in `GuidesShell.svelte` and `GovernanceShell.svelte`, beat every layer, including `theme`. Phase #424 removes them as shells move onto AppShell.

## Contracts

### WASM API surface

**No** new or changed WASM methods. The styleguide calls the existing `initWasm()` (`src/lib/srs-client.ts:518`) so that `MarkdownText`'s `renderMarkdown` works.

### TypeScript types

No change.

## Scope

- **Routing.** In `src/main.ts`, `location.pathname` equal to `/styleguide` or `/styleguide/` mounts a dynamically imported `src/Styleguide.svelte` in place of `App`. It is not linked from any navigation. The OAuth callback check stays first and is unchanged.
- **`src/Styleguide.svelte`.** It mounts real components from `src/lib/components/` with static fixture props. Sections, each `<section id="…">` with an `<h2>` and an in-page table of contents:
  1. **Tokens:** colour swatches, type scale, spacing. Each swatch reads its value with `getComputedStyle`, so the swatches follow the theme.
  2. **Buttons:** `Button` in every variant, plus `active` and `disabled`.
  3. **Menus and popovers:** `ActionMenu`, `MarkdownHelp` (open), `HoverCard`.
  4. **Chips and badges:** `Tag`, `TagChip`, `ActorChip`, `CommentBadge` (0, 3), `AttachmentGlyph`, `EyeToggle`.
  5. **Actors:** one human `ActorChip` plus three distinct agent actors (`kind: "ai"`) and one unattributed author.
  6. **Annotations and comments:** `ParagraphMargin` in its compact and expanded variants, and `CommentThread` in three states: empty, with two agents plus a human, and with the name prompt (`needsName`).
  7. **Paragraph:** `Block` with a margin snippet, `BlockStack` of three items, and `InlineText`.
  8. **Panels and trays:** `Panel`, `LayersPanel`, `DraftTray`, `BinTray`, `PinnedPane`, `AgentFeed`, `McpConnection`.
  9. **Form controls:** `Input`, `Select`, `Textarea`, `Field`.

  There is no toolbar section. #423 adds one when `Toolbar` exists, because a static stand-in would only be thrown away (YAGNI).

  Every callback prop is a no-op, or local `$state` where a specimen needs to be interactive.
  - **Fixtures** live in `src/styleguide/fixtures.ts`, next to `src/Styleguide.svelte` and outside `lib/`, so no production module appears to depend on them.
  - Type them with `import type` from `$lib/srs-client`, `$lib/types`, `$lib/agent-activity`, `$lib/essay/annotations` and `$lib/components/menu-action`.
  - Import components from the `$lib/components` barrel (`index.ts`) where they are exported, and directly otherwise. Use the existing `actorHue`; never re-implement hues.
  - **Required props, as the reviewer verified:**
    - `AgentFeed`: `status: AgentStatus` with `writes: AgentWrite[]` (`seq`, `agentId`, `tool`, `changed`, `at`), plus `paragraphLabel` and `onselect`. Pin `now` to a fixed value.
    - `LayersPanel`: `Layer` needs `id`, `depth`, `label`, `hidden`, `inherited`, `hasChildren` and `folded`.
    - `Block` and `BlockStack`: their required callbacks and the `row` snippet.
    - `ParagraphMargin`: `annotations` (`kind`, `key`, `label`) and `onopen`.
    - `CommentBadge`: `label` and `onclick`.
    - `TagChip`: exactly one of `onSelect` or `onRemove`.
    - `Tag`: a `Status` union value.
    - `ActionMenu`: `MenuAction` needs `run` and `enabled`.
    - `MarkdownHelp`: `open`, and an `onclose` that is a no-op, so it stays open.
  - **WASM:** `initWasm()` gates only the `MarkdownText` specimens. Show "Loading…" while it runs and an inline error message if it fails (no unhandled rejection).
  - Set `<meta name="robots" content="noindex">` via `<svelte:head>`.
- **Theme layer.** `src/styles/index.css` declares the layer order `tokens, base, layout, components, theme, utilities`.
  - New file `src/styles/themes/demo.css`: `@layer theme { :root[data-theme="demo"] { … } }`. It also sets `color-scheme` explicitly.
    - It re-points semantic tokens to a visibly different skin (warm paper, a single accent hue, a larger radius, and a different font stack).
    - It touches tokens only, never component classes, to prove that the token surface alone can reskin.
  - The demo theme is imported **only** by `Styleguide.svelte`.
  - Switcher: the existing `Select` component, labelled "Theme", with the options "Default" and "Demo".
    - It sets `document.documentElement.dataset.theme`; Default removes the attribute.
    - The choice is remembered in `localStorage` under `srs-web.styleguide.theme`, with every read and write in try/catch, following the inline pattern in `Panel.svelte`.
  - Update both the `@layer` statement and the header comment in `index.css`.
  - `demo.css` is never imported from `index.css`, so it is emitted only in the lazy chunk.
- **Delete** `docs/design/index.html`, `editor.html` and `viewer.html`. Update every reference to them, in `src/styles/README.md`, `src/styles/index.css` (header comment) and `src/lib/components/README.md`, so it points to `/styleguide`.
- **`src/styles/README.md`.**
  - Document the `theme` layer and the reskin contract, including the escape hatch and the unlayered-scoped-style limit.
  - **Rewrite**, not just re-point, the paragraph about "two screens built entirely from these components" and the `ink-surface` filter note. Check where the filter is defined now (`index.html` or `App.svelte`) and say so.
- **`src/lib/components/README.md`.** Fix the stale "Status: not yet compiled" text and the `ActionMenu` prop row (`MenuAction[]`, not `ParagraphAction[]`).
- **e2e test `e2e/styleguide.spec.ts`.** Collect `console` errors and `pageerror` events inline; `helpers.ts` has no helper for this. It has the same WASM-bindings prerequisite as the other specs.
  - `/styleguide` renders 9 `section h2` headings, `data-theme` is absent by default, and there are no console errors or page errors.
  - Choosing Demo sets `data-theme="demo"`, and `getComputedStyle(document.documentElement).getPropertyValue('--color-bg')` differs from the default.
  - `/` mounts the app, and it has no `a[href*="styleguide"]`.

**Out of scope** (each phase covers its own item):
- New components (`IconButton`, `Popover`, `Toolbar`, `NavTree`, `ActorStack`, `AnnotationMargin`): #421–#425.
- The component-token tier, removing hard-coded colours, and `data-part` hooks: #421. Specimens that ignore the demo theme today are expected, and #421's computed-style check is what removes them.
- Moving shells onto `AppShell`: #424. The styleguide shows `AppShell` only as a small framed specimen if that is trivial, and otherwise omits it.

## Phases

### Phase 1: Route, specimens, theme layer

**Goal:** `/styleguide` renders the real components in both themes; the static design pages are gone.

**Agent:** Web App Worker

#### Tasks

- [x] Add the `src/main.ts` pathname branch: `location.pathname.replace(/\/$/, "") === "/styleguide"`, with a dynamic import and a consistent default export.
- [x] Add `src/styleguide/fixtures.ts` and `src/Styleguide.svelte` with sections 1–9. Call `initWasm()` before rendering any `MarkdownText` (show "Loading…" until it resolves).
- [x] Add the `theme` layer in `index.css`, `src/styles/themes/demo.css` and the switcher.
- [x] Delete `docs/design/*.html` and update the references and READMEs.
- [x] Add `e2e/styleguide.spec.ts`.

#### Acceptance Criteria

- [x] `npm run dev`, then open `/styleguide`: every section renders, with no console errors and no page errors.
- [x] The Demo theme visibly changes the background, the text and the accent-bearing elements.
- [x] `grep -rn "docs/design" --exclude-dir=node_modules --exclude-dir=dist .` returns nothing.
- [x] Every existing e2e spec is unaffected.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
npx playwright test e2e/styleguide.spec.ts e2e/app.spec.ts e2e/navigation.spec.ts
```

#### Milestone gate

1. Verify every acceptance criterion above.
2. `npm run typecheck`, `npm run lint` and `npm run build` must all pass.
3. Mark the checkboxes `[x]`.
4. Commit with a message ending `(#420)`.

## Final Acceptance

- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run build` succeeds, and `Styleguide` is a separate chunk: `dist/assets/Styleguide-*.js` exists, and the entry chunk does not contain the `styleguide` fixture text
- [x] `npm test` passes
- [x] `e2e/styleguide.spec.ts` passes
- [x] The production SPA fallback (`wrangler.jsonc` `not_found_handling: single-page-application`) serves `/styleguide`. This needs no config change.

## Coordination Rules

- The Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). Fixtures are plain objects matching the component prop types.
- Do not change component behaviour or styling in this phase. That is #421 onward. Specimens show the components as they are today.

## Assumptions

- `/styleguide` is public but unlinked. It contains fixture data only, never repository data.
- Agent actors in the fixtures use the RFC-046 `Actor` shape `{kind, id, name?}` from `src/lib/srs-client.ts`.
