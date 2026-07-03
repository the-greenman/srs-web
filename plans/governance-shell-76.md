# Plan: Extract GovernanceShell.svelte from App.svelte

## Summary

`App.svelte` has grown into a 33 KB god component that mixes WASM initialisation, repository loading, all governance-specific state and event handlers, and the three-pane layout. This makes governance logic hard to locate, test, or reason about independently of the app shell. The guides path was already correctly extracted into `GuidesShell.svelte` — this plan applies the same pattern to governance, producing a self-contained `GovernanceShell.svelte` component that owns everything governance-specific, and leaving `App.svelte` as a clean orchestrator of app-level concerns only. This is issue [srs-web#76](https://github.com/the-greenman/srs-web/issues/76).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude |
| Web App Worker | Claude |
| Verification | Claude (automated gates) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS. All WASM calls go through `$lib/srs-client.js` — GovernanceShell does not hold a raw WASM handle. | accepted |
| [ADR-002](../docs/adr/002-editor-mode-selection.md) | Explicit editor-mode selection stays in `App.svelte`. The `editorMode` state variable and the mode-picker template must NOT be relocated into GovernanceShell. | accepted |

No new ADRs are required. This refactor moves existing code without changing semantics.

**Pre-existing deviation noted:** The lifecycle/successor handlers contain a hardcoded status field UUID (`aee7afe9-6650-5fa4-a61a-495c3b88994b`) used to gate mutability and drive lifecycle transitions. This is pre-existing semantic coupling that predates this plan. It is carried forward verbatim and is not introduced by this refactor. A follow-up issue should address whether this UUID should be discovered from the schema rather than hardcoded. The `setFieldMetaContext` Svelte context pattern (propagating the `fieldMetaMap` to descendant components) is also pre-existing and preserved as-is; it is a rendering concern, ADR-001 compliant.

---

## Contracts

### WASM API surface

**No new WASM methods required.** All operations in `GovernanceShell.svelte` call the same `SrsRepository` methods already used in `App.svelte`. No changes to `srs-rust`.

### TypeScript types

No new TS type contracts introduced. Existing imports from `$lib/srs-client.js`, `$lib/types.js`, and the `$lib/governance/` modules are moved as-is.

---

## Scope

**In scope:**

- Create `src/lib/governance/GovernanceShell.svelte` with all governance-specific state, handlers, derived values, layout, and styles moved from `App.svelte`.
- Modify `src/App.svelte` to replace the governance subtree with `<GovernanceShell {repo} ... />` and remove all governance-specific code.
- Move `setFieldMetaContext(() => fieldMetaMap)` into `GovernanceShell.svelte`.
- Move the SVG ink-surface filter definition into `GovernanceShell.svelte` (it is only used in governance layout).
- Move governance-specific CSS from `App.svelte` into `GovernanceShell.svelte`.

**Out of scope:**

- Any changes to `GuidesShell.svelte` or the guides flow.
- Any change to WASM binding signatures.
- Any change to governance component logic (`RecordForm`, `Inspector`, `Nav`, `DecisionFlow`, etc.) beyond their import site. (`DecisionFlow` is now dead code as of srs-web#103.)
- Adding new features or capabilities to governance.
- Refactoring `GovernanceShell.svelte` internals further (e.g., splitting into sub-components) — deferred as future work.
- Resolving the hardcoded status field UUID — deferred as follow-up issue.

---

## Phases

### Phase 1: Create GovernanceShell.svelte

**Goal:** `src/lib/governance/GovernanceShell.svelte` exists and compiles, containing all governance state, handlers, layout, and styles.

**Agent:** Web App Worker

#### Tasks

- [x] Create `src/lib/governance/GovernanceShell.svelte` with the following props interface:
  ```ts
  interface Props {
    repo: SrsRepository;
    repoName: string;
    documentProvider: string;
    onExport: () => void;
    onOpenAnother: () => void;
  }
  let { repo, repoName, documentProvider, onExport, onOpenAnother }: Props = $props();
  ```
- [x] Move these state variables from `App.svelte` into `GovernanceShell.svelte`:
  - `sectionRecords`, `dynamicSections`, `activeSection`, `selectedId`
  - `diagnostics`, `instanceCount`, `sectionSchemas`
  - `formMode`, `editingRecord`, `formSaving`, `formError`
  - `showSuccessorModal`, `decisionFlowMode`, `decisionFlowSaving`, `decisionFlowError`
  - `fieldMetaMap` ($derived)
- [x] Move these derived values:
  - `activeRecords`, `activeSection_`, `isDecisionSection`, `activeSectionSchema`
  - `errorCount`, `validationAside`, `selectedRecord`
- [x] Move `setFieldMetaContext(() => fieldMetaMap)` call.
- [x] Move `mapDiagnostic`, `loadSectionRecords`, `buildSectionSchemas`, `refreshValidation` helpers.
  - Note: `buildSectionSchemas` depends on the output of `loadSectionRecords` — call them sequentially in `onMount`, matching the GuidesShell pattern (single try-block, sequential awaits).
- [x] Move `handleFormSave`, `handleFormCancel`, `handleEditRecord`, `handleDeleteRecord`, `handleLifecycleTransition`, `handleCreateSuccessor` handlers.
- [x] Move `governanceCrumbItems()` breadcrumb helper.
- [x] Move the SVG `<defs>` ink-surface filter block.
- [x] Move the three-pane layout template (AppShell + Nav + Workspace + Inspector markup).
- [x] Move governance-specific CSS (`.ink-surface`, three-pane grid, section-nav, workspace, inspector rules).
- [x] Use `onMount` for initial data load — sequential calls matching the GuidesShell pattern:
  ```ts
  onMount(async () => {
    await loadSectionRecords();
    await buildSectionSchemas();
    await refreshValidation();
  });
  ```
- [x] Import all subcomponents using their actual file names from `$lib/components/`:
  `AppShell`, `Breadcrumb`, `Main`, `Topbar`, `Workspace`, `Nav`, `NavGroup`, `NavItem`,
  `Inspector`, `InspectorSection`, `Card`, `Diagnostics`, `RecordForm`, `SuccessorModal`,
  `DecisionFlow`, `RecordReading`, `DecisionLogView`. (`DecisionFlow` is no longer imported in GovernanceShell as of srs-web#103.)

#### Acceptance Criteria

- [x] `src/lib/governance/GovernanceShell.svelte` exists.
- [x] `npm run typecheck` passes with zero errors.
- [x] `npm run build` succeeds.
- [x] No SRS semantics added in TypeScript — all WASM calls preserved as-is through `$lib/srs-client.js`.
- [x] `setFieldMetaContext` is called inside `GovernanceShell`, not in `App.svelte`.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass with zero errors.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit: `feat: create GovernanceShell.svelte with governance state and layout (#76)`.

Do not start Phase 2 until this gate passes.

---

### Phase 2: Wire App.svelte to GovernanceShell

**Goal:** `App.svelte` has no governance state or handlers; the governance subtree is replaced by `<GovernanceShell ... />`.

**Agent:** Web App Worker

#### Tasks

- [x] Import `GovernanceShell` in `App.svelte`.
- [x] Remove all governance-specific state, derived values, and handlers from `App.svelte` (all vars and functions listed in Phase 1).
- [x] Remove `mapDiagnostic`, `loadSectionRecords`, `buildSectionSchemas`, `refreshValidation` from `App.svelte`.
- [x] Remove `setFieldMetaContext` and its import from `App.svelte`.
- [x] Remove the SVG `<defs>` ink-surface filter from `App.svelte`.
- [x] Replace the governance template subtree (`{#if editorMode === 'governance'}...`) with:
  ```svelte
  <GovernanceShell
    repo={repo!}
    repoName={repoName}
    documentProvider={activeDocument?.provider ?? 'local'}
    onExport={handleExport}
    onOpenAnother={() => { repo = null; activeDocument = null; appState = 'idle'; }}
  />
  ```
  The `onOpenAnother` lambda is intentionally simple — all governance state that previously needed resetting here now lives in `GovernanceShell` and is garbage-collected when the component unmounts.
- [x] Simplify `loadDocument` in `App.svelte`: remove governance-specific side-effects (`sectionRecords = {}` reset, etc.). After this phase `loadDocument` only initialises `repo` and sets `appState = 'loaded'`.
- [x] Remove governance-specific CSS from `App.svelte` styles — keep only splash/boot/idle/mode-picker styles.
- [x] Verify no `sectionRecords`, `activeSection`, `selectedId`, `diagnostics`, `formMode`, or similar governance identifiers remain in `App.svelte`.

#### Acceptance Criteria

- [x] `npm run typecheck` passes with zero errors.
- [x] `npm run build` succeeds.
- [x] `npm test` passes — all existing tests continue to pass; no new test failures.
- [x] `App.svelte` contains no governance state variables or handlers.
- [x] Governance mode renders the same three-pane layout as before.
- [x] Guides mode is unaffected — `GuidesShell` is unchanged.
- [x] `setFieldMetaContext` is called inside `GovernanceShell.svelte`, not `App.svelte`.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

All commands must exit 0. A `npm test` failure indicates a regression introduced by this refactor and must be fixed before proceeding.

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit: `refactor: wire App.svelte to GovernanceShell, remove governance subtree (#76)`.

Do not proceed to Stage 6 until this gate passes.

---

## Final Acceptance

- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run build` succeeds
- [x] `npm test` passes — no regressions
- [x] WASM loads and governance section records load correctly when a `.srsj` file is opened in governance mode
- [x] `GovernanceShell.svelte` exists under `src/lib/governance/`
- [x] `App.svelte` contains no governance state variables or handlers
- [x] `setFieldMetaContext` is called inside `GovernanceShell.svelte`
- [x] Guides mode is unaffected
- [x] No SRS semantics added or removed in TypeScript (ADR-001 clean)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). No capability changes — only code movement. All WASM calls go through `$lib/srs-client.js`; `GovernanceShell` receives `repo: SrsRepository` as a prop and calls its methods — it does not hold a raw WASM handle.
- `GovernanceShell.svelte` receives `repo` and app-level callbacks as props; it does not instantiate them.
- `editorMode` and the mode-picker template stay in `App.svelte` (ADR-002).
- If any WASM method is found to be missing during implementation, file a `srs-rust` issue and stop.

## Assumptions

- The `GuidesShell.svelte` pattern is the correct model for `GovernanceShell.svelte` — same prop shape, same `onMount` for init.
- All governance child components are already self-contained and need only their import paths updated (no internal changes required).
- The ink-surface SVG filter is governance-only; moving it into `GovernanceShell.svelte` has no effect on the splash/guides screens.
- `handleExport` remains in `App.svelte` (it serialises the whole repo) and is threaded in via the `onExport` prop.
- The hardcoded status field UUID (`aee7afe9-6650-5fa4-a61a-495c3b88994b`) in the lifecycle handlers is pre-existing and moved verbatim — no semantic change.
