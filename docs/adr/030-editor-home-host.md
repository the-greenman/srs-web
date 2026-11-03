# ADR-030: Editor home: a host-aware home page whose words are help records

- **Status:** proposed
- **Date:** 2026-11-03
- **Issue:** [srs-web#700](https://github.com/the-greenman/srs-web/issues/700), unit [semanticops.com#54](https://github.com/the-greenman/semanticops.com/issues/54)
- **Rulings (all proposed):** srs-programme D1 `73dba259` (where the home lives), D2 `9c116ddb` (home words are help records), D3 `287c64f4` (examples are `?open=` links); remedy `6848d96e`
- **Builds on:** [ADR-021](021-open-from-url.md) (open from a link), [ADR-023](023-one-hash-address.md) (address), [ADR-027](027-editor-layers.md) (layers)

## Context

A person arriving to write an essay met the generic landing: a file picker for SRS repositories. The essay editor had no front door of its own that said what it is, offered a start, and showed what an essay looks like.

## Decision

1. **The home lives on the same Worker (D1).** `essay.semanticops.com` and the path `/essay` render `EssayHome` instead of `Landing`. `parseHome(hostname, pathname)` (`src/lib/open-url.ts`) decides; `main.ts` passes it to `App` as `home`. It is one literal host (`ponytail:`); a table follows when a second editor wants its own host.
2. **The words are help records (D2).** Every sentence on the home comes from the `essay-home` container of the help repository (`helpFor("essay-home")`); the component holds only chrome (ADR-027).
3. **Examples are links (D3).** The example essays are static `.srsj` files under `public/examples`, linked as `?open=/examples/<file>.srsj&editor=essay`. `parseOpenUrl` resolves a path beginning with `/` against the current origin, so one link works on every host.
4. **"New essay"** calls the same `startNew` that `?new=essay` does. The notices (restore, repository link, errors) are one snippet shared by both landings.
5. **`ui_help` cannot reach the home.** No repository is loaded there, so a paired agent has nothing to ask. The concept records are shared into the `essay` help container, so an agent reads them once an essay is open.

## Consequences

- The Worker serves one more custom domain, and `essay.semanticops.com` is added to `APP_ORIGINS`.
- **Owner follow-up:** register `https://essay.semanticops.com/` with the GitHub OAuth App, Dropbox and Google consoles before sign-in works on that host.
