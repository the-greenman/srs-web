# Plan: Explain why Save is missing on a read-only local folder

> **Usage note:** The purpose of a plan file is to be reviewed and executed by agents. Write it with that reader in mind: unambiguous tasks, explicit file paths, named functions, checkable acceptance criteria. A plan that requires human interpretation at execution time is incomplete.

## Summary

Opening an exploded SRS repository folder from the local device in a browser without the File System Access API (e.g. Brave) falls back to `treeFromDirectoryInput()`, which produces a read-only `LocalTreeHandle` (`capabilities.write: false`). Both editor shells hide the Save button whenever `capabilities.write` is false, but nothing tells the user *why* it's missing or what to do instead. `LocalDocumentHandle` (opening a single `.srsj`/`.srs` file from-device) has the same silent gap. This is a hard platform limit, not a bug in the write path (srs-web#317, follow-up to #248/#316) — the fix is to explain it, not work around it.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | proposed |
| [ADR-016](../docs/adr/016-exploded-repo-tree-storage.md) | Exploded repo tree storage via `RepoTreeAware`/`DocumentHandle.kind === "tree"` | proposed |

No new ADR: this is a presentational addition to the existing `DocumentHandle`/`DocumentCapabilities` contract (an optional explanatory string alongside `capabilities.write`), not a new architectural constraint.

---

## Contracts

### WASM API surface

**No.** This is a pure TypeScript/Svelte presentation change — no SRS semantics, no WASM call.

### TypeScript types

`DocumentHandle` (`src/lib/storage/types.ts`) gains one new optional field: `readOnlyReason?: string`. No WASM-derived types are touched.

---

## Scope

