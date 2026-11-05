# ADR-031: Published packages are served from this site, and an agent can only ask

- **Status:** proposed (decision 508703ce, in the WG Agent-supported editor's log)
- **Date:** 2026-11-05
- **Issue:** srs-web#712 (remedy 5c4ed19d, vignette e182fed6)

## Decision

An open document can find the published packages and install what it needs, with no reload.

- **The list.** `packages.lock.json` is the list of what is published. `scripts/ensure-packages.mjs` generates an `ext:registry` catalog from it, reading each entry's facts from the verified bundle. The lock supplies only the one-line `description`, because the bundles carry none. The app reads its own copy (`src/lib/packages/catalog.json`), parsed by the core; `public/packages/index.json` is the same file for anything else that wants the list.
- **The bundles.** Every current bundle is served from `public/packages/`. A lock entry with `onInstall: true` isn't built into the app, so it costs nothing until someone installs it. Install fetches from this origin and checks the catalog's sha256. It takes a catalog entry, never a URL.
- **Why this origin.** GitHub release downloads send no CORS header, so a browser can't fetch them. A catalog on another host would need its own CORS, uptime and trust story, and nothing asks for that yet.
- **Two tools, added to the host's own (ADR-028).** `ui_packages` lists what's installed and published. `ui_request_package` asks. Neither writes: the only thing that installs is the writer's click in the plan dialog, and the essay write guard is unchanged.
- **The request returns at once.** A relay frame is answered synchronously (`FrameHandler.handle`), so a tool call can't wait for a person. `ui_packages` reports how the last request ended: `asking`, `installed`, `declined` or `failed`.
- **The core decides.** What is missing, satisfied or too old comes from `check_package_requirements`, and the core refuses what isn't met (ADR-001).

## Consequences

- Publishing a new package to writers takes a lock change and a deploy.
- A package fetched on install can't upgrade yet, because upgrade works from bundles built into the app. It shows as outdated in the dialog, with no button and no notice. Add this when one has a second published version.
- `srs-rust#1153` (`package_install` over MCP) stays a separate path, for hosts with no writer present.

## Revisit when

- A publisher outside this programme needs to appear in the list. That brings trust and signing, and RFC-047 (srs#871).
- A writer needs a package between deploys.
