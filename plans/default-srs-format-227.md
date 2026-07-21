# Plan: Make .srs the Default Working Format (#227)

> **Usage note:** The purpose of a plan file is to be reviewed and executed by agents. Write it with that reader in mind: unambiguous tasks, explicit file paths, named functions, checkable acceptance criteria. A plan that requires human interpretation at execution time is incomplete.
>
> Save this file to `plans/default-srs-format-227.md`.

## Summary

The `.srsj` JSON format was a lightweight working format for early development. The owner decision (2026-07-18) is that `.srs` (SRSzip — a ZIP archive) is now the default working format across the ecosystem. This plan flips srs-web so that new documents are created as `.srs`, saves always produce `.srs`, and `.srsj` is treated as a legacy import format with a gentle upgrade path. The WASM bindings `load_archive` / `export_archive` / `get_attachment_bytes` already exist (srs-rust#290, #291 closed); this is a pure TS/Svelte change.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Main session |
| Web App Worker | Main session |
| Verification | Spawned at milestone gates |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | All serialisation / deserialisation goes through WASM (`export_archive`, `load_archive`); TS never inspects archive bytes | accepted |
| [ADR-015](../docs/adr/015-binary-storage-interface.md) | `DocumentHandle` is extended with optional `readBytes()`/`writeBytes()` for binary content; existing string-based methods stay for legacy `.srsj` compat and git saves | **new — proposed** |

### ADR-015 decision (binary storage interface)

**Context:** The `DocumentHandle` interface has `read(): Promise<string>` and `write(content: string): Promise<WriteResult>`. `.srs` archives are binary (ZIP). Git handles (GitHub) stay `.srsj` (Epic 09 scope).

**Alternatives considered:**
1. Change `read`/`write` to `string | Uint8Array` — breaks existing callers and types; high blast radius.
2. Separate `BinaryDocumentHandle` type — clean but duplicates the whole interface and requires discriminated-union handling everywhere.
3. **Chosen:** Extend with optional `readBytes?(): Promise<Uint8Array>` and `writeBytes?(bytes, revision?): Promise<WriteResult>` on `DocumentHandle`. App layer checks capability at call site. Backward-compatible; all cloud providers implement both.

**Auto-upgrade path (`.srsj` → `.srs`):** when `saveDirect()` is called on a `.srsj`-named cloud handle, a new `.srs` file is created via `provider.create()`, `activeDocument` is replaced with the new handle, and a "Saved as .srs" message is shown. The old `.srsj` file remains in cloud storage (not deleted — provider permissions vary and deletion is separate scope).

---

## Contracts

### WASM API surface

No new WASM bindings required. Existing bindings consumed:
- `SrsRepositoryConstructor.load_archive(bytes: Uint8Array): SrsRepository` — wrapper: `loadRepoFromArchive(bytes)`
- `SrsRepository.export_archive(): Uint8Array` — wrapper: `exportArchive(repo)`
- `SrsRepository.get_attachment_bytes(documentId): Uint8Array` — wrapper: `getAttachmentBytes(repo, id)`

### TypeScript types

No new types from payload schemas. New optional methods added to `DocumentHandle` in `src/lib/storage/types.ts`. No srs-rust schema regeneration needed.

---

## Scope

**In scope:**
- Local device: create `.srs` by default; primary export is `.srs`
- Dropbox: list/open `.srs` files; write `.srs` on save; create `.srs` on new-doc
- Google Drive: same as Dropbox
- Auto-upgrade: opening a `.srsj` cloud document and saving produces a `.srs` file
- UI text: all idle-screen copy updated to reference `.srs`; export buttons reordered (`.srs` primary, `.srsj` secondary/legacy)
- Attachments survive round-trip (consequence of using `export_archive()`)

**Out of scope:**
- GitHub / git providers — explicitly deferred to Epic 09
- `confirmGitSave()` path — stays `.srsj`; no binary write to git
- Working copy (localStorage) — stays `.srsj` (autosave uses `export_srsj()`; `loadWorkingCopy` unchanged; binary localStorage is future work)
- Renaming / deleting old `.srsj` in cloud storage during upgrade
- Size warnings — separate concern (srs-web#100 handles those)

---

## Phases

### Phase 1: Storage layer — binary read/write support

**Goal:** `DocumentHandle`, `DropboxDocumentHandle`, and `GoogleDriveDocumentHandle` can read and write binary content; Dropbox and Drive file browsers surface `.srs` files.

**Agent:** Web App Worker

#### Tasks

- [ ] **`src/lib/storage/types.ts`** — extend `DocumentHandle` with two optional methods:
  ```typescript
  readBytes?(): Promise<Uint8Array>;
  writeBytes?(bytes: Uint8Array, expectedRevision?: string | null): Promise<WriteResult>;
  ```
  Also update `StorageProvider.create?()` signature:
  ```typescript
  create?(name: string, content: string | Uint8Array): Promise<DocumentHandle>;
  ```

- [ ] **`src/lib/storage/local.ts`** — add `readBytes()` to `LocalDocumentHandle`:
  ```typescript
  async readBytes(): Promise<Uint8Array> {
    const buf = await this.file.arrayBuffer();
    return new Uint8Array(buf);
  }
  ```
  Note: `LocalDocumentHandle.write()` throws (unsupported); `writeBytes()` is not needed here — local save is always a download.

- [ ] **`src/lib/storage/dropbox.ts`** — `DropboxDocumentHandle`:
  - Add `readBytes()`: same fetch as `read()` but return `response.arrayBuffer()` → `new Uint8Array(buffer)`
  - Add `writeBytes(bytes, expectedRevision?)`: same fetch as `write()` but `body: bytes` (a `Uint8Array` is a valid `fetch` body)
  - Update `DropboxProvider.list()` filter: `\.(srsj|json|srs)$/i`
  - Update `DropboxProvider.create(name, content)`: change `body: content` in the fetch call to support both `string` and `Uint8Array` (already valid — `fetch` body accepts both; just change the `content` type in the method signature and update the `Content-Type` header to `application/octet-stream` for binary calls, keep `application/json` for string calls)
    - Detect: `content instanceof Uint8Array ? 'application/octet-stream' : 'application/json'`

- [ ] **`src/lib/storage/google-drive.ts`** — `GoogleDriveDocumentHandle`:
  - Add `readBytes()`: same fetch as `read()` but return `response.arrayBuffer()` → `new Uint8Array(buffer)`
  - Add `writeBytes(bytes, expectedRevision?)`: same fetch as `write()` but `body: bytes` and `Content-Type: application/octet-stream`
  - `GoogleDriveProvider.select()`: update the filename filter from `/\.(srsj|json)$/i` to `/\.(srsj|json|srs)$/i`
  - `GoogleDriveProvider.create(name, content)`: update multipart body to support binary — when `content` is a `Uint8Array`, use `mimeType: 'application/octet-stream'` and include the bytes in the multipart body as `Content-Type: application/octet-stream` part
    - For binary: change metadata part `mimeType` to `application/octet-stream`; change content part `Content-Type` to `application/octet-stream`; use `content` directly as binary body part

- [ ] **`src/lib/components/SourceChooser.svelte`** — cloud browser entry:
  - In `chooseEntry()`: when `entry.kind === 'file'` and `entry.name.endsWith('.srs')`, after `provider.open(entry)` call `handle.readBytes()` and route to `onOpenArchive(bytes, entry.name)` instead of `onOpen(handle)`
  - In the browser entry display: change `{entry.kind === 'folder' ? 'Folder' : 'SRSJ'}` to `{entry.kind === 'folder' ? 'Folder' : entry.name.endsWith('.srs') ? 'SRS' : 'SRSJ'}`

#### Acceptance Criteria

- [ ] `DropboxDocumentHandle` has `readBytes()` and `writeBytes()` methods
- [ ] `GoogleDriveDocumentHandle` has `readBytes()` and `writeBytes()` methods
- [ ] `LocalDocumentHandle` has `readBytes()`
- [ ] Dropbox `list()` returns `.srs` files alongside `.srsj`
- [ ] Google Drive Picker accepts `.srs` files
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test -- storage
```

#### Milestone gate

1. All acceptance criteria met.
2. `npm run typecheck` and `npm run build` pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat(storage): binary read/write support for .srs in cloud handles (#227)`

---

### Phase 2: App routing — detect and load .srs from cloud handles

**Goal:** `loadDocument()` in App.svelte automatically routes `.srs` handles through `loadRepoFromArchive()`, so cloud `.srs` files open correctly.

**Agent:** Web App Worker

#### Tasks

- [ ] **`src/App.svelte`** — update `loadDocument(handle)`:
  ```typescript
  async function loadDocument(handle: DocumentHandle): Promise<void> {
    errorMsg = null;
    try {
      if (handle.name.toLowerCase().endsWith('.srs') && handle.readBytes) {
        const bytes = await handle.readBytes();
        repo = loadRepoFromArchive(bytes);
        repoName = handle.name.replace(/\.srs$/i, '');
      } else {
        const text = await handle.read();
        repo = loadRepo(text);
        repoName = handle.name.replace(/\.(srsj|json)$/i, '');
      }
      activeDocument = handle;
      cachedSession = null;
      saveMessage = null;
      appState = 'loaded';
    } catch (e: unknown) {
      repo = null;
      activeDocument = null;
      throw new Error(
        `Failed to load repository: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }
  ```

#### Acceptance Criteria

- [ ] Opening a `.srs` file from a cloud handle calls `loadRepoFromArchive()`, not `loadRepo()`
- [ ] Opening a `.srsj` file still calls `loadRepo()`
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run build
```

#### Milestone gate

1. `npm run typecheck` and `npm run build` pass.
2. Mark completed task checkboxes `[x]`.
3. Commit: `feat(app): route .srs cloud handles through loadRepoFromArchive (#227)`

---

### Phase 3: Default to .srs on create and save

**Goal:** New document creation produces a `.srs` archive; saving to cloud (Dropbox / Drive) writes binary archive; loading a `.srsj` cloud document and saving auto-upgrades to `.srs`.

**Agent:** Web App Worker

#### Tasks

- [ ] **`src/App.svelte`** — update `createDocument(name, destination)`:
  - Change to create `.srs` archive instead of `.srsj`
  - Use `exportArchive(newRepo)` for bytes and `${slugifyFilename(name)}.srs` as filename
  - For local: `downloadArchive(bytes, filename)` (already exists in `src/lib/storage/local.ts`)
  - For cloud: `provider.create(filename, bytes)` — binary content (Uint8Array)
  - The `repo = newRepo` and `appState = 'loaded'` assignments stay the same
  - Updated `createDocument`:
    ```typescript
    async function createDocument(name: string, destination: StorageProviderId): Promise<void> {
      const { repo: newRepo } = createGovernanceDocument(name);
      const bytes = exportArchive(newRepo);
      const filename = `${slugifyFilename(name)}.srs`;
    
      if (destination === 'local') {
        downloadArchive(bytes, filename);
        activeDocument = null;
      } else {
        const provider =
          destination === 'dropbox' ? storageProviders.dropbox
          : destination === 'google-drive' ? storageProviders.googleDrive
          : storageProviders.github;
        if (!provider?.create) {
          throw new Error(`${provider?.label ?? destination} cannot create new files.`);
        }
        activeDocument = await provider.create(filename, bytes);
      }
    
      repo = newRepo;
      repoName = name;
      cachedSession = null;
      saveMessage = null;
      appState = 'loaded';
    }
    ```

- [ ] **`src/App.svelte`** — update `saveDirect()`:
  - For cloud handles (Dropbox / Drive), always write `.srs` binary
  - When the active handle is `.srsj`-named, create a new `.srs` file (auto-upgrade)
  - Updated `saveDirect`:
    ```typescript
    async function saveDirect(): Promise<void> {
      if (!repo || !activeDocument?.capabilities.write) return;
      saving = true;
      saveMessage = null;
      try {
        const bytes = exportArchive(repo);
        const handle = activeDocument;
    
        if (handle.name.toLowerCase().endsWith('.srs') && handle.writeBytes) {
          // Normal .srs save: write in place
          await handle.writeBytes(bytes, handle.revision);
          saveMessage = 'Saved.';
          clearWorkingCopy();
        } else if (handle.writeBytes) {
          // Auto-upgrade from .srsj: create a new .srs file
          const newName = handle.name.replace(/\.(srsj|json)$/i, '') + '.srs';
          const provider =
            handle.provider === 'dropbox' ? storageProviders.dropbox
            : handle.provider === 'google-drive' ? storageProviders.googleDrive
            : null;
          if (provider?.create) {
            const newHandle = await provider.create(newName, bytes);
            activeDocument = newHandle;
            saveMessage = `Saved as ${newName}. The repository has been upgraded to .srs format.`;
          } else {
            // Fallback: write binary to existing handle (keeps .srsj name, content is archive)
            await handle.writeBytes(bytes, handle.revision);
            saveMessage = 'Saved (as .srs archive content).';
          }
          clearWorkingCopy();
        } else {
          // Legacy path: no binary write capability (should not occur for non-git handles)
          await handle.write(exportSrsj(repo), handle.revision);
          saveMessage = 'Saved.';
          clearWorkingCopy();
        }
      } catch (e: unknown) {
        saveMessage = saveErrorMessage(e);
      } finally {
        saving = false;
      }
    }
    ```

- [ ] **`src/App.svelte`** — `confirmGitSave()` stays unchanged (git providers use `.srsj`, per Epic 09 scope)

- [ ] **`src/App.svelte`** — update import list to include `exportArchive` and remove `exportSrsj` from the primary path (keep for legacy/secondary export)

#### Acceptance Criteria

- [ ] Creating a new document produces a `.srs` download / cloud file
- [ ] Saving a `.srs` cloud document writes binary in place
- [ ] Saving a `.srsj` cloud document creates a new `.srs` file and updates `activeDocument`
- [ ] `saveMessage` shows upgrade notice when applicable
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria met.
2. All build checks pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat(app): create and save as .srs by default, auto-upgrade .srsj (#227)`

---

### Phase 4: UI text, export button order, idle screen copy

**Goal:** Export buttons are reordered (`.srs` primary, `.srsj` secondary). Idle screen copy references `.srs`. Shell props are updated for the new semantic order.

**Agent:** Web App Worker

#### Tasks

- [ ] **`src/lib/governance/GovernanceShell.svelte`** — rename props and reorder buttons:
  - Rename `onExportArchive?: () => void` to `onExportSrsj?: () => void`
  - Keep `onExport: () => void` — now wired to `.srs` download in App.svelte
  - In the topbar snippet: swap button order — `.srs` first (uses `onExport`), `.srsj` second (uses `onExportSrsj`), always visible as a secondary/ghost button
  - Update button labels: `Download .srs` (primary), `Download .srsj` (secondary/ghost)
  - Change:
    ```svelte
    <button class="topbar__export" onclick={onExport}>Download .srsj</button>
    {#if onExportArchive}
      <button class="topbar__export" onclick={onExportArchive}>Download .srs</button>
    {/if}
    ```
    To:
    ```svelte
    <button class="topbar__export topbar__export--primary" onclick={onExport}>Download .srs</button>
    {#if onExportSrsj}
      <button class="topbar__export topbar__export--secondary" onclick={onExportSrsj}>Download .srsj</button>
    {/if}
    ```

- [ ] **`src/lib/guides/GuidesShell.svelte`** — same rename and reorder:
  - `onExportArchive?: () => void` → `onExportSrsj?: () => void`
  - `onExport` wired to `.srs`, `onExportSrsj` wired to legacy `.srsj`
  - Swap button order accordingly

- [ ] **`src/App.svelte`** — update handler wiring:
  - `handleExport()`: change to call `downloadArchive(exportArchive(repo!), ${repoName}.srs)` — now the primary export
  - `handleExportSrsj()` (rename from `handleExportArchive`): call `downloadDocument(exportSrsj(repo!), ${repoName}.srsj)` — now the legacy export
  - Update shell prop bindings:
    - `onExport={handleExport}` (`.srs` download — same prop name, new semantic)
    - `onExportSrsj={handleExportSrsj}` (replaces `onExportArchive`)

- [ ] **`src/App.svelte`** — idle screen copy:
  - Governance mode: change `<p>Open a <code>.srsj</code> repository file...</p>` to `<p>Open a <code>.srs</code> repository file to explore its governance records. <code>.srsj</code> files are also supported.</p>`
  - Guides mode: same pattern

- [ ] **`src/lib/components/SourceChooser.svelte`** — file input accept attribute and empty-state message:
  - `accept=".srsj,.json,.srs"` — already updated in srs-web#100 (verify it's present)
  - Cloud browser empty state text: `No .srs or .srsj files in this folder.`

#### Acceptance Criteria

- [ ] GovernanceShell shows "Download .srs" as the first / primary export button
- [ ] GovernanceShell shows "Download .srsj" as a secondary button (still present)
- [ ] GuidesShell export buttons follow same order
- [ ] Idle screen copy mentions `.srs` as the primary format
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria met.
2. All build checks pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat(ui): .srs as primary format in export UI and idle copy (#227)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] WASM loads and `loadArchiveDocument()` succeeds against `gallery.srs` (if present in fixtures) or any `.srs` archive
- [ ] New governance document → downloads as `.srs` (local) or creates `.srs` in cloud
- [ ] Opening `.srsj` from file picker → loads correctly
- [ ] Opening `.srsj` from cloud → save produces `.srs` (auto-upgrade message shown)
- [ ] Opening `.srs` from file picker → loads correctly
- [ ] "Download .srs" is the first export button in GovernanceShell
- [ ] "Download .srsj" is the second export button in GovernanceShell
- [ ] `npm test` passes (unit + component tests)
- [ ] `npm run e2e` — export-import.spec.ts and load-repo.spec.ts pass

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). Format detection is based purely on file extension and WASM API calls.
- Git handles (`confirmGitSave`) stay on `.srsj` — not in scope.
- Working copy autosave stays on `.srsj` — binary localStorage is future work.

## Assumptions

- The WASM `export_archive()` and `load_archive()` bindings in the deployed `.srs_bindings` package are functional (srs-rust#290 closed).
- Dropbox and Google Drive `write()` / `create()` accept `Uint8Array` as body without additional encoding (standard `fetch` body types support this).
- The existing `e2e/fixtures/gallery.srsj` fixture is sufficient; no `.srs` fixture is required for existing e2e tests (the new cloud-binary path is covered by unit tests).
