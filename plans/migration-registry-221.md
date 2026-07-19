# Plan: Migration Registry UI (srs-web#221)

## Summary

`srs-rust#461` added `available_migrations()` and `apply_migration(id)` as WASM binding methods on `SrsRepository`. The bindings are present in the latest release (`srs-bindings-web.tar.gz`). This plan surfaces them in the web UI as a new "Migrations" inspector section in `GovernanceShell.svelte`, following the established InspectorSection pattern (Validation, Repository). Users will be able to see the applicability status of all known migrations and apply needed ones without dropping to the CLI.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | main loop |
| Web App Worker | main loop |
| Architecture Reviewer (srs-web) | Stage 3 / Stage 7 review agents |
| Verification Agent (srs-web) | Stage 7 verification agent |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TS — `available_migrations` / `apply_migration` are WASM pass-throughs only; badge labels are derived from WASM-provided booleans, not TS logic | accepted |
| ADR-001 (prop pattern) | `MigrationsPanel` is a direct child of `GovernanceShell`; prop injection (`repo` as prop) is the standard pattern for first-level inspector children. ADR-013 (Svelte context) applies only to rendering-layer components dispatched through TYPE_REGISTRY — not here. | no new ADR needed |

No new ADR is required: the migrations panel follows the identical WASM pass-through pattern established by Validation (ADR-001) and does not introduce any new architectural constraint.

---

## Contracts

### WASM API surface

No new WASM methods required. Both methods are already in the latest `srs-bindings` release:

- `available_migrations()` → `MigrationSummary[]` — each object has `{ id: string, title: string, description: string, status: { needed: boolean, alreadyApplied: boolean, notApplicable: boolean } }`
- `apply_migration(id: string)` → `{ id: string, payload: object }` — throws on unknown id

### TypeScript types

