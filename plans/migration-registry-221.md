# Plan: Expose Migration Registry in Web UI (srs-web#221)

> **Issue:** [srs-web#221](https://github.com/the-greenman/srs-web/issues/221)
> **Companion:** srs-rust#461 (closed — WASM bindings shipped in latest release)

## Summary

srs-rust#461 added `available_migrations()` and `apply_migration(id)` as methods on the `SrsRepository` WASM class. This plan exposes them in the governance editor: a "Migrations" section under a new "Repository" NavGroup in `GovernanceShell`, showing each migration's applicability status and providing an Apply button. Administrators can now upgrade their repository from the web UI without dropping to the CLI.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Web App Worker | `agents.md#web-app-worker` |
| Verification | `agents.md#verification-agent-srs-web` |
| Architecture Reviewer | `agents.md#architecture-reviewer-srs-web` |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | All migration semantics delegated to WASM — srs-web only renders and routes calls | accepted |
| [ADR-009](../docs/adr/009-container-driven-nav.md) | Container nav unchanged; migrations appear in a new peer "Repository" NavGroup | accepted |
| [ADR-013](../docs/adr/013-repository-tool-sections.md) | A "Repository" NavGroup for non-container repo-level tools is the approved pattern | accepted |

---

## Contracts

### WASM API surface

**No new WASM bindings required.** srs-rust#461 already shipped `available_migrations()` and `apply_migration(id)` in the latest release artifact. `scripts/ensure-bindings.mjs` downloads this at build time.

Return shapes (from WASM JSDoc):

```
available_migrations() → Array<{
  id: string,
  title: string,
  description: string,
  status: {
    needed: boolean,        // exactly one is true
    alreadyApplied: boolean,
    notApplicable: boolean
  }
}>

apply_migration(id: string) → { id: string, payload: object }
```

Both throw on error (the WASM wrapper checks `ret[2]` and re-throws).

### TypeScript types

Added to `src/lib/srs-client.ts`:

```ts
export interface MigrationStatus {
  needed: boolean;
  alreadyApplied: boolean;
  notApplicable: boolean;
}

export interface MigrationSummary {
  id: string;
  title: string;
  description: string;
  status: MigrationStatus;
}

export interface MigrationApplyResult {
  id: string;
  payload: unknown;
}
```

And on `SrsRepository` interface:
```ts
// biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in availableMigrations()
available_migrations(): any;
// biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in applyMigration()
apply_migration(id: string): any;
```

And wrapper functions:
```ts
export function availableMigrations(repo: SrsRepository): MigrationSummary[]
export function applyMigration(repo: SrsRepository, id: string): MigrationApplyResult
```

---

## Scope

- `src/lib/srs-client.ts` — add `MigrationStatus`, `MigrationSummary`, `MigrationApplyResult` types, extend `SrsRepository` interface, add `availableMigrations()` and `applyMigration()` wrapper functions.
- `src/lib/components/Migrations.svelte` — new component rendering migration list + Apply buttons + result panel.
- `src/lib/governance/GovernanceShell.svelte` — add `activeView` state, new "Repository" NavGroup with a "Migrations" NavItem, conditional render of `<Migrations>` when `activeView === "migrations"`, and `onMigrationApplied` refresh callback.
- `docs/adr/013-repository-tool-sections.md` — new ADR.
- `tests/srs-client.test.ts` — new unit tests for `availableMigrations()` and `applyMigration()`.
- `tests/Migrations.test.ts` — new component-level tests for `Migrations.svelte` (6 tests covering loading, status badges, disabled states, apply success, apply error).
- `tests/GovernanceShell.test.ts` — smoke test for Migrations nav item visibility.

**Out of scope:**

- Mutations to the `apply_migration` WASM binding or srs-rust (already shipped).
- A dedicated e2e spec for migrations (no live WASM fixture with a migration-needed repo; the flow is covered by the unit test and component-level test).
- Styling beyond the existing CSS variable system and `.nav*`/`.diag*` class patterns.
- Exposing migrations in the Guides editor (governance-specific operation).

---

## Phases

### Phase 1: WASM facade in srs-client.ts

**Goal:** Typed wrappers for `availableMigrations()` and `applyMigration()` added to `srs-client.ts`; unit tests pass.

**Agent:** Web App Worker

#### Tasks

- [x] In `src/lib/srs-client.ts`, add to the `SrsRepository` interface:
  ```ts
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in availableMigrations()
  available_migrations(): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in applyMigration()
  apply_migration(id: string): any;
  ```
  Place these after the existing `scaffold_new_repository` line.

- [x] Add the three new exported interfaces (`MigrationStatus`, `MigrationSummary`, `MigrationApplyResult`) in `srs-client.ts` after the `TransitionRecordResult` interface.

- [x] Add two exported wrapper functions near the bottom of `srs-client.ts`:
  ```ts
  export function availableMigrations(repo: SrsRepository): MigrationSummary[] {
    return repo.available_migrations() as MigrationSummary[];
  }

  export function applyMigration(repo: SrsRepository, id: string): MigrationApplyResult {
    return repo.apply_migration(id) as MigrationApplyResult;
  }
  ```

- [x] In `tests/srs-client.test.ts`:
  - Import `availableMigrations`, `applyMigration`, `MigrationSummary`, `MigrationApplyResult` from `srs-client.js`.
  - Add `available_migrations` and `apply_migration` stubs to the `mockRepo` base.
  - Add test `availableMigrations_calls_wasm_and_returns_typed_array`:
    - Mock `available_migrations` to return a sample array of two `MigrationSummary` objects.
    - Call `availableMigrations(repo)`.
    - Assert the result is the same array.
  - Add test `applyMigration_calls_wasm_with_id_and_returns_result`:
    - Mock `apply_migration` to return `{ id: "migrate-identity", payload: { message: "done" } }`.
    - Call `applyMigration(repo, "migrate-identity")`.
    - Assert result equals the mock value.

#### Acceptance Criteria

- [x] `SrsRepository` interface has `available_migrations()` and `apply_migration(id)` stubs.
- [x] `availableMigrations()` and `applyMigration()` are exported from `srs-client.ts`.
- [x] Both new unit tests pass.
- [x] No existing tests broken.

#### Milestone gate

1. `npm run typecheck` — zero errors.
2. `npm run lint` — zero errors.
3. `npm run build` — succeeds.
4. `npm test` — all tests pass including the two new ones.
5. Mark checkboxes `[x]`.
6. Commit: `feat(migrations): WASM facade in srs-client (#221)`.

---

### Phase 2: Migrations.svelte component

**Goal:** `Migrations.svelte` renders migration list, status badges, Apply buttons, and result feedback.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/Migrations.svelte`:

  **Props:**
  ```ts
  let {
    repo,
    onMigrationApplied,
  }: {
    repo: SrsRepository;
    onMigrationApplied: () => void;
  } = $props();
  ```

  **State:**
  - `migrations = $state<MigrationSummary[]>([])` — loaded on mount.
  - `loading = $state(true)` — shows "Loading migrations…" during WASM call.
  - `loadError = $state<string | null>(null)` — shown if `availableMigrations` throws.
  - `applying = $state<string | null>(null)` — the id of the migration currently being applied.
  - `applyResults = $state<Map<string, { ok: true; result: MigrationApplyResult } | { ok: false; error: string }>>( new Map())`.

  **onMount:** wrap `availableMigrations(repo)` in try/catch. On success, store result in `migrations`. On error, set `loadError` to `e instanceof Error ? e.message : String(e)`. Always set `loading = false` in a `finally` block.

  **handleApply(id: string):** set `applying = id`, call `applyMigration(repo, id)`, store success result in `applyResults`, call `onMigrationApplied()`, reload migrations via `availableMigrations(repo)`. On error, store error in `applyResults`. Clear `applying`.

  **Render structure:**
  ```html
  <div class="migrations">
    <h2 class="migrations__heading">Migrations</h2>
    {#if loading}
      <p class="migrations__loading">Loading migrations…</p>
    {:else if loadError}
      <p class="migrations__error" role="alert">{loadError}</p>
    {:else if migrations.length === 0}
      <p class="migrations__empty">No migrations available.</p>
    {:else}
      {#each migrations as m (m.id)}
        <div class="migration-row">
          <div class="migration-row__info">
            <span class="migration-row__title">{m.title}</span>
            <span class="migration-row__desc">{m.description}</span>
          </div>
          <div class="migration-row__status">
            {#if m.status.needed}
              <span class="migration-badge migration-badge--needed">Needed</span>
            {:else if m.status.alreadyApplied}
              <span class="migration-badge migration-badge--applied">Applied</span>
            {:else}
              <span class="migration-badge migration-badge--na">N/A</span>
            {/if}
          </div>
          <div class="migration-row__actions">
            <button
              class="migration-row__apply"
              disabled={!m.status.needed || applying !== null}
              onclick={() => handleApply(m.id)}
            >{applying === m.id ? 'Applying…' : 'Apply'}</button>
          </div>
          {#if applyResults.has(m.id)}
            {@const r = applyResults.get(m.id)!}
            {#if r.ok}
              <div class="migration-result migration-result--ok" role="status">
                Applied. <pre class="migration-result__payload">{JSON.stringify(r.result.payload, null, 2)}</pre>
              </div>
            {:else}
              <p class="migration-result migration-result--error" role="alert">Error: {r.error}</p>
            {/if}
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  ```

  **Styles:** scoped `<style>` block using CSS custom properties (`--color-border`, `--color-muted`, `--color-surface-1`). No hardcoded colours. Badge variants: `--needed` uses `--color-warn` or falls back to `#c8a000`; `--applied` uses `--color-success` or `#2a7a2a`; `--na` uses `--color-muted`.

- [ ] Export `Migrations` from `src/lib/components/index.ts` barrel. Add the following line under the `# Status / actions / validation` section:
  ```ts
  export { default as Migrations } from "./Migrations.svelte";
  ```

#### Acceptance Criteria

- [ ] Component renders "Loading migrations…" on mount before WASM call returns.
- [ ] Component renders migration list with correct status badges once loaded.
- [ ] Apply button is disabled when `status.alreadyApplied` or `status.notApplicable`.
- [ ] Apply button is disabled for all rows while any migration is applying.
- [ ] On successful apply, result payload is shown and migration list is refreshed.
- [ ] On error apply, error message is shown inline.
- [ ] `npm run typecheck` passes.

- [ ] Create `tests/Migrations.test.ts` with the following tests (using the `@testing-library/svelte` + `vitest` pattern from `tests/GovernanceShell.test.ts`):
  - `renders loading state before WASM call resolves` — mock `available_migrations` to never return; assert "Loading migrations…" is in the document.
  - `renders migration list with status badges after load` — mock `available_migrations` returning `[{ id: "m1", title: "Migrate Identity", description: "Desc", status: { needed: true, alreadyApplied: false, notApplicable: false } }]`; assert `screen.getByText("Migrate Identity")` and `screen.getByText("Needed")` are present.
  - `Apply button disabled when status is alreadyApplied` — mock a migration with `{ needed: false, alreadyApplied: true, notApplicable: false }`; assert the Apply button has `disabled` attribute.
  - `Apply button disabled when status is notApplicable` — mock a migration with `{ needed: false, alreadyApplied: false, notApplicable: true }`; assert the Apply button has `disabled` attribute.
  - `shows success result and calls onMigrationApplied after apply` — mock `available_migrations` (returns one needed migration) and `apply_migration` (returns `{ id: "m1", payload: { message: "ok" } }`); click Apply; assert result payload visible and `onMigrationApplied` was called.
  - `shows error message when apply throws` — mock `apply_migration` to throw `new Error("apply failed")`; click Apply; assert `screen.getByRole("alert")` contains "apply failed".

#### Milestone gate

1. `npm run typecheck` — zero errors.
2. `npm run lint` — zero errors.
3. `npm run build` — succeeds.
4. `npm test` — all tests pass including the six new Migrations.test.ts tests.
5. Mark checkboxes `[x]`.
6. Commit: `feat(migrations): Migrations.svelte component + tests (#221)`.

---

### Phase 3: Wire into GovernanceShell

**Goal:** "Repository → Migrations" nav item appears in GovernanceShell and clicking it renders `<Migrations>` in the main area.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/governance/GovernanceShell.svelte`, add state:
  ```ts
  type ActiveView = "governance" | "migrations";
  let activeView = $state<ActiveView>("governance");
  ```

- [ ] Import `Migrations` from `$lib/components/Migrations.svelte`.

- [ ] In the nav `{#snippet nav()}` block, add a second `<NavGroup>` below the closing `</NavGroup>` of "Governance":
  ```svelte
  <NavGroup label="Repository">
    {#snippet children()}
      <div
        onclick={() => {
          activeView = "migrations";
          activeContainerId = null;
          selectedId = null;
          formMode = null;
          editingRecord = null;
          formError = null;
          showLinkPicker = false;
        }}
      >
        <NavItem
          label="Migrations"
          id="migrations"
          active={activeView === "migrations"}
          href="#"
        />
      </div>
    {/snippet}
  </NavGroup>
  ```

- [ ] Ensure clicking any container in the Governance NavGroup also sets `activeView = "governance"`. Locate the existing `onclick` handler on the container `<div>` and add `activeView = "governance";` alongside `activeContainerId = container.containerId`.

- [ ] In the `{#snippet main()}` block, wrap the existing main content in `{#if activeView === "governance"}` and add `{:else if activeView === "migrations"}` rendering `<Migrations>`:
  ```svelte
  {#if activeView === "governance"}
    <!-- ... existing main content ... -->
  {:else if activeView === "migrations"}
    <Main>
      <Topbar>
        {#snippet crumb()}
          <Breadcrumb items={[{ label: repoName }, { label: "Migrations" }]} />
        {/snippet}
      </Topbar>
      <Migrations
        repo={repo}
        onMigrationApplied={() => {
          loadContainerNav();
          refreshValidation();
        }}
      />
    </Main>
  {/if}
  ```

- [ ] In `tests/GovernanceShell.test.ts`:
  - Add `available_migrations: () => []` and `apply_migration: () => { throw new Error("not mocked"); }` stubs to the `mockRepo` base object (lines 7–42 of the existing file).
  - Add a new `describe("GovernanceShell — Repository nav group")` block with test:
    ```ts
    it("renders Migrations NavItem in the Repository nav group", async () => {
      const repo = makeBaseRepo();
      render(GovernanceShell, {
        props: { repo, repoName: "test.srsj", documentProvider: "local", onExport: vi.fn(), onOpenAnother: vi.fn() },
      });
      const item = await screen.findByRole("link", { name: /Migrations/i });
      expect(item).toBeDefined();
    });
    ```
  - Use the same `makeBaseRepo()` helper established at line 44 — no new mock infrastructure needed.

#### Acceptance Criteria

- [ ] A "Repository" NavGroup appears below "Governance" in the nav with a "Migrations" item.
- [ ] Clicking "Migrations" shows the migration panel and hides the record view.
- [ ] Clicking a container item switches back to the governance record view.
- [ ] The breadcrumb shows "Migrations" when the migration panel is active.
- [ ] `onMigrationApplied` triggers `loadContainerNav()` and `refreshValidation()`.
- [ ] No regression in the existing governance record view.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.

#### Milestone gate

1. `npm run typecheck` — zero errors.
2. `npm run lint` — zero errors.
3. `npm run build` — succeeds.
4. `npm test` — all tests pass including the new GovernanceShell test.
5. Mark checkboxes `[x]`.
6. Commit: `feat(migrations): wire Migrations panel into GovernanceShell (#221)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes — all unit + component tests green
- [ ] `availableMigrations()` and `applyMigration()` are exported from `srs-client.ts`
- [ ] Migrations panel visible in governance nav under "Repository"
- [ ] Apply button disabled for `alreadyApplied` / `notApplicable` migrations
- [ ] On apply success, result payload is shown and list refreshes
- [ ] On apply error, inline error shown
- [ ] No regression in existing governance view, container nav, or record forms

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). Wrappers in srs-client.ts are thin facades — no interpretation of migration IDs or payloads.
- Phases are strictly ordered: Phase 1 complete before Phase 2 begins; Phase 2 before Phase 3.
- At each milestone gate: verify acceptance criteria, confirm tests pass, commit.

## Assumptions

- `available_migrations()` on any loaded repo is safe to call (even repos with no migrations applicable).
- The WASM `apply_migration` mutates the in-memory `SrsRepository` object in place; a full `loadRepo()` reload is not needed — calling `loadContainerNav()` and `loadAndValidate()` after apply is sufficient to refresh shell state.
- The `refreshValidation()` function exists in GovernanceShell at line 450 (`function refreshValidation(): void`), called in `onMount` at line 489. It calls `repo.validate()` and updates `instanceCount` and `diagnostics` state — safe to call after an in-place WASM mutation. Call both `loadContainerNav()` and `refreshValidation()` in the `onMigrationApplied` callback.
- Badge colours respect the existing `--color-*` CSS custom-property system.
- The `NavItem` component accepts an `id` prop that is used as a CSS key / icon slot; "migrations" will render without an icon (no existing icon mapping) — this is acceptable for Release 1.
