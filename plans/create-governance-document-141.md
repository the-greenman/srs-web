# Plan: "Create new governance document" onboarding flow (#141)

## Summary

srs-web can only open an existing `.srsj`; a clerk starting from nothing has no way to create a governance document (story muDemocracy.org#35, Must/P0). srs-rust has shipped the whole semantic path — the canonical seed (`srs-gov/assets/governance-seed.srsj`) and the `scaffold_new_repository` WASM binding, which stamps identity and creates the identity record, Decision Log container + root record, and root container in one call. This plan adds the presentation-only onboarding flow: bundle the seed, bridge the binding in `srs-client.ts`, add a create panel to the idle state, and save the new document to local download / Dropbox / Google Drive.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | main session |
| Web App Worker | main session |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | All scaffolding semantics stay in WASM (`scaffold_new_repository`); TS supplies only `{ title, namespace? }` and renders the result. Zero SRS semantics in the new UI. | accepted |
| [ADR-002](../docs/adr/002-editor-mode-selection.md) | The create flow lives inside the governance branch of the existing explicit mode selection; guides mode is untouched. | accepted |
| (no new ADR) | `StorageProvider` gains an optional `create?(name, content)` capability — an incremental extension of the existing provider interface, not a new constraint. | — |

**Seed distribution decision (revised after architecture review):** the canonical asset `srs-rust/crates/srs-gov/assets/governance-seed.srsj` is **pre-RFC-014-migration**; `srs-gov repo-create` runs `srsj_migration_service::migrate_rfc014` on it before scaffolding (`srs-gov/src/main.rs:624`), and the WASM `load()` does **not** migrate (`srs-bindings/src/lib.rs:57-60`). Bundling the raw bytes would ship documents whose manifest fails validation (missing `contentHash`). Therefore srs-web bundles the **RFC-014-migrated** bytes: generated once by running the canonical Rust `migrate_rfc014` over the canonical seed (scratch cargo invocation, procedure recorded in `seed/README.md`), committed as `governance-seed.migrated.srsj`. The migration is idempotent and deterministic, so the artifact is reproducible byte-for-byte. A follow-up srs-rust issue covers the durable fix: fold `migrate_rfc014` into `create_governance_repository` (idempotent, removes the caller-must-migrate foot-gun for every client) **and** ship the migrated seed inside `srs-bindings-web.tar.gz` so `npm run fetch-bindings`/predeploy keeps it current. When that lands, srs-web switches to the tarball copy and deletes the vendored one.

---

## Contracts

### WASM API surface

**No new or changed WASM methods required.** The plan consumes existing bindings:

- `SrsRepository.load(srsj)` (via existing `loadRepo`)
- `scaffold_new_repository(input_json)` — input `{ namespace?: string, title: string, purpose?: string, repositoryId?: string }` (serde camelCase); when `namespace` is omitted the service derives `com.example.<slug>` from the title. Returns `CreateGovernanceRepositoryResult` `{ repositoryId, identityRecordId, decisionLogContainerId, decisionLogRootId, rootContainerId }`.
- `export_srsj()` (via existing `exportSrsj`)

Note: the `scaffold_new_repository` doc comment says "call `to_srsj()`" — the actual JS method is `export_srsj()`; the doc drift is noted for the dogfood report, not fixed here.

### TypeScript types

New in `srs-client.ts`:

```ts
export interface CreateGovernanceDocumentResult {
  repo: SrsRepository;
  repositoryId: string;
  identityRecordId: string;
  decisionLogContainerId: string;
  decisionLogRootId: string;
  rootContainerId: string;
}
export function createGovernanceDocument(title: string, namespace?: string): CreateGovernanceDocumentResult;
```

Implementation: `loadRepo(GOVERNANCE_SEED_SRSJ)` → `repo.scaffold_new_repository(JSON.stringify({ title, ...(namespace && { namespace }) }))` → normalise snake/camel keys per the file's dual-lookup convention → return `{ repo, ...result }`.

New in `storage/types.ts`:

```ts
export interface StorageProvider {
  // ...existing...
  create?(name: string, content: string): Promise<DocumentHandle>;
}
```

---

## Scope

- Bundle the RFC-014-migrated seed at `src/lib/governance/seed/governance-seed.migrated.srsj` + a `seed/README.md` stating: canonical source (`srs-rust/crates/srs-gov/assets/governance-seed.srsj`), the transform applied (`srsj_migration_service::migrate_rfc014`, idempotent), the regeneration procedure (scratch cargo snippet), "do not hand-edit", and a link to the srs-rust follow-up issue that will move distribution into the bindings tarball.
- `createGovernanceDocument` bridge in `srs-client.ts` + unit test (mock `SrsRepository`, same pattern as `tests/srs-client.test.ts`; dual-lookup normalisation = try camelCase key, fall back to snake_case, exactly as `normalizeRecord` at `srs-client.ts:255` does).
- Shared `slugifyFilename(title: string): string` helper in `src/lib/slug.ts` — lowercase, trim, replace runs of non-alphanumerics with `-`, strip leading/trailing `-`, cap at 64 chars, fall back to `"untitled"` when empty. Refactor the two existing inline occurrences in `GuidesShell.svelte` (~lines 476, 494: `name.replace(/\s+/g, "-").toLowerCase()`) to use it — this is the third occurrence; extract rather than duplicate.
- `create()` on `DropboxProvider` and `GoogleDriveProvider`, each returning a writable `DocumentHandle`. Reuse each provider's existing fetch/auth/error conventions (`dropbox.ts` upload at `CONTENT/files/upload` with `Dropbox-API-Arg` header — same call shape as the existing `write()`, but `mode: "add"`, `autorename: true`, path `"/" + name`; take `id`/`name`/`rev` for the handle from the upload response. Google Drive: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,version` with a two-part `multipart/related` body — JSON metadata `{ name, mimeType: "application/json" }` + content — mirroring the existing update-upload in `google-drive.ts:133`; the returned `id` becomes the handle id).
- `CreateGovernanceDocumentPanel.svelte`: name field → three destination buttons (This device / Dropbox / Google Drive), mirroring `SourceChooser`'s layout, busy/error handling, and `data-testid` conventions.
- `App.svelte`: governance idle screen offers **Open** (existing `SourceChooser`) + **Create new**; on create → `createGovernanceDocument(name)` → `exportSrsj` → write to destination → transition to `loaded` (same state shape as the open flow; local = `activeDocument: null` + immediate `.srsj` download).
- e2e: new `e2e/create-document.spec.ts` — create → local download intercepted → assert srsj envelope → capture first decision → export → re-import → decision present, plus a mocked-provider cloud-save case via `window.__SRS_STORAGE_PROVIDERS__`.

**Out of scope:**

- Shipping the seed inside `srs-bindings-web.tar.gz` (follow-up srs-rust issue, filed in Stage 3).
- Purpose/description field on the create form (scaffold accepts `purpose`; form ships name-only, matching the issue).
- Autosave/persistence of the working copy (srs-web#139, story #41).
- Real-credential Dropbox/Drive e2e (cloud e2e uses injected fake providers, consistent with `cloud-storage.spec.ts`).

---

## Phases

### Phase 1: Seed asset + client bridge

**Goal:** `createGovernanceDocument("My Org")` returns a loaded, scaffolded repo in a unit-testable way.

**Agent:** Web App Worker

#### Tasks

- [x] Generate the RFC-014-migrated seed (scratch cargo project calling `srs_repository::srsj_migration_service::migrate_rfc014` over the canonical asset) → commit as `src/lib/governance/seed/governance-seed.migrated.srsj`.
- [x] `seed/README.md`: canonical source path, transform applied, exact regeneration procedure (the cargo snippet), "do not hand-edit", link to the srs-rust follow-up issue (migration folded into scaffold + seed shipped in bindings tarball).
- [x] `srs-client.ts`: import seed via `?raw`; add `CreateGovernanceDocumentResult` + `createGovernanceDocument(title, namespace?)` with dual-lookup normalisation (camelCase first, snake_case fallback — `normalizeRecord` convention, `srs-client.ts:255`).
- [x] Unit test: scaffold call receives `{"title":...}` JSON; result keys normalised from both camelCase and snake_case; namespace passed through when given; empty/whitespace title throws before hitting WASM.

#### Acceptance Criteria

- [x] `npm run typecheck` passes; new unit tests pass.
- [x] Bundled seed parses as JSON and has top-level `manifest.upstreamPackage.contentHash` (the migrated marker); regeneration procedure in README reproduces it byte-for-byte.

#### Testing

```bash
npm run typecheck && npm run lint && npm test
```

#### Milestone gate

1. Criteria met, commands green. 2. Tick checkboxes. 3. Commit `feat: bundle governance seed + createGovernanceDocument bridge (#141)`.

### Phase 2: Storage `create()` capability

**Goal:** Dropbox and Google Drive can create a brand-new `.srsj` and hand back a writable handle.

**Agent:** Web App Worker

#### Tasks

- [x] `storage/types.ts`: optional `create?(name, content)` on `StorageProvider`.
- [x] `DropboxProvider.create`: authenticate → `files/upload` `{ path: "/" + name, mode: "add", autorename: true }` → return `DropboxDocumentHandle` (write-capable, revision from response).
- [x] `GoogleDriveProvider.create`: authenticate → multipart create with `{ name }` metadata → return write-capable handle.
- [x] Unit tests with mocked `fetch` (same style as existing `tests/storage.test.ts`).

#### Acceptance Criteria

- [x] Created handles report `capabilities.write === true` and round-trip `write()`.
- [x] `npm run typecheck`, `npm test` pass.

#### Milestone gate

As Phase 1; commit `feat: storage provider create() for Dropbox and Google Drive (#141)`.

### Phase 3: Create panel + App wiring

**Goal:** From the governance idle screen a user creates a named document, saved to a chosen backend, and lands in the loaded editor.

**Agent:** Web App Worker

#### Tasks

- [ ] `src/lib/components/CreateGovernanceDocumentPanel.svelte`: name input (required, trimmed), three destination buttons; busy/error handling mirroring `SourceChooser`; `data-testid="create-panel"`, `create-name`, `create-local`, `create-dropbox`, `create-google-drive`; cloud buttons disabled when `!provider.configured` or `create` missing.
- [ ] `App.svelte`: governance idle screen gains the panel under the existing `SourceChooser` (Open vs Create sections); handler `createDocument(name, destination)` → bridge → `exportSrsj` → local: `downloadDocument(json, slugifyFilename(name) + ".srsj")` + `activeDocument = null`; cloud: `provider.create(slugifyFilename(name) + ".srsj", json)` → `activeDocument = handle`; set `repoName = name`, `appState = "loaded"`.
- [ ] `src/lib/slug.ts`: `slugifyFilename` per Scope; refactor the two `GuidesShell.svelte` inline occurrences to use it (presentation-only; namespace derivation stays in the core).
- [ ] **Error contract** (mirrors `SourceChooser.run()`): every failure path (scaffold throw, export throw, cloud `create()` rejection) is caught in the panel; `StorageError` with `code === "cancelled"` suppressed silently; any other error renders `.message` in a `<p role="alert">`; the app **stays in idle** and the scaffolded in-memory repo is discarded — no half-created state. Local download has no failure path (`downloadDocument` is fire-and-forget). Create buttons disabled while busy or when the trimmed name is empty; cloud buttons additionally disabled when `!provider.configured || !provider.create`.

#### Acceptance Criteria

- [ ] Create → editor shows the new document; Decision Log nav present (scaffold output).
- [ ] Local create triggers a `.srsj` download whose envelope has `srsj`, `manifest`, `data`.
- [ ] `npm run typecheck`, `npm run build` pass.

#### Milestone gate

As Phase 1; commit `feat: create-governance-document onboarding flow (#141)`.

### Phase 4: e2e round-trip

**Goal:** The issue's acceptance is executable in CI.

**Agent:** Web App Worker + Verification

#### Tasks

- [ ] `e2e/create-document.spec.ts`, three cases:
  - (a) **Local create + clean validation:** governance mode → fill `create-name` with "My Test Org" → click `create-local` → intercept the download (Playwright `download` event, same pattern as `export-import.spec.ts:39-47`) → assert filename `my-test-org.srsj`; parse content and assert `parsed.srsj === "1"`, `parsed.manifest.upstreamPackage.contentHash` is a non-empty string (proves the migrated seed), `parsed.manifest.title === "My Test Org"`; app is in loaded state (Decision Log nav link visible); **no validation diagnostics shown** (the Diagnostics component renders nothing / zero errors).
  - (b) **Create → first decision → export → re-import:** after (a)'s create, click "New Decision", fill Title "First Decision" (+ required fields), Save (the test creates the decision through the UI — the scaffold does NOT pre-create sample decisions); download via "Download .srsj"; re-import through the open flow (temp-file + `setInputFiles`, same as `export-import.spec.ts:119-137`); assert "First Decision" is visible in the Decision Log list.
  - (c) **Cloud create (fake provider):** inject fake providers via `page.addInitScript` **before** `page.goto` (exactly the `cloud-storage.spec.ts:12-40` pattern), where the fake exposes `create: async (name, content) => handle` — the fake records `(name, content)` into `window.__CREATE_CALLS__` and returns a `DocumentHandle` with `capabilities: { read: true, write: true }`, `revision: "revision-1"`, `write: async () => ({ revision: "revision-2" })`. Click `create-dropbox` → assert the fake received the slugged filename and content parsing to a valid srsj envelope, and the app transitioned to loaded.

#### Acceptance Criteria

- [ ] New spec passes locally alongside the full e2e suite (no regressions).

#### Milestone gate

As Phase 1; commit `test: e2e create → decide → export → reimport round-trip (#141)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npx playwright test` passes (full suite)
- [ ] Create → local `.srsj` → re-open via open flow → loads into governance editor, no diagnostics (issue acceptance 1)
- [ ] Cloud round-trip covered by mocked-provider e2e (issue acceptance 2, real-credential test out of scope)
- [ ] Create → first decision → export → re-import e2e (issue acceptance 3)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001): the only inputs TS constructs are `{ title, namespace? }`; everything else comes back from the scaffold binding.
- Seed bytes are canonical published artifact — never edited in this repo.

## Assumptions

- `scaffold_new_repository` is present in the currently released `srs-bindings-web.tar.gz` (verified: it is in `src/lib/srs_bindings/srs_bindings.d.ts`).
- The seed is RFC-014-migrated as the scaffold service requires (it is the same asset `srs-gov repo-create` uses).
- **Deferred (file as issues):** seed distribution via bindings tarball (srs-rust); purpose field on the create form (only if a story asks for it).