Two new type exports in `src/lib/srs-client.ts`:
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
export interface MigrationResult {
  id: string;
  payload: Record<string, unknown>;
}
```

And two new wrapper functions in `srs-client.ts`:
```ts
export function availableMigrations(repo: SrsRepository): MigrationSummary[]
export function applyMigration(repo: SrsRepository, id: string): MigrationResult
```

Both follow the existing WASM wrapper pattern (biome-ignore + cast).

---

## Scope

**In scope:**

- Add `MigrationStatus`, `MigrationSummary`, `MigrationResult` type exports to `src/lib/srs-client.ts`
- Add `availableMigrations(repo)` and `applyMigration(repo, id)` wrapper functions to `src/lib/srs-client.ts`
- Add `SrsRepository` interface entries for `available_migrations()` and `apply_migration(id)` in `srs-client.ts`
- Create `src/lib/components/MigrationsPanel.svelte` — pure UI component; receives `repo` as prop
- Wire `MigrationsPanel` into `GovernanceShell.svelte` inspector `{#snippet}` as a new `<InspectorSection title="Migrations">`
- After a successful `apply_migration`, call `persistWorkingCopy()` in `GovernanceShell` and refresh the migration list
- Show clear status labels: "Needed", "Already applied", "Not applicable"
- Show the result payload (stringified JSON) after a successful apply
- Unit tests for `availableMigrations` / `applyMigration` wrappers in `src/lib/srs-client.test.ts` (if it exists, else a new test file)

**Out of scope:**

- Bulk "apply all" button (deferred — scope creep for a single feature)
- Offline/retry logic for WASM errors beyond displaying the error message
- Animation or progress spinner beyond a simple "Applying…" text state
- Auto-applying migrations on load (security/UX policy decision, not in this plan)
- Server-side migration tracking

---

## Phases

### Phase 1: WASM wrapper + types

**Goal:** `srs-client.ts` exposes typed `availableMigrations()` and `applyMigration()` wrappers with tests passing.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `available_migrations(): any` and `apply_migration(id: string): any` to the `SrsRepository` interface in `src/lib/srs-client.ts`
- [ ] Add `MigrationStatus`, `MigrationSummary`, `MigrationResult` interfaces to `src/lib/srs-client.ts`
- [ ] Implement `availableMigrations(repo: SrsRepository): MigrationSummary[]` — calls `repo.available_migrations()`, casts, returns array
- [ ] Implement `applyMigration(repo: SrsRepository, id: string): MigrationResult` — calls `repo.apply_migration(id)`, casts, returns result
- [ ] Add unit tests (mock the `repo` object):
  - `availableMigrations` returns typed array from WASM output
  - `applyMigration` passes `id` and returns typed result

#### Acceptance Criteria

- [ ] `npm run typecheck` passes with no new errors
- [ ] `npm run lint` passes
- [ ] Unit tests pass (`npm test`)

#### Milestone gate

1. All acceptance criteria above met.
2. Run `npm run typecheck && npm run lint && npm test`.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat(srs-client): add availableMigrations/applyMigration wrappers (#221)`.

---

### Phase 2: MigrationsPanel component

**Goal:** `MigrationsPanel.svelte` exists, lists migrations with status, and has a working Apply button.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/MigrationsPanel.svelte`:
  - Props: `repo: SrsRepository`, `onApplied: () => void` (callback after successful apply so GovernanceShell can re-render)
  - On mount: call `availableMigrations(repo)` in a `try/catch`; on success store result in local `$state migrations`; on error store error message in `$state initError` and display it in the panel (do not crash the shell)
  - Render each migration as a row: title, description, status badge ("Needed" / "Applied" / "N/A")
  - For "Needed" migrations: show an "Apply" button; the button must be `disabled` while `applying` is set (i.e., while another migration is in progress). **Do not** change the button label to "Applying…" — `apply_migration` is synchronous; Svelte 5 batches all synchronous `$state` mutations in one tick, so the intermediate label would never render.
  - On Apply click: set local `$state applying = id`, call `applyMigration(repo, id)` in a `try/catch`, on success show result payload in a `<pre>` block (JSON.stringify(result.payload, null, 2)), call `onApplied()`, refresh migration list (re-call `availableMigrations(repo)` in try/catch and update state), clear `applying`
  - On error from `apply_migration`: show error message in an `<p class="migration-panel__error">` element; clear `applying`
  - When the array from `availableMigrations()` is empty: render "No migrations registered."
  - When the list is non-empty but **zero** migrations have `status.needed === true`: render "Repository is up to date." message alongside the full list (the list always renders; the message appears as a summary below it)
- [ ] Style the panel using existing `.inspector__*` CSS classes. Only add new CSS if an existing class cannot accommodate the element (e.g., the result `<pre>` block). New CSS goes in a `<style>` block scoped to the component, not a global stylesheet.
- [ ] Add `data-testid` attributes: `migration-list`, `migration-item-{id}`, `migration-status-{id}`, `migration-apply-btn-{id}`, `migration-result-{id}`, `migration-error`

#### Acceptance Criteria

- [ ] Panel renders a list of migrations from `availableMigrations(repo)` output (on mount; one load per lifecycle)
- [ ] Error from `availableMigrations()` on mount is displayed in the panel; shell does not crash
- [ ] "Apply" button only appears for migrations with `status.needed === true`
- [ ] Apply button is `disabled` while any migration is being applied (`applying !== null`)
- [ ] Clicking Apply calls `applyMigration(repo, id)` and shows the result payload in a `<pre>` block
- [ ] After a successful apply, `availableMigrations(repo)` is re-called and the list updates
- [ ] `onApplied()` is called after a successful apply
- [ ] Error from `apply_migration` is displayed (not swallowed); `applying` is cleared on error
- [ ] When list is non-empty but zero migrations are `needed`, "Repository is up to date." message appears
- [ ] When list is empty, "No migrations registered." appears
- [ ] `npm run typecheck` passes
- [ ] Component test: mount `MigrationsPanel` with a mocked `repo` (vitest + `@testing-library/svelte`), assert migration list renders, assert Apply button calls `applyMigration`, assert `onApplied` fires on success, assert `initError` shown when `availableMigrations` throws

#### Milestone gate

1. All acceptance criteria above met.
2. Run `npm run typecheck && npm run lint && npm run build`.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: add MigrationsPanel component (#221)`.

---

### Phase 3: Wire into GovernanceShell

**Goal:** The Migrations inspector section appears in the GovernanceShell for all loaded repositories, and applying a migration triggers a working-copy persist.

**Agent:** Web App Worker

#### Tasks

- [ ] In `GovernanceShell.svelte`:
  - Import `MigrationsPanel` from `$lib/components/MigrationsPanel.svelte`
  - Inside `{#snippet inspector()}`, after `<InspectorSection title="Repository" …>`, add:
    ```svelte
    <InspectorSection title="Migrations">
      <MigrationsPanel
        {repo}
        onApplied={() => { persistWorkingCopy(); }}
      />
    </InspectorSection>
    ```
  - The `repo` prop is the reactive `$state` variable already in scope; `persistWorkingCopy()` is the existing function that calls `exportSrsj(repo)` and saves the working copy
- [ ] Verify that `onSave` (the optional prop for GitHub/Git persistence) does NOT need to be called here: migration is an in-place mutation; `persistWorkingCopy()` saves to browser cache; the user can trigger a full Git save separately via the existing Save button. This is intentional — migrations are low-level and should not force a remote push.

#### Acceptance Criteria

- [ ] "Migrations" InspectorSection appears in the right rail for a loaded repository
- [ ] Migration list loads when the inspector is visible
- [ ] Applying a migration calls `persistWorkingCopy()` (browser cache updated)
- [ ] No regression in existing inspector sections (Validation, Repository)
- [ ] `npm run typecheck && npm run lint && npm run build && npm test` all pass

#### Milestone gate

1. All acceptance criteria above met.
2. Run full gate: `npm run typecheck && npm run lint && npm run build && npm test`.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: wire MigrationsPanel into GovernanceShell inspector (#221)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] WASM loads; `availableMigrations(repo)` returns an array (possibly empty) without throwing
- [ ] "Migrations" section visible in GovernanceShell inspector rail
- [ ] Apply button fires `applyMigration` and shows result payload
- [ ] `persistWorkingCopy()` called after successful apply
- [ ] No regression in Validation and Repository inspector sections

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). `availableMigrations` / `applyMigration` are pure WASM pass-throughs.
- Lead Integrator reviews phase output before proceeding to next phase.
- `npm run typecheck` must pass after every change.

## Assumptions

- `apply_migration` mutates the `SrsRepository` WASM object in-place; `export_srsj()` on the same handle reflects the migrated state.
- The WASM binding throws a JS `Error` on unknown migration ID; no special error type check needed — display `e.message`.
- No migration currently ships that requires user interaction beyond a single click (i.e., no multi-step wizard needed in scope).
- `available_migrations()` returns a bare array (not an envelope), consistent with the WASM docstring.
- WASM build must be ≥ the release that resolved `srs-rust#461` (confirmed present in the latest `srs-bindings-web.tar.gz` as of plan writing). The Phase 1 wrapper test setup asserts `typeof repo.available_migrations === 'function'` to catch stale builds early.
- `persistWorkingCopy()` (browser-cache local save) is the correct post-migration save trigger — not `onSave` (remote Git push). This matches the established pattern for all other mutations in `GovernanceShell`: local cache is updated immediately; remote push is always user-initiated via the Save button.
