# ADR-018: Picker SRS discovery — detection module, presentation-layer filter, bounded scan seam

- **Status:** proposed
- **Date:** 2026-07-23
- **Issue:** [srs-web#259](https://github.com/the-greenman/srs-web/issues/259) (story [muDemocracy.org#131](https://github.com/the-greenman/muDemocracy.org/issues/131))
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** [ADR-016](016-exploded-repo-tree-storage.md) Decision 5 — the repository marker
  is widened from `manifest.json`-only to `manifest.json` **or** a `.srs/` directory.

## Context

Users must hand-navigate provider folder trees to find their SRS repositories. Three structural
problems in the picker made this worse than it needed to be:

1. **Accepted-extension rules were duplicated four ways** — inline regexes in `App.svelte`,
   `dropbox.ts`, `google-drive.ts`, and `github.ts` — and disagreed: GitHub's listing filter
   excluded `.srs` archives entirely.
2. **Repository detection existed only in GitHub's `listContents`**, keyed only on
   `manifest.json`, and only for the directory the user is already standing in. The spec's
   `.srs/` marker directory (the definitive repo-root signal per `ext:repository`) was written
   (`.srs/.gitkeep` on first commit) but never read.
3. **No discovery** — nothing could tell the user "there are three SRS repositories two folders
   down"; providers filtered listings server-side-of-the-UI, so the UI could not even offer a
   "show everything" escape hatch.

Constraints: ADR-001 (thin client — no SRS semantics in TS), ADR-016 (repository entries route
through `openTree()`; the repository entry may appear at any depth), and provider API cost
(Dropbox `list_folder` per folder; GitHub REST 5000 req/hr but one `git/trees?recursive=1` call
returns an entire branch).

## Decision

**1. One detection module, name-matching only.** `src/lib/storage/srs-detect.ts` is the single
source of truth for SRS relevance: extension predicates (`.srs` archive, `.srsj`/`.json`
document) and folder-marker detection (a listing containing a `.srs` directory **or** a
`manifest.json` file is a repository candidate). Detection is *presentation-layer discovery* —
pure name matching over listings, never content inspection. Full validation remains in the WASM
engine on open. This keeps the feature on the right side of ADR-001/capability-layering: the
client points at things that look like repositories; the engine decides what actually is one.

**2. Both markers are accepted.** `.srs/` is the spec's marker; `manifest.json` is what ADR-016's
exploded-tree flow has keyed on since #246 (and dot-directories can be awkward or invisible in
some provider UIs). Discovery is a heuristic whose false positives cost one failed open with a
diagnostic, so the union is strictly better than either alone. *This amends ADR-016 Decision 5,
which defined the entry as appearing "wherever `manifest.json` is found" — the entry now appears
wherever either marker is found.*

**3. Extension filtering moves from providers to the picker UI.** `list()` implementations return
complete listings (GitHub still synthesises the repository entry and hides `manifest.json` behind
it, per ADR-016); `SourceChooser` applies the default SRS filter and owns a "Show all files"
toggle. Filtering is presentation, so it lives in the presentation component — and a toggle is
impossible while providers pre-filter.

**4. Scan seam: optional provider-native scan, generic fallback.**
`StorageProvider.scanForSrs?(path, mode, seed)` lets a provider exploit its cheapest enumeration
primitive; `genericScanForSrs()` is a budget-bounded BFS over the provider-agnostic `list()` seam
for everyone else. GitHub implements the native path (one recursive-tree request per repo —
enumerating a whole branch costs the same as listing one directory); Dropbox uses the generic
BFS. Scan results are ordinary `StorageEntry` values (`kind:"repository"` for marker folders,
`kind:"file"` for `.srs`/`.srsj`), so the existing `chooseEntry` → `open()`/`openTree()` routing
is untouched. Repository entries are only emitted when the provider has `openTree` — discovery
never surfaces something the provider cannot open.

**5. Auto vs explicit budget model, centralised.** Every bound (depth, per-scan request budget,
auto-trigger thresholds, GitHub repo fan-out, result cap) lives in
`src/lib/storage/scan-config.ts`. Auto mode is conservative (skip when the root listing is
large); the explicit **"Scan for SRS"** action re-runs with bigger budgets and reports partial
coverage honestly (`partial` + reason) instead of silently truncating.

## Alternatives considered

- **Detect repositories engine-side (new WASM capability).** Rejected: the engine cannot
  enumerate a user's Dropbox/GitHub — provider listing is inherently client transport, and name
  matching carries no SRS semantics. Capability-layering separates *finding candidate bytes*
  (client) from *interpreting them* (engine).
- **`.srs/` marker only (spec-pure detection).** Rejected: would break detection of every
  existing exploded repo keyed on `manifest.json` (ADR-016 behaviour) and of providers/UIs that
  drop dot-directories.
- **Filter toggle via `list(path, {all})` provider option.** Rejected: widens the provider
  contract for a purely presentational concern; providers would each reimplement the same filter.
- **Unbounded scan with a spinner.** Rejected: provider rate limits are shared with the save
  path; a runaway BFS over a big Dropbox tree can exhaust the API budget the user needs to
  actually save their work.
- **Explicit-only scan (no automatic trigger).** Simpler — no staleness handling, no
  auto-gate — but it puts the burden back on the user in exactly the common case (a small,
  obviously-cheap folder), which is the story's core complaint. The auto gate is deliberately
  conservative so the explicit button remains the path for anything costly.

## Consequences

- Adding SRS-awareness to a future provider means implementing `list()` (generic scan comes for
  free) and optionally a native `scanForSrs` when the provider has a cheaper bulk primitive.
- Google Drive (native Picker, no `list()`) and the local `<input type=file>` source get no
  discovery until they gain listing surfaces — tracked as follow-up issues.
- Dropbox scan surfaces files only until Dropbox gains an `openTree()`; marker folders it finds
  are deliberately not shown (nothing may be surfaced that cannot be opened).
- The four duplicated extension regexes are gone; any future extension change is a one-file edit.
