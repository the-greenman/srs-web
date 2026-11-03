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

## Amendment: `?repo=` opens a GitHub repository (srs-web#530)

`/?repo=<owner>/<name>[&ref=<branch>][&path=<dir>][&editor=<id>]` is a different link: not an archive but the user's own GitHub exploded tree (ADR-016), opened through the same `GitHubProvider.openTree` as the picker's "Open as SRS repository", so it is **editable** and saves through the usual Save dialog. GitHub sign-in is a popup, which needs a user gesture, so the link is shown as an "Open from GitHub" offer on the picker rather than opened at boot. `editor` is a request: it is selected only when usable for the loaded repository, as any editor choice is. The parameters are cleared from the address bar as soon as they are read, like `open`. Parsing is a pure helper (`parseRepoLink` in `src/lib/open-url.ts`).

## Amendment: `?new=` starts a new document (srs-web#640)

`/?new=<editor id>` opens a new, unsaved document in that editor, as **Start new** would make it (`createRepository`, named `Untitled <editor>`), so an editor can be shared with someone by one link (`https://app.semanticops.com/?new=essay`). Nothing is fetched and nothing is saved until the first Save. The parameter is cleared as soon as it is read, so a refresh never makes a second document. Two cases do not open at once: an id that names no editor able to start a document lands on the picker with a notice, and when a recovery copy is waiting (the browser keeps one) the picker offers **Restore** beside **Start a new …**, because the new document would replace that copy on its first edit. The id is matched case-insensitively. `new` wins over `repo` in one address (no generated link combines them); every boot parameter is cleared on read (`withoutBootLinks`). A failed start lands on the picker with its own notice, and a held offer stays until a document opens, so it can be retried. Parsing is a pure helper (`parseNewLink` in `src/lib/open-url.ts`).

## Amendment: `editor` on `open`; read-only editors (srs-web#699)

`/?open=<https url>&editor=<id>` names the editor to land in, a request as `?repo=&editor=` is: selected only when usable for the loaded document, otherwise the read-only link lands as before (`parseOpenEditor` in `src/lib/open-url.ts`; `withoutBootLinks` clears `editor` with `open`). On a read-only document the one availability computation (`offeredEditors`, srs-web#399) now keeps only editors that declare `readOnly: true` in the registry and whose requirements are met (an install or upgrade writes, so an unmet one is not offered). Only `essay` declares it: its shell shows a read-only document inert, with the read-only note, and offers **Save a copy…** instead of Save, New document and Copy document. Read-only stays a state of the document, not a mode of the shell. Example essays are ordinary `.srsj` files under `public/examples/` opened by this link, e.g. `https://app.semanticops.com/?open=https%3A%2F%2Fapp.semanticops.com%2Fexamples%2Fon-small-democracy.srsj&editor=essay`.
