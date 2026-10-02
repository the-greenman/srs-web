<!--
  App.svelte — Application shell.

  Owns: WASM initialisation, repo loading, top-level app state, editor mode selection.
  Delegates: the active editor to its registered shell ($lib/editors/registry).

  States: boot → idle → loaded | error
    boot:   WASM initialising
    idle:   WASM ready, no repo loaded — show mode picker then file picker
    loaded: repo loaded — show the generic shell or a registered editor shell
    error:  unrecoverable error

  B4 read-only governance viewer: https://github.com/the-greenman/srs-web/issues/3
  B9 edit forms:                  https://github.com/the-greenman/srs-web/issues/5
  B11 lifecycle & supersession:   https://github.com/the-greenman/srs-web/issues/7
-->
<script lang="ts">
  import {
    initWasm,
    loadRepo,
    loadRepoFromArchive,
    loadRepoFromTree,
    exportSrsj,
    exportArchive,
    exportTree,
    createGovernanceDocument,
    rfc043MigrationNeeded,
    applyMigration,
    RFC043_MIGRATION_ID,
  } from "$lib/srs-client.js";
  import type { SrsRepository } from "$lib/srs-client.js";
  import { loadWorkingCopy, clearWorkingCopy, saveWorkingCopy } from "$lib/browser-cache.js";
  import type { WorkingCopyEntry } from "$lib/browser-cache.js";
  import { DocumentMutationTracker } from "$lib/document-mutations.js";

  import { EDITORS, getEditor } from "$lib/editors/registry.js";
  import GenericSrsShell from "$lib/generic/GenericSrsShell.svelte";
  import SourceChooser from "$lib/components/SourceChooser.svelte";
  import CreateGovernanceDocumentPanel from "$lib/components/CreateGovernanceDocumentPanel.svelte";
  import GitSaveModal from "$lib/components/GitSaveModal.svelte";
  import McpConnection from "$lib/components/McpConnection.svelte";
  import { RelayHost, type HostState } from "$lib/mcp/relay-host.js";
  import { untrack } from "svelte";
  import { slugifyFilename } from "$lib/slug.js";
  import {
    createStorageProvidersFromEnv,
    downloadDocument,
    downloadArchive,
    isGitBranchAware,
    stripSrsExtension,
    toArchiveName,
    StorageError,
    type DocumentHandle,
    type RepoTreeAware,
    type StorageProviderId,
  } from "$lib/storage/index.js";

  // Link to install/manage the GitHub App (a GitHub App must be installed to write).
  const githubAppSlug = import.meta.env.VITE_GITHUB_APP_SLUG ?? "";
  const githubInstallUrl = githubAppSlug
    ? `https://github.com/apps/${githubAppSlug}/installations/new`
    : null;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  type AppState = "boot" | "idle" | "migrate" | "loaded" | "error";
  /** "generic" or an EditorDefinition id from $lib/editors/registry. */
  type EditorMode = string;

  let appState = $state<AppState>("boot");
  let errorMsg = $state<string | null>(null);
  let editorMode = $state<EditorMode>("generic");

  let repoName = $state<string>("Untitled repository");
  const storageProviders = createStorageProvidersFromEnv();
  let activeDocument = $state<DocumentHandle | null>(null);

  /** Document-level Save (write-capable cloud/git handles only). */
  let saving = $state(false);
  let saveMessage = $state<string | null>(null);
  /** Git Save dialog (branch choice + install hint) state. */
  let gitSaveOpen = $state(false);
  let gitSaveError = $state<string | null>(null);

  let repo = $state<SrsRepository | null>(null);

  /**
   * One in-place WASM repository can be mutated by more than one UI/executor.
   * This tracker is the sole authority for whether an exported save snapshot is
   * still current when an asynchronous provider write completes.
   */
  const documentMutations = new DocumentMutationTracker();
  let documentDirty = $state(false);
  /** Reactive invalidation signal for UI projections of the in-place repository. */
  let documentRevision = $state(0);

  /**
   * Catalog diagnostics from the load-time `validate()` pass (RFC-038 [R24]).
   * Under tree-authoritative storage a malformed or duplicate object is a
   * diagnostic, not a silent omission — the repository still opens, so the
   * only way the user learns an object was rejected is if we show it.
   */
  let catalogDiagnostics = $state<{ severity: string; message: string }[]>([]);
  let catalogDiagnosticsOpen = $state(true);

  /** Cached working copy loaded from localStorage on WASM init. */
  let cachedSession = $state<WorkingCopyEntry | null>(null);
  let restoreError = $state<string | null>(null);

  /**
   * RFC-043 revision gate (srs-web#334). A rev-7 repository loads but the rev-8
   * engine refuses every read until `rfc043-container-entries` is applied, so the
   * load is held here and the user is asked — never opened empty. `finish(dirty)`
   * is the load path's own completion step; it runs after migrate (dirty=true,
   * the migrated working copy is unsaved until Save) or immediately when no
   * migration is needed.
   */
  let pendingMigration = $state<{ repo: SrsRepository; name: string; finish: (dirty: boolean) => void } | null>(null);
  let migrationError = $state<string | null>(null);

  function gateOnMigration(loaded: SrsRepository, name: string, finish: (dirty: boolean) => void): void {
    if (rfc043MigrationNeeded(loaded)) {
      pendingMigration = { repo: loaded, name, finish };
      repo = null; // not opened (no MCP session etc.) until migrated
      migrationError = null;
      appState = "migrate";
    } else {
      finish(false);
    }
  }

  function runPendingMigration(): void {
    const pending = pendingMigration;
    if (!pending) return;
    try {
      applyMigration(pending.repo, RFC043_MIGRATION_ID);
    } catch (e: unknown) {
      // All-or-nothing in the engine: nothing was written. Keep the prompt up.
      migrationError = `Migration failed: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    pendingMigration = null;
    pending.finish(true);
  }

  function cancelPendingMigration(): void {
    pendingMigration = null;
    repo = null;
    activeDocument = null;
    appState = "idle";
  }

  function beginDocument({ dirty = false }: { dirty?: boolean } = {}): void {
    const revision = documentMutations.beginDocument({ dirty });
    documentDirty = documentMutations.dirty;
    documentRevision = revision.revision;
  }

  /**
   * Shared mutation entry point for every writer of the active WASM repository.
   * MCP hosting will call the same function after a successful external write.
   *
   * Returns whether the local recovery-copy write succeeded, so callers (e.g.
   * GovernanceShell's save indicator) can reflect a failed `localStorage` write
   * instead of silently claiming "saved" (srs-web#312).
   */
  function handleDocumentMutation(): boolean {
    if (!repo) return false;
    const revision = documentMutations.recordMutation();
    documentDirty = documentMutations.dirty;
    documentRevision = revision.revision;
    return saveWorkingCopy(repoName, exportSrsj(repo));
  }

  function completeDocumentSave(snapshot: ReturnType<typeof documentMutations.captureSave>): boolean {
    const savedCurrentRevision = documentMutations.completeSave(snapshot);
    documentDirty = documentMutations.dirty;
    if (savedCurrentRevision) clearWorkingCopy();
    return savedCurrentRevision;
  }

  // ---------------------------------------------------------------------------
  // MCP relay (srs-web#307). Enabled only when a relay origin is configured.
  // The Rust/WASM McpSession owns all MCP semantics; this only hosts it. MCP
  // writes mark the document unsaved via handleDocumentMutation and never call
  // a storage provider — persistence stays an explicit Save/Export.
  // ---------------------------------------------------------------------------

  // `localStorage["srs-web.mcp-relay-url"]` is a runtime override for dev/e2e.
  const relayUrl =
    import.meta.env.VITE_MCP_RELAY_URL ||
    (() => {
      try {
        return localStorage.getItem("srs-web.mcp-relay-url") ?? "";
      } catch {
        return "";
      }
    })();
  let mcpState = $state<HostState>({ status: "idle", callerUrl: null, error: null });
  const mcpHost = relayUrl
    ? new RelayHost({
        relayUrl,
        onMutated: () => void handleDocumentMutation(),
        onChange: (s) => (mcpState = s),
      })
    : null;

  $effect(() => {
    const current = repo;
    if (!mcpHost) return;
    untrack(() => {
      if (current) void mcpHost.attach(current.open_mcp_session());
      else mcpHost.detach();
    });
  });

  // ---------------------------------------------------------------------------
  // WASM initialisation
  // ---------------------------------------------------------------------------

  $effect(() => {
    initWasm()
      .then(() => {
        const cached = loadWorkingCopy();
        if (cached !== null) {
          cachedSession = cached;
          editorMode = "generic";
        }
        appState = "idle";
      })
      .catch((e: unknown) => {
        errorMsg = `Failed to load WASM engine: ${e instanceof Error ? e.message : String(e)}`;
        appState = "error";
      });
  });

  // ---------------------------------------------------------------------------
  // Document loading
  // ---------------------------------------------------------------------------

  async function loadDocument(handle: DocumentHandle): Promise<void> {
    errorMsg = null;
    try {
      switch (handle.kind) {
        case "bytes": {
          if (!handle.readBytes) throw new Error("This storage provider does not support binary archive reads.");
          const bytes = await handle.readBytes();
          repo = loadRepoFromArchive(bytes);
          break;
        }
        case "tree": {
          const files = await (handle as DocumentHandle & RepoTreeAware).readTree();
          repo = loadRepoFromTree(files);
          break;
        }
        default: {
          const text = await handle.read();
          repo = loadRepo(text);
        }
      }
      const loaded = repo;
      gateOnMigration(loaded, handle.name, (dirty) => {
        repo = loaded;
        activeDocument = handle;
        beginDocument({ dirty });
        repoName = stripSrsExtension(handle.name);
        cachedSession = null;
        saveMessage = dirty ? "Migrated to the current data model. Unsaved - Save to keep it." : null;
        if (dirty) saveWorkingCopy(repoName, exportSrsj(loaded));
        catalogDiagnostics = collectCatalogDiagnostics(loaded);
        catalogDiagnosticsOpen = true;
        appState = "loaded";
      });
    } catch (e: unknown) {
      repo = null;
      activeDocument = null;
      throw new Error(
        `Failed to load repository: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }

  /**
   * Run the core's validation pass and keep the entries that mean "an object
   * in the tree was not catalogued as-authored". Presentation only — the core
   * decides what is a diagnostic; we only decide that the user sees it.
   */
  function collectCatalogDiagnostics(r: SrsRepository): { severity: string; message: string }[] {
    try {
      const report = r.validate();
      // Errors only: these are the objects the catalog refused ([R8]/[R13]
      // shape and resolution failures). Warnings are advisory about content
      // that did load, and belong to the per-record Diagnostics panel.
      return (report?.diagnostics ?? []).filter((d) => d.severity === "error");
    } catch (e: unknown) {
      // A validate() failure must not block opening the repository, but it is
      // itself the kind of thing that must not pass silently.
      return [{ severity: "error", message: `Could not validate repository: ${e instanceof Error ? e.message : String(e)}` }];
    }
  }

  // ---------------------------------------------------------------------------
  // Create new governance document (srs-web#141)
  // ---------------------------------------------------------------------------

  /**
   * Scaffold a new governance document (all semantics in the WASM
   * `scaffold_new_repository` binding) and persist it to the chosen backend.
   * Throws on failure — the create panel renders the error and the app stays
   * idle; no half-created state is entered.
   */
  async function createDocument(name: string, destination: StorageProviderId): Promise<void> {
    const { repo: newRepo } = createGovernanceDocument(name);
    const filename = `${slugifyFilename(name)}.srs`;

    if (destination === "local") {
      downloadArchive(exportArchive(newRepo), filename);
      activeDocument = null;
    } else {
      // Resolve explicitly so a new provider id can never silently misroute here.
      const provider =
        destination === "dropbox"
          ? storageProviders.dropbox
          : destination === "google-drive"
            ? storageProviders.googleDrive
            : storageProviders.github;
      if (!provider?.create) {
        throw new Error(`${provider?.label ?? destination} cannot create new files.`);
      }
      activeDocument = await provider.create(filename, exportArchive(newRepo));
    }

    repo = newRepo;
    beginDocument();
    repoName = name;
    cachedSession = null;
    saveMessage = null;
    appState = "loaded";
  }

  // ---------------------------------------------------------------------------
  // Document loading — archive (.srs)
  // ---------------------------------------------------------------------------

  async function loadArchiveDocument(bytes: Uint8Array, name: string): Promise<void> {
    errorMsg = null;
    try {
      const loaded = loadRepoFromArchive(bytes);
      repo = loaded;
      gateOnMigration(loaded, name, (dirty) => {
        repo = loaded;
        beginDocument({ dirty });
        activeDocument = null;
        repoName = stripSrsExtension(name);
        cachedSession = null;
        saveMessage = dirty ? "Migrated to the current data model. Unsaved - export to keep it." : null;
        if (dirty) saveWorkingCopy(repoName, exportSrsj(loaded));
        appState = "loaded";
      });
    } catch (e: unknown) {
      repo = null;
      throw new Error(
        `Failed to load archive: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  function handleExport() {
    if (!repo) return;
    const json = exportSrsj(repo);
    downloadDocument(json, `${repoName}.srsj`);
  }

  function handleExportArchive() {
    if (!repo) return;
    downloadArchive(exportArchive(repo), `${repoName}.srs`);
  }

  // ---------------------------------------------------------------------------
  // Save (write back to the opened cloud/git document)
  // ---------------------------------------------------------------------------

  function saveErrorMessage(e: unknown): string {
    const code =
      e instanceof StorageError
        ? e.code
        : typeof e === "object" && e !== null && "code" in e
          ? (e as { code?: string }).code
          : null;
    if (code === "conflict") {
      return "This file changed since you opened it. Use “Open another file” to reload the latest version, then re-apply your edits.";
    }
    return `Save failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  /**
   * Save the current repo back to its source document. Git-backed handles open a
   * dialog (branch choice + install hint); other cloud handles write directly.
   */
  async function handleSave(): Promise<void> {
    if (saving || !repo || !activeDocument?.capabilities.write) return;
    if (isGitBranchAware(activeDocument)) {
      gitSaveError = null;
      gitSaveOpen = true;
      return;
    }
    await saveDirect();
  }

  /** Direct revision-aware write for non-git cloud handles (Dropbox/Drive). */
  async function saveDirect(): Promise<void> {
    if (!repo || !activeDocument?.capabilities.write) return;
    const repository = repo;
    const handle = activeDocument;
    const saveSnapshot = documentMutations.captureSave();
    saving = true;
    saveMessage = null;
    try {
      if (handle.kind === "tree") {
        // A tree handle that is not GitBranchAware is an on-device folder
        // (srs-web#248) — write it straight back to disk. This branch must come
        // first: the provider fan-out below ends in GitHub, so a "local" handle
        // falling through would try to create a file on GitHub.
        await (handle as DocumentHandle & RepoTreeAware).commitTree(exportTree(repository));
        saveMessage = completeDocumentSave(saveSnapshot) ? "Saved." : "Saved. Newer changes remain unsaved.";
      } else if (handle.kind === "bytes" && handle.writeBytes) {
        await handle.writeBytes(exportArchive(repository), handle.revision);
        saveMessage = completeDocumentSave(saveSnapshot) ? "Saved." : "Saved. Newer changes remain unsaved.";
      } else {
        // Auto-upgrade: create a new .srs file and switch the active handle to it.
        const provider =
          handle.provider === "dropbox"
            ? storageProviders.dropbox
            : handle.provider === "google-drive"
              ? storageProviders.googleDrive
              : storageProviders.github;
        if (provider?.create) {
          const newName = toArchiveName(handle.name);
          const newHandle = await provider.create(newName, exportArchive(repository));
          activeDocument = newHandle;
          saveMessage = completeDocumentSave(saveSnapshot)
            ? `Saved as ${newHandle.name}.`
            : `Saved as ${newHandle.name}. Newer changes remain unsaved.`;
        } else {
          await handle.write(exportSrsj(repository), handle.revision);
          saveMessage = completeDocumentSave(saveSnapshot) ? "Saved." : "Saved. Newer changes remain unsaved.";
        }
      }
    } catch (e: unknown) {
      saveMessage = saveErrorMessage(e);
    } finally {
      saving = false;
    }
  }

  /** Commit a git-backed document to the chosen (or newly created) branch. */
  async function confirmGitSave(opts: {
    mode: "current" | "new";
    newBranch: string;
    message: string;
  }): Promise<void> {
    if (!repo || !isGitBranchAware(activeDocument)) return;
    const repository = repo;
    const handle = activeDocument;
    const saveSnapshot = documentMutations.captureSave();
    saving = true;
    gitSaveError = null;
    try {
      const branch = opts.mode === "new" ? opts.newBranch : handle.branch;
      // "new" only truly branches when the name differs from the current branch.
      const branchedOff = opts.mode === "new" && branch !== handle.branch;
      const branchOpts = {
        branch,
        createFromCurrent: opts.mode === "new",
        message: opts.message,
      };
      switch (handle.kind) {
        case "text":
          await handle.saveToBranch(exportSrsj(repository), branchOpts);
          break;
        case "tree":
          await (handle as unknown as DocumentHandle & RepoTreeAware).commitTree(
            exportTree(repository),
            branchOpts
          );
          break;
        default:
          // Not reachable today (no "bytes" handle is also GitBranchAware — GitHub git
          // saves stay "text"-only per ADR-015), but guard explicitly rather than
          // silently falling through and corrupting a binary document.
          throw new Error("Git save is not supported for this document type yet.");
      }
      const saveIsCurrent = completeDocumentSave(saveSnapshot);
      saveMessage = branchedOff
        ? `Saved to new branch “${branch}”. Open a pull request on GitHub to merge it.${saveIsCurrent ? "" : " Newer changes remain unsaved."}`
        : saveIsCurrent ? "Saved." : "Saved. Newer changes remain unsaved.";
      gitSaveOpen = false;
    } catch (e: unknown) {
      // Keep the dialog open so the install hint stays visible on a permission error.
      gitSaveError = saveErrorMessage(e);
    } finally {
      saving = false;
    }
  }
</script>

<!-- =========================================================================
     Boot state
     ========================================================================= -->
{#snippet catalogBanner()}
  {#if catalogDiagnostics.length > 0 && catalogDiagnosticsOpen}
    <div class="catalog-banner" role="alert" data-testid="catalog-diagnostics">
      <p class="catalog-banner__msg">
        {catalogDiagnostics.length} catalog diagnostic{catalogDiagnostics.length === 1 ? "" : "s"} in
        <strong>{repoName}</strong> — objects reported by the engine, not silently dropped.
      </p>
      <ul class="catalog-banner__list">
        {#each catalogDiagnostics.slice(0, 10) as d}
          <li class="catalog-banner__item" data-severity={d.severity}>{d.severity}: {d.message}</li>
        {/each}
      </ul>
      {#if catalogDiagnostics.length > 10}
        <p class="catalog-banner__more">…and {catalogDiagnostics.length - 10} more.</p>
      {/if}
      <button class="catalog-banner__dismiss" onclick={() => { catalogDiagnosticsOpen = false; }}>
        Dismiss
      </button>
    </div>
  {/if}
{/snippet}

{#if appState === "boot"}
  <div class="splash">
    <p class="splash__status">Loading engine…</p>
  </div>

<!-- =========================================================================
     Error state
     ========================================================================= -->
{:else if appState === "error"}
  <div class="splash">
    <p class="splash__error" role="alert">{errorMsg}</p>
    <button
      class="splash__retry"
      onclick={() => {
        errorMsg = null;
        appState = "idle";
      }}
    >Try again</button>
  </div>

<!-- =========================================================================
     Idle state — mode picker then file picker
     ========================================================================= -->
{:else if appState === "migrate" && pendingMigration}
  <div class="splash" data-testid="migration-prompt">
    <h1 class="splash__title">Update needed</h1>
    <p class="splash__sub">
      <strong>{pendingMigration.name}</strong> uses an older SRS data model (revision 7) and cannot be
      opened as-is. Migrating rewrites container membership in the working copy
      (<code>{RFC043_MIGRATION_ID}</code>). Nothing is saved until you press Save.
    </p>
    {#if migrationError}<p class="splash__error" role="alert" data-testid="migration-error">{migrationError}</p>{/if}
    <div class="restore-banner__actions">
      <button class="restore-banner__restore" data-testid="migration-apply" onclick={runPendingMigration}>Migrate and open</button>
      <button class="restore-banner__dismiss" data-testid="migration-cancel" onclick={cancelPendingMigration}>Cancel</button>
    </div>
  </div>

{:else if appState === "idle"}
  <div class="splash" data-testid="generic-file-picker">
    <h1 class="splash__title">SRS Viewer</h1>
    <p class="splash__sub">Open any <code>.srs</code> or <code>.srsj</code> repository to read its documents, structure, and records.</p>
    {#if cachedSession !== null}
      <div class="restore-banner" role="status">
        <p class="restore-banner__msg">Unsaved session: <strong>{cachedSession.name}</strong></p>
        {#if restoreError}<p class="restore-banner__error" role="alert">{restoreError}</p>{/if}
        <div class="restore-banner__actions">
          <button class="restore-banner__restore" onclick={() => {
            restoreError = null;
            const entry = cachedSession;
            if (!entry) return;
            try {
              const restored = loadRepo(entry.srsj);
              repo = restored;
              gateOnMigration(restored, entry.name, () => {
                repo = restored;
                beginDocument({ dirty: true });
                repoName = entry.name;
                activeDocument = null;
                appState = "loaded";
                editorMode = "generic";
                cachedSession = null;
                saveWorkingCopy(repoName, exportSrsj(restored));
              });
            } catch (e: unknown) {
              clearWorkingCopy();
              restoreError = `Could not restore session: ${e instanceof Error ? e.message : String(e)}`;
            }
          }}>Restore session</button>
          <button class="restore-banner__dismiss" onclick={() => { clearWorkingCopy(); cachedSession = null; restoreError = null; }}>Discard</button>
        </div>
      </div>
    {/if}
    <SourceChooser providers={storageProviders} onOpen={loadDocument} onOpenArchive={loadArchiveDocument} />
    <p class="splash__divider">or start a governance repository</p>
    <CreateGovernanceDocumentPanel providers={storageProviders} onCreate={createDocument} />
  </div>

<!-- =========================================================================
     Loaded state — generic shell
     ========================================================================= -->
{:else if editorMode === "generic"}
  {@render catalogBanner()}
  <GenericSrsShell
    repo={repo!}
    repoName={repoName}
    onExport={handleExportArchive}
    onSave={activeDocument?.capabilities.write ? handleSave : undefined}
    {saving}
    {saveMessage}
    documentDirty={documentDirty}
    documentRevision={documentRevision}
    onDocumentMutation={handleDocumentMutation}
    onOpenEditor={(id) => { editorMode = id; }}
    onOpenAnother={() => {
      clearWorkingCopy();
      cachedSession = null;
      saveMessage = null;
      repo = null;
      activeDocument = null;
      appState = "idle";
    }}
  />

<!-- =========================================================================
     Loaded state — registered editor shell (src/lib/editors/registry.ts)
     ========================================================================= -->
{:else}
  {@render catalogBanner()}
  {@const Shell = (getEditor(editorMode) ?? EDITORS[0]).component}
  <Shell
    repo={repo!}
    repoName={repoName}
    documentProvider={activeDocument?.provider ?? "local"}
    onExport={handleExportArchive}
    onExportSrsj={handleExport}
    onSave={activeDocument?.capabilities.write ? handleSave : undefined}
    readOnlyReason={activeDocument?.readOnlyReason ?? null}
    saving={saving}
    saveMessage={saveMessage}
    documentDirty={documentDirty}
    documentRevision={documentRevision}
    onDocumentMutation={handleDocumentMutation}
    onOpenExplorer={() => { editorMode = "generic"; }}
    onOpenAnother={() => {
      clearWorkingCopy();
      cachedSession = null;
      saveMessage = null;
      repo = null;
      beginDocument();
      activeDocument = null;
      editorMode = "generic";
      appState = "idle";
    }}
  />
{/if}

{#if mcpHost && repo}
  <div class="mcp-dock" style="position:fixed;right:1rem;bottom:1rem;z-index:50">
    <McpConnection
      status={mcpState.status}
      callerUrl={mcpState.callerUrl}
      error={mcpState.error}
      repositoryName={repoName}
      onRotate={() => void mcpHost.rotate()}
      onTakeover={() => void mcpHost.takeover()}
    />
  </div>
{/if}

{#if gitSaveOpen && isGitBranchAware(activeDocument)}
  <GitSaveModal
    repoLabel={activeDocument.repoLabel}
    currentBranch={activeDocument.branch}
    installUrl={githubInstallUrl}
    busy={saving}
    error={gitSaveError}
    onSave={confirmGitSave}
    onCancel={() => {
      gitSaveOpen = false;
      gitSaveError = null;
    }}
  />
{/if}

<style>
  /* ---- Splash / idle ---- */
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    font-family: inherit;
  }

  .splash__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .splash__sub {
    margin: 0;
    opacity: 0.65;
    max-width: 28rem;
  }

  .splash__divider {
    margin: 0.75rem 0 0;
    opacity: 0.45;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .splash__status {
    opacity: 0.55;
    margin: 0;
  }

  .splash__error {
    color: #c00;
    margin: 0;
  }

  .splash__retry {
    margin-top: 0.5rem;
    cursor: pointer;
  }

  /* ---- Catalog diagnostics banner (RFC-038 [R24]) ---- */
  .catalog-banner {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border, #ddd);
    background: var(--color-warn-bg, #fff8e1);
    font-size: 0.875rem;
  }
  .catalog-banner__msg {
    margin: 0 0 0.5rem;
  }
  .catalog-banner__list {
    margin: 0;
    padding-left: 1.25rem;
  }
  .catalog-banner__item[data-severity="error"] {
    color: var(--color-error, #b3261e);
  }
  .catalog-banner__more {
    margin: 0.25rem 0 0;
    opacity: 0.8;
  }
  .catalog-banner__dismiss {
    margin-top: 0.5rem;
  }

  /* ---- Restore banner ---- */
  .restore-banner {
    border: 1px solid var(--accent, #0066cc);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    max-width: 28rem;
    width: 100%;
    text-align: left;
    background: var(--color-surface-2, #f0f6ff);
  }

  .restore-banner__msg {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
  }

  .restore-banner__error {
    font-size: 0.75rem;
    color: var(--error, #cc0000);
    margin: 0 0 0.5rem;
  }

  .restore-banner__actions {
    display: flex;
    gap: 0.5rem;
  }

  .restore-banner__restore {
    font-size: 0.8rem;
    padding: 0.3rem 0.75rem;
    background: var(--accent, #0066cc);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .restore-banner__dismiss {
    font-size: 0.8rem;
    padding: 0.3rem 0.75rem;
    background: none;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    cursor: pointer;
  }
</style>