- `DocumentHandle` gains an optional `readOnlyReason?: string`, populated only when `capabilities.write` is `false`.
- `LocalTreeHandle` (`src/lib/storage/local.ts`) sets it when constructed via `treeFromDirectoryInput()` (the `webkitdirectory` fallback), not when constructed via `pickLocalDirectory()`.
- `LocalDocumentHandle` (`src/lib/storage/local.ts`) sets it unconditionally (opening a single file from-device is always read-only today).
- `GuidesShell.svelte` and `GovernanceShell.svelte` render the reason text where the Save button would otherwise be, guarded by `{#if !onSave && readOnlyReason}` — both shells gain a new `readOnlyReason?: string | null` prop, passed through from `App.svelte`.
- `App.svelte` passes `activeDocument?.readOnlyReason ?? null` to both shells alongside the existing `onSave` wiring.
- `SourceChooser.svelte` labels the `webkitdirectory` fallback control (`#srs-folder`) as read-only up front (a `title` attribute, matching the pattern already used on the Chromium `Button`'s `title`).

**Out of scope:**

- A write-back path for browsers without the File System Access API (per-file Downloads would not update the repository in place and is worse than Export — explicitly rejected in the issue).
- Any change to `pickLocalDirectory()`'s writable path.

---

## Phases

### Phase 1: `readOnlyReason` on `DocumentHandle` and the local handles

**Goal:** `LocalTreeHandle` and `LocalDocumentHandle` expose a human-readable reason whenever they are read-only.

**Agent:** Web App Worker

#### Tasks

- [x] Add `readOnlyReason?: string;` to `DocumentHandle` in `src/lib/storage/types.ts`, documented as set only when `capabilities.write` is `false`.
- [x] In `src/lib/storage/local.ts`, give `LocalTreeHandle` a `readonly readOnlyReason?: string`, set in the constructor when `dir === undefined`: `"This folder was opened read-only — your browser doesn't support saving back to a local folder. Use Export to save your changes."`
- [x] Give `LocalDocumentHandle` the same field, set unconditionally to `"Local files opened from this device are read-only. Use Export to save your changes."`

#### Acceptance Criteria

- [ ] `treeFromDirectoryInput()`'s returned handle has `readOnlyReason` set; `pickLocalDirectory()`'s returned handle has `readOnlyReason === undefined`.
- [ ] `LocalDocumentHandle` always has `readOnlyReason` set.
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#317)`).

---

### Phase 2: Surface the reason in both editor shells + SourceChooser

**Goal:** A user who opens a read-only local folder sees why Save is missing, exactly where the Save button would be, and is warned before opening that the fallback control is read-only.

**Agent:** Web App Worker

#### Tasks

- [ ] `GuidesShell.svelte`: add `readOnlyReason?: string | null;` to the props type (near `onSave`), destructure it (default `null`), and in the `actions()` snippet, when `!onSave && readOnlyReason`, render a `<span class="guides-save-message" data-testid="readonly-reason">{readOnlyReason}</span>` where the Save `<Button>` is.
- [ ] `GovernanceShell.svelte`: same addition — prop, destructure, and in the `actions()` snippet a `<span class="topbar__save-message" data-testid="readonly-reason">{readOnlyReason}</span>` guarded by `{#if !onSave && readOnlyReason}`.
- [ ] `App.svelte`: pass `readOnlyReason={activeDocument?.readOnlyReason ?? null}` to both `<GuidesShell>` and `<GovernanceShell>` call sites (lines ~561 and ~590 today). This is the one place `undefined` is normalized to `null` (plan review, Plan Reviewer finding #3) — `DocumentHandle.readOnlyReason` itself stays `string | undefined`; only the shell props are typed `string | null` to match Svelte's `null`-friendly optional-prop convention used elsewhere in these shells (e.g. `saveMessage`).
- [ ] `SourceChooser.svelte`: add `title="Read-only in this browser — changes must be saved via Export. Use Chrome or Edge to save back to a local folder."` to the `webkitdirectory` `<input id="srs-folder">`'s enclosing `<label>` (the `{:else}` branch of `{#if canPickLocalDirectory()}`), matching the existing `title` on the Chromium `Button`.
- [ ] Add a unit test to `src/lib/storage/local.test.ts` (or the existing local-storage test file) asserting `treeFromDirectoryInput()`'s returned handle has `readOnlyReason` set and `pickLocalDirectory()`'s (stubbed `showDirectoryPicker`) does not.
- [ ] Add a component test asserting that when a shell (`GuidesShell`/`GovernanceShell`) is rendered with `onSave={undefined}` and a `readOnlyReason` string, the reason text renders (`data-testid="readonly-reason"`) and no Save button is present; and that with `onSave` set, the Save button renders and no reason text appears.

**Note (plan review, Plan Reviewer finding #1):** `guides-save-message` (`GuidesShell.svelte`) and `topbar__save-message` (`GovernanceShell.svelte`) are existing CSS classes already used elsewhere in the same files (confirmed by Architecture Reviewer) — no new CSS is needed for the reason span.

#### Acceptance Criteria

- [ ] Opening a folder via the `webkitdirectory` fallback shows the reason text where Save would be, in both Governance and Guides shells.
- [ ] Opening a folder via `pickLocalDirectory()` (writable) still shows the normal Save button, unchanged.
- [ ] The `webkitdirectory` fallback control has a `title` explaining it is read-only before the user opens anything.
- [ ] `npm run typecheck` passes; `npm test` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#317)`).

Do not start the next phase until the milestone gate passes. (Phase 2 is the last phase.)

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] WASM loads and all WASM API calls succeed against `gallery.srsj` (unaffected by this change, but must not regress)
- [ ] A read-only local-folder open (simulated via a stubbed `webkitdirectory` input in an e2e/unit test) shows the reason text instead of a Save button, in both shells
- [ ] A writable local-folder open (stubbed `showDirectoryPicker`) still shows the Save button, unchanged

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001) — this change adds no semantics, only a presentational string.
- Verification Agent runs after Phase 2 and before final sign-off.

## Assumptions

- The exact wording of `readOnlyReason` is not user-tested copy; it only needs to correctly explain the platform limit and point at Export, matching the issue's intent.
- No new e2e fixture browser is added; the existing pattern of stubbing `showDirectoryPicker`/`webkitdirectory` input (already used per the issue's "Verified against the live deployment... with a stubbed picker" note) is reused for a unit/component test rather than a new browser-specific e2e suite.
