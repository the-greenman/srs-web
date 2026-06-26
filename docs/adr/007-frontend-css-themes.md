# ADR-007: Preview themes use inline CSS constants, not WASM theme_variant

- **Status:** accepted
- **Date:** 2026-06-26
- **Supersedes:** —
- **Superseded by:** —

## Context

srs-rust's `render_document_view` service accepts a `theme_variant` parameter for rendering with different CSS themes. However, the render_service comments note: "local stylesheet paths are not yet resolved; stylesheet omitted" — in the WASM context, the engine cannot resolve file-system CSS assets. The `ext:themes-l1` type exists in the package schema but no gallery/muSrs fixture defines theme_variants, and the WASM binding currently hard-codes `theme_variant: None`.

For the browser preview iframe in `GuidesShell`, the HTML is injected into `<iframe srcdoc>` which includes an inline `<style>` block. The preview CSS is already a frontend concern (it is never persisted or exported to the SRS data model).

For print/PDF export, the WASM produces the HTML fragment; the print layout is controlled by the page wrapper CSS, not the SRS record data.

## Decision

Preview and print themes for the GuidesShell are **inline CSS constants defined in TypeScript** (`src/lib/guides/preview-themes.ts`), not sourced from WASM `theme_variant`. The theme picker in the Inspector swaps the CSS string passed to `PreviewPane`; no WASM call is made on theme change.

## Consequences

**Positive:**
- No WASM API change required; immediate implementation.
- Theme switching is synchronous (no WASM round-trip, no re-render of the document view).
- Fully ADR-001 compliant — CSS is a presentation concern, not an SRS semantic.
- Easy to evolve: when WASM theme resolution is implemented in srs-rust, the picker can be upgraded to pass `theme_variant` to `renderDocumentView` without breaking the UI contract.

**Negative / trade-offs:**
- Built-in themes are limited to what is defined in `preview-themes.ts`; they do not reflect package-defined themes from the SRS repository.
- If a future RFC adds exportable CSS themes to the SRS data model, the frontend constants will diverge from the package data until that upgrade.

**Neutral:**
- The `theme_variant` WASM parameter remains `None` for all `renderDocumentView` calls in srs-web; the rendered HTML fragment is unstyled and the preview iframe's `<style>` block is entirely frontend-owned.
