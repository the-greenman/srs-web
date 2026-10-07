# ADR-021: Opening an archive from a link is read-only

- **Status:** accepted
- **Date:** 2026-10-06
- **Issue:** srs-web#471

## Decision

`/?open=<https url>` fetches an `.srs` or `.srsj` (no credentials, `https:` only, `http://localhost` in dev, 50 MB cap) and hands the bytes to the loaders "From this device" already uses (`openLocalFile`). No second loader.

- **Read-only is a state of the open document**, not a mode of one shell: no save target, package editors are not offered, the generic shell hides editing, and the repository handle refuses every mutating binding (`src/lib/read-only.ts`; a test fails when a new binding is unclassified). The core has no read-only repository handle, so this client-side stop is the nearest honest option beneath the hidden controls.
- **Agents** attach as usual, and the core session `WriteGuard` is applied over every container and record. The guard cannot say "everything": `relation_create` and records or notes created outside any container are not covered.
- **Save a copy…** (Document menu) uses the first-save destination choice. A cloud copy becomes the open, editable document; a download leaves the link's document read-only.
- **The URL is cleared** (`history.replaceState`) as soon as the parameter is read, success or not, so a refresh lands on the picker and never re-fetches or retries a failed link by surprise.
