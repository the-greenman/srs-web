# ADR-019: UI theming surface and live styleguide — tokens plus a `theme` layer; `/styleguide` is the specimen surface

- **Status:** accepted
- **Date:** 2026-10-04
- **Issue:** [srs-web#420](https://github.com/the-greenman/srs-web/issues/420) (story [muDemocracy.org#282](https://github.com/the-greenman/muDemocracy.org/issues/282))
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** —

## Context

Component specimens lived in static HTML (`docs/design/index.html`, `editor.html`, `viewer.html`),
hand-copied from what the Svelte components render. The copies drift, cannot show agent
participation states, and cannot prove the widgets can be reskinned.

[ADR-007](007-frontend-css-themes.md) covers rendered-document preview CSS for GuidesShell. That is
a different concern from UI chrome, so there is no conflict. The duplicate ADR-007 files are not
renumbered here.

Layer semantics. Re-pointing tokens is the normal way to reskin and works from any layer. A `theme`
layer above `components` is the documented escape hatch for overriding component rules.

Constraint: ADR-001 (thin client). The styleguide is presentation only.

## Decision

1. **Skinning surface.** Tokens (`tokens.css`) plus a `theme` cascade layer. The layer order is
   `tokens, base, layout, components, theme, utilities`.
2. **Demo theme.** `src/styles/themes/demo.css` is `@layer theme { :root[data-theme="demo"] { … } }`
   and re-points tokens only, never component classes, to prove the token surface alone can reskin.
   It is imported only by the styleguide, so it is emitted only in that lazy chunk.
3. **Live styleguide.** A hidden, unlinked `/styleguide` route (`src/Styleguide.svelte`) mounts the
   real components with fixture props (`src/styleguide/fixtures.ts`) and a theme switcher. It is the
   single specimen surface; later component phases add their specimens there.
4. **Retire the static pages.** `docs/design/*.html` are deleted.

## Consequences

- Specimens cannot drift from the components, and each component is checked against a second skin.
- **Known limit.** Unlayered scoped Svelte `<style>` blocks, such as the dark-mode blocks in
  `GuidesShell.svelte` and `GovernanceShell.svelte`, beat every layer, including `theme`. Moving the
  shells onto `AppShell` removes them (#424).
- Hard-coded colours in components still ignore the demo theme until the component-token work (#421).
- The route is public but holds fixture data only. Production's SPA fallback serves it unchanged.
