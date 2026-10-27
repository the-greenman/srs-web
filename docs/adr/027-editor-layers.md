# ADR-027: Editor layers — core, headless behaviour, components, screens

- **Status:** accepted
- **Date:** 2026-10-27
- **Issue:** [srs-web#619](https://github.com/the-greenman/srs-web/issues/619)
- **Supersedes:** —
- **Superseded by:** —
- **Builds on:** [ADR-001](001-thin-client.md) (thin client), [ADR-019](019-ui-theming-surface-and-live-styleguide.md) and [ADR-020](020-icon-set-and-component-token-api.md) (the look)
- **Ruling:** the owner, 2026-10-24: "We need to keep the layers clean. Reusable components without UI, and then styleguide-driven edits."

## Context

ADR-019 and ADR-020 cover the look: token tiers, the `theme` layer, `/styleguide` as the one specimen surface. ADR-001 and capability-layering cover the core: SRS semantics live in srs-rust. Nothing says where the editor's own behaviour lives: state, acts, derivations and selection that are not SRS semantics. So the same behaviour is rebuilt inside each editor's markup (affirming a link in the method editor and again in the essay editor, srs-web#617). Nothing says either that a change of look starts on `/styleguide`.

## Decision

Four layers. Each change lives in exactly one of them.

1. **Core.** SRS semantics, in srs-rust through WASM (ADR-001). Unchanged.
2. **Headless.** Reusable behaviour with no UI, in `.ts` or `.svelte.ts` modules under `src/lib/` (by feature, `src/lib/<feature>/`). These hold state, acts and derivations. They contain no markup and no CSS, import no `.svelte` file, and do not touch `document`. Every editor that needs the behaviour uses the same module: the method affirmation editor and the essay editor share one headless module for tick and deny, and may look different.
3. **Components.** Svelte presentation over headless modules, styled only through tokens (ADR-020). Each shared component in `src/lib/components/` has a specimen on `/styleguide`.
4. **Screens.** Editors compose components. They add no behaviour of their own.

**Styleguide-driven edits.** A change of look is made on `/styleguide` first, in a specimen or in tokens, and reaches the screens through the component. A new shared component lands with its specimen.

**Scope.** srs-web editors only. The muDemocracy.org website keeps its own styleguide; srs-lab is out of scope for now.

## Guard

`tests/layers.test.ts` checks two things and fails on either:

- a headless module imports a `.svelte` file or touches `document`;
- a shared component in `src/lib/components/` is not mounted (`<Name`) or imported by `src/Styleguide.svelte` or `src/styleguide/`.

Existing offenders are the baseline, listed in the test with a reason each. The lists only shrink: an entry that is fixed is removed, and a new offender fails the test.

## Consequences

- A second editor needing behaviour that exists in the first extracts a headless module rather than copying it (srs-web#617 is the first case).
- The baseline entries are follow-up work, each named in the test; none is part of this change.
- Pointers: `CLAUDE.md` ("Layers") and `AGENTS.md`.
