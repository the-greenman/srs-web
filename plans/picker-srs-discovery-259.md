# Plan: File picker SRS discovery — default filters, marker detection, bounded auto-scan (#259)

> Issue: [srs-web#259](https://github.com/the-greenman/srs-web/issues/259) · Story: [muDemocracy.org#131](https://github.com/the-greenman/muDemocracy.org/issues/131) (Epic 02 — Governance app)

## Summary

Opening a governance repository today means hand-navigating provider folder trees: the cloud
browser (Dropbox + GitHub) lists folders and loose files, GitHub only recognises a repository
when you are already standing in its directory, and the accepted-extension rules are four
duplicated inline regexes that disagree (GitHub's omits `.srs`). This plan makes valid SRS
repositories easy to find: one shared detection module (extensions + `.srs/`-marker /
`manifest.json` folder detection), a presentation-layer default filter with a "Show all files"
toggle, a bounded scan utility (generic BFS over `provider.list()` plus a native single-request
GitHub implementation over the Git Data API), auto-scan when the location is cheap to enumerate,
and an explicit **"Scan for SRS"** action when it is not.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | main session |
| Web App Worker | main session (phases executed inline) |
| Verification | Verification Agent (srs-web), Stage 7 |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Discovery is *detection only* — name/extension matching and marker-file spotting, never validation. Full validation stays in the WASM engine on open. No SRS semantics enter TS. | accepted |
| [ADR-016](../docs/adr/016-exploded-repo-tree-storage.md) | Repository entries (`kind:"repository"`) route through `openTree()`; the "Open as SRS repository" entry may appear at any directory depth. Scan results reuse this exact plumbing. | accepted |
| [ADR-018](../docs/adr/018-picker-srs-discovery.md) (new) | Discovery scan seam: optional provider-native `scanForSrs()` with a generic BFS fallback over `list()`; repo markers are `.srs/` dir **or** `manifest.json`; extension filtering moves from provider `list()` to the picker UI (presentation) with a Show-all toggle; auto/explicit budget model in one config file. | accepted |

Positioning-research consult: not applicable — no interop format, export/import surface, or
agent-facing contract is touched; this is picker presentation inside one client.

---

## Contracts

### WASM API surface

**No new or changed WASM methods are required.** Detection is name matching over provider
listings; opening and validating repositories uses the existing `loadRepo` /
`loadRepoFromArchive` / `loadRepoFromTree` paths unchanged.

### TypeScript types

No payload-schema-derived types change. New TS-only types (all in `src/lib/storage/`):

```typescript
// srs-detect.ts
export const SRS_MARKER_DIR = ".srs";
export const MANIFEST_FILE = "manifest.json";
export function isSrsArchiveName(name: string): boolean;   // *.srs
export function isSrsDocumentName(name: string): boolean;  // *.srsj | *.json
export function isOpenableName(name: string): boolean;     // archive || document
export function isScanTargetName(name: string): boolean;   // *.srs | *.srsj only (high signal — no bare .json)
export function stripSrsExtension(name: string): string;   // "gov.srsj" → "gov"; non-SRS names unchanged
export function toArchiveName(name: string): string;       // "gov.srsj" → "gov.srs" (ADR-015 auto-upgrade rename)
export function listingHasRepoMarker(entries: StorageEntry[]): boolean; // contains ".srs" folder or "manifest.json" file
// Full membership (exhaustive): .git, .srs, node_modules, .svelte-kit, .next, .cache, dist, build, target, vendor
export const SCAN_SKIP_DIRS: ReadonlySet<string>;

// srs-scan.ts
export type ScanMode = "auto" | "explicit";
export interface ScanOutcome {
  status: "complete" | "partial" | "skipped";
  entries: StorageEntry[];        // discovered files (kind "file") and repos (kind "repository")
  foldersListed: number;
  reason?: "too-large" | "budget-exhausted" | "truncated";
}
export function genericScanForSrs(
  provider: Pick<StorageProvider, "list" | "openTree">,
  path: string,
  mode: ScanMode,
  seed?: StorageEntry[],          // current listing, so the root is not re-listed
): Promise<ScanOutcome>;

// types.ts — StorageProvider gains one optional method
scanForSrs?(path: string, mode: ScanMode, seed?: StorageEntry[]): Promise<ScanOutcome>;
```

`StorageEntry` is unchanged. Discovered entries carry their scan-relative display path in `name`
(e.g. `governance/2026/board.srsj`) and a normal provider `id`/`path` so `chooseEntry` routes
them through the existing `open()` / `openTree()` switch untouched.

---

## Scope

- Shared detection module `src/lib/storage/srs-detect.ts`; all four inline extension regexes
  (`App.svelte`, `dropbox.ts`, `google-drive.ts`, `github.ts`) and the handle-kind checks
  (`local.ts`, `dropbox.ts`, `google-drive.ts`, `github.ts`) replaced with it.
- GitHub `listContents` extension filtering is deleted outright (it also wrongly excluded
  `.srs` archives); the complete listing is returned.
- Extension filtering moves out of `dropbox.ts list()` / `github.ts listContents()` into
  `SourceChooser.svelte` presentation, with a **"Show all files"** toggle. Providers return full
  listings (GitHub still emits the synthetic repository entry and still hides `manifest.json`
  behind it).
- Bounded scan: `src/lib/storage/srs-scan.ts` (generic BFS) + `scan-config.ts` (all depth /
  request / entry budgets, per provider and mode) + native `scanForSrs` on the GitHub provider
  (one `git/trees?recursive=1` request in-repo; bounded most-recently-pushed repo fan-out at the
  account level, explicit mode only unless the account is small).
- `SourceChooser.svelte`: auto-scan after each listing (non-blocking, staleness-guarded),
  "Found in subfolders" results section (deduped against the current listing), scan status line,
  and a **"Scan for SRS"** button when the auto scan was skipped or partial.
- Unit tests (vitest) for detect + scan + chooser; e2e (playwright) for auto-scan, explicit scan,
  show-all toggle, and scan-discovered repository opening via tree mode.
- ADR-018.

**Out of scope (deferred, each filed as an issue in Stage 3):**

- **Google Drive discovery** — Drive has no in-app `list()` (native Picker only); an in-app
  browser + scan is a separate feature.
- **Local folder support** — the local source is a single `<input type=file>`; browsing/scanning
  a local directory needs the File System Access API (Chromium-only) and a local tree handle.
- **Dropbox exploded-repo open** — scan can *detect* a `.srs`-marker folder on Dropbox but
  Dropbox has no `openTree()`; until it does, Dropbox scan surfaces archive/document files only.

---

## Phases

### Phase 1: Shared detection module + presentation-layer filter

**Goal:** One source of truth for "what is SRS-relevant", used everywhere; pickers default-filter
with a Show-all escape hatch; GitHub surfaces `.srs` archives.

**Agent:** Web App Worker

#### Tasks

- [x] Create `src/lib/storage/srs-detect.ts` with the exports in Contracts (pure functions, no I/O).
- [x] Replace every inline extension check with the named detect function (line numbers are
      hints, not anchors — locate by context):

      | Site | Replace with |
      |---|---|
      | `App.svelte:128` name-strip on open | `stripSrsExtension` |
      | `App.svelte:189` archive name-strip | `stripSrsExtension` |
      | `App.svelte:266` auto-upgrade **rename** (strip + append `.srs`, not a bare strip — a bare `stripSrsExtension` would create extensionless files) | `toArchiveName` (unit-tested) |
      | `dropbox.ts:304` list filter | **delete** file filtering — `list()` returns all entries |
      | `github.ts` listContents filter | **delete** extension filtering — returns dirs + all files, still excluding `manifest.json` behind the synthetic repository entry |
      | `dropbox.ts:148`, `google-drive.ts:105`, `github.ts:193`, `local.ts:15` handle-kind | `isSrsArchiveName` |
      | `google-drive.ts:221` picker validation | `isOpenableName` |
      | `SourceChooser.svelte:73` local `.srs` routing | `isSrsArchiveName` |
      | `SourceChooser.svelte:235` row kind label | `isSrsArchiveName` |

- [x] `github.ts listContents`: detect the repository via `listingHasRepoMarker` (manifest.json
      **or** `.srs/` dir) instead of manifest-only `hasManifest`. **The marker check must run on
      the raw pre-exclusion item view** — `manifest.json` is excluded from the returned entries
      by construction, so running it on the final array would silently break manifest detection.
- [x] `SourceChooser.svelte`: `visibleEntries` applies the default filter (folders + repository
      entries + `isOpenableName` files, then the existing name filter); add a "Show all files"
      checkbox (`data-testid="cloud-browser-show-all"`) that bypasses the extension filter;
      empty-state message reflects filter state.
- [x] Update `tests/storage.test.ts` (Dropbox list now returns all files; GitHub listContents
      includes `.srs`; repository entry appears for a `.srs/`-marker dir without manifest.json)
      and `tests/SourceChooser.test.ts` (filter + toggle).

#### Acceptance Criteria

- [x] No inline extension matching outside `srs-detect.ts` — verified by
      `rg -n '\.\(srsj\|json\|srs\)' src/ --glob '!**/srs-detect.ts'`,
      `rg -n 'endsWith\("\.srs' src/ --glob '!**/srs-detect.ts'`, and
      `rg -n '\\\.srs\$|\\\.\(srsj' src/ --glob '!**/srs-detect.ts'` (the bare-`\.srs$` and
      two-way shapes, the ones easiest to miss) all returning nothing, plus review.
- [x] A GitHub directory listing containing `data.srs` shows the archive by default.
- [x] A GitHub directory with `.srs/` but no `manifest.json` yields the "Open as SRS repository" entry.
- [x] "Show all files" reveals non-SRS files; default hides them.
- [x] `npm run typecheck`, `npm run lint`, `npm test` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test
```

#### Milestone gate

1. Verify all acceptance criteria above.
2. `npm run typecheck` + `npm run build` pass.
3. Mark checkboxes `[x]`; commit `feat(picker): shared SRS detection + default filter with show-all (#259)`.

---

### Phase 2: Bounded scan utility + provider scan seam

**Goal:** A reusable, budget-bounded discovery scan: generic BFS for any listing provider, native
single-request implementation for GitHub.

**Agent:** Web App Worker

#### Tasks

- [x] Create `src/lib/storage/scan-config.ts`: `SCAN_MAX_DEPTH = 3`;
      auto mode: `AUTO_MAX_ROOT_ENTRIES = 50`, `AUTO_MAX_LIST_REQUESTS = 20`;
      explicit mode: `EXPLICIT_MAX_LIST_REQUESTS = 60`;
      GitHub account fan-out: `GITHUB_AUTO_MAX_REPOS = 25`, `GITHUB_EXPLICIT_REPO_BUDGET = 40`;
      `SCAN_MAX_RESULTS = 100`; `SCAN_ENTRIES_PER_BUDGET_UNIT = 200` (a folder listing of N
      entries costs `1 + floor(N / 200)` budget units, so one huge internally-paginated Dropbox
      folder drains the budget instead of hiding its cost). All in one file, each knob commented —
      including that `SCAN_MAX_DEPTH` is a network-cost bound for the generic BFS but only a
      result-reporting bound for GitHub's single-request native scan.
- [x] Create `src/lib/storage/srs-scan.ts`: `genericScanForSrs` — BFS from `seed ?? await list(path)`;
      never descends into `SCAN_SKIP_DIRS`; collects `isScanTargetName` files; when a listed
      folder's own listing has a repo marker: emit a `kind:"repository"` entry if the provider has
      `openTree`, else do not emit and do not descend further into it; auto mode returns
      `{status:"skipped", reason:"too-large"}` when the seed listing exceeds
      `AUTO_MAX_ROOT_ENTRIES`; stops at request/result budgets with `status:"partial"`.
- [x] `types.ts`: add optional `scanForSrs?` to `StorageProvider` (shape in Contracts).
- [x] `git-data.ts`: extract a shared non-throwing tree-fetch primitive
      `fetchRecursiveTree(location): Promise<{ entries, truncated: boolean }>`; `readBranchBase`
      keeps its current throw-on-truncated behaviour, now built on it. (Without this the scan
      would have to duplicate raw tree fetching or string-match the truncation error.)
- [x] `github.ts`: implement `scanForSrs`:
      - in-repo paths (`owner/repo:branch[:dir]`): one `fetchRecursiveTree` call; directories
        with `manifest.json` or `.srs/` entries → repository entries; `isScanTargetName` blobs →
        file entries; truncated tree → `partial` with `reason:"truncated"`. Depth-bound results
        to `SCAN_MAX_DEPTH` below the scan root.
      - `owner/repo` path: scan the cached default branch the same way.
      - account root (`""`): auto mode skips unless repo count ≤ `GITHUB_AUTO_MAX_REPOS`;
        explicit mode scans up to `GITHUB_EXPLICIT_REPO_BUDGET` repos most-recently-pushed first
        (`/user/repos?sort=pushed`), one tree request each; reports `partial` with
        `reason:"budget-exhausted"` when unscanned repos remain.
- [x] Unit tests: `tests/srs-scan.test.ts` — generic BFS depth bound, request budget → partial,
      skip-dirs, auto too-large skip, repo-marker emission with/without `openTree`, dedup-safe ids;
      GitHub native scan with stubbed `fetch` (nested repo found, truncated → partial, account
      fan-out budget + ordering).

#### Acceptance Criteria

- [x] Generic scan of a 3-deep fake provider finds `.srs`/`.srsj` files and marker folders within
      budget; never lists inside `.git`/`node_modules`/`.srs`.
- [x] Auto mode on a >50-entry root returns `skipped/too-large` without a single extra `list()` call.
- [x] GitHub in-branch scan issues exactly one tree request.
- [x] `npm run typecheck`, `npm run lint`, `npm test` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test
```

#### Milestone gate

1. Verify acceptance criteria.
2. `npm run typecheck` + `npm run build` pass.
3. Mark checkboxes `[x]`; commit `feat(picker): bounded SRS scan — generic BFS + native GitHub tree scan (#259)`.

---

### Phase 3: SourceChooser auto-scan + "Scan for SRS"

**Goal:** The cloud browser presents discovered repositories/files automatically when cheap, and
on demand otherwise.

**Agent:** Web App Worker

#### Tasks

- [x] `SourceChooser.svelte`: after every successful listing (`openBrowser`, `chooseEntry` folder
      navigation, `goUp`), fire `provider.scanForSrs?.(path, "auto", entries) ??
      genericScanForSrs(provider, path, "auto", entries)` without blocking the listing render;
      a navigation token discards stale scan results; scan errors are swallowed into a quiet
      "scan unavailable" state (never block browsing). Stale scans are *ignored, not aborted* —
      no `AbortController` in v1; superseded scans run to completion in the background (accepted
      cost, noted here deliberately).
- [x] Render a "Found in subfolders" section above the listing when results exist: each result is
      clickable through the existing `chooseEntry` routing; results deduped against the current
      listing by entry id; show the scan-relative path as the entry label; cap display at
      `SCAN_MAX_RESULTS`.
- [x] Status line + button: `scanning…` while in flight; on `skipped` or `partial`, show
      **"Scan for SRS"** (`data-testid="cloud-browser-scan"`) which reruns in explicit mode;
      `partial` results render with a "showing what was found before the budget ran out" note.
- [x] Unit tests (`tests/SourceChooser.test.ts`): auto-scan renders discovered entries; stale
      results discarded on navigation; skipped → button visible; button triggers explicit scan.
- [x] e2e (`e2e/cloud-storage.spec.ts`): extend fake providers — small fake Dropbox tree with a
      nested `.srsj` (auto-scan surfaces it; clicking opens it), large fake folder (no auto-scan,
      button appears, explicit scan surfaces results), fake GitHub nested repository discovered by
      scan opens via `openTree` round-trip; "Show all files" toggle e2e.

#### Acceptance Criteria

- [x] Opening a small Dropbox folder shows nested `.srsj` files without any user action.
- [x] A large folder shows no auto results, offers "Scan for SRS", and the button produces results.
- [x] A scan-discovered GitHub repository entry opens in tree mode identically to one reached by
      manual navigation.
- [x] Navigating away mid-scan never paints stale results.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run e2e
```

#### Milestone gate

1. Verify acceptance criteria.
2. `npm run typecheck` + `npm run build` pass.
3. Mark checkboxes `[x]`; commit `feat(picker): auto-scan + "Scan for SRS" in cloud browser (#259)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` (vitest) passes
- [ ] `npm run e2e` (playwright) passes, including the existing walkthrough/cloud-storage suites
- [ ] No inline SRS extension regex outside `srs-detect.ts`
- [ ] ADR-018 committed (status `accepted` — shipped under it) and consistent with the implementation

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001): detection is name matching only; anything requiring
  content inspection (e.g. validating a manifest) goes through the engine on open.
- Scan budgets live only in `scan-config.ts` — no magic numbers at call sites.
- Verification Agent runs after Phase 3 and before final sign-off.

## Assumptions

- `.json` remains an accepted *open* extension (legacy `.srsj` content) but is **not** a scan
  target — scans surface `.srs`/`.srsj` only, to stay high-signal.
- Dropbox API returns dot-folders (`.srs`) in `list_folder`; the marker is therefore visible to
  the generic scanner. (Verified against API docs; e2e fakes model it.)
- GitHub API budget: one recursive-tree request per scanned repo is acceptable inside the
  authenticated 5000/hr limit at the configured fan-out budgets.
- The account-level GitHub fan-out treats each repo's **default branch** as its scan target;
  other branches are reachable by navigating into the repo and scanning there.
