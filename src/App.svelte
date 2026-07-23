<!--
  App.svelte — Application shell.

  Owns: WASM initialisation, repo loading, top-level app state, editor mode selection.
  Delegates: governance editor to GovernanceShell; guides editor to GuidesShell.

  States: boot → idle → loaded | error
    boot:   WASM initialising
    idle:   WASM ready, no repo loaded — show mode picker then file picker
    loaded: repo loaded — show GovernanceShell or GuidesShell
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
  } from "$lib/srs-client.js";
  import type { SrsRepository } from "$lib/srs-client.js";
  import { loadWorkingCopy, clearWorkingCopy } from "$lib/browser-cache.js";
  import type { WorkingCopyEntry } from "$lib/browser-cache.js";

  import GuidesShell from "$lib/guides/GuidesShell.svelte";
  import GovernanceShell from "$lib/governance/GovernanceShell.svelte";
  import SourceChooser from "$lib/components/SourceChooser.svelte";
  import CreateGovernanceDocumentPanel from "$lib/components/CreateGovernanceDocumentPanel.svelte";
  import GitSaveModal from "$lib/components/GitSaveModal.svelte";
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

  type AppState = "boot" | "idle" | "loaded" | "error";
  type EditorMode = "governance" | "guides";

  let appState = $state<AppState>("boot");
  let errorMsg = $state<string | null>(null);
  let editorMode = $state<EditorMode | null>(null);

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

  /** Cached working copy loaded from localStorage on WASM init. */
  let cachedSession = $state<WorkingCopyEntry | null>(null);
  let restoreError = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // WASM initialisation
  // ---------------------------------------------------------------------------

  $effect(() => {
    initWasm()
      .then(() => {
        const cached = loadWorkingCopy();
        if (cached !== null) {
          cachedSession = cached;
          editorMode = "governance";
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
      activeDocument = handle;
      repoName = stripSrsExtension(handle.name);
      cachedSession = null;
      saveMessage = null;
      appState = "loaded";
    } catch (e: unknown) {
      repo = null;
      activeDocument = null;
      throw new Error(
        `Failed to load repository: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
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
      repo = loadRepoFromArchive(bytes);
      activeDocument = null;
      repoName = stripSrsExtension(name);
      cachedSession = null;
      saveMessage = null;
      appState = "loaded";
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
    if (!repo || !activeDocument?.capabilities.write) return;
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
    saving = true;
    saveMessage = null;
    try {
      if (activeDocument.kind === "bytes" && activeDocument.writeBytes) {
        await activeDocument.writeBytes(exportArchive(repo), activeDocument.revision);
        saveMessage = "Saved.";
      } else {
        // Auto-upgrade: create a new .srs file and switch the active handle to it.
        const provider =
          activeDocument.provider === "dropbox"
            ? storageProviders.dropbox
            : activeDocument.provider === "google-drive"
              ? storageProviders.googleDrive
              : storageProviders.github;
        if (provider?.create) {
          const newName = toArchiveName(activeDocument.name);
          const newHandle = await provider.create(newName, exportArchive(repo));
          activeDocument = newHandle;
          saveMessage = `Saved as ${newHandle.name}.`;
        } else {
          await activeDocument.write(exportSrsj(repo), activeDocument.revision);
          saveMessage = "Saved.";
        }
      }
      clearWorkingCopy();
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
    const handle = activeDocument;
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
          await handle.saveToBranch(exportSrsj(repo), branchOpts);
          break;
        case "tree":
          await (handle as unknown as DocumentHandle & RepoTreeAware).commitTree(
            exportTree(repo),
            branchOpts
          );
          break;
        default:
          // Not reachable today (no "bytes" handle is also GitBranchAware — GitHub git
          // saves stay "text"-only per ADR-015), but guard explicitly rather than
          // silently falling through and corrupting a binary document.
          throw new Error("Git save is not supported for this document type yet.");
      }
      saveMessage = branchedOff
        ? `Saved to new branch “${branch}”. Open a pull request on GitHub to merge it.`
        : "Saved.";
      clearWorkingCopy();
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
{:else if appState === "idle"}
  {#if editorMode === null}
    <div class="splash" data-testid="mode-picker">
      <h1 class="splash__title">SRS Editor</h1>
      <p class="splash__sub">Choose an editor mode to get started.</p>
      <div class="mode-picker">
        <button
          class="mode-picker__btn"
          data-testid="mode-governance"
          onclick={() => { editorMode = "governance"; }}
        >
          <strong>Governance Editor</strong>
          <span>Articles, Decisions, Roles</span>
        </button>
        <button
          class="mode-picker__btn"
          data-testid="mode-guides"
          onclick={() => { editorMode = "guides"; }}
        >
          <strong>Guides Editor</strong>
          <span>muDemocracy guides</span>
        </button>
      </div>
    </div>
  {:else if editorMode === "governance"}
    <div class="splash" data-testid="governance-file-picker">
      <h1 class="splash__title">SRS Governance Viewer</h1>
      {#if cachedSession !== null}
        <div class="restore-banner" role="status">
          <p class="restore-banner__msg">
            Unsaved session: <strong>{cachedSession.name}</strong>
          </p>
          {#if restoreError}
            <p class="restore-banner__error" role="alert">{restoreError}</p>
          {/if}
          <div class="restore-banner__actions">
            <button
              class="restore-banner__restore"
              onclick={() => {
                restoreError = null;
                const entry = cachedSession;
                if (!entry) return;
                try {
                  repo = loadRepo(entry.srsj);
                  repoName = entry.name;
                  activeDocument = null;
                  appState = "loaded";
                  editorMode = "governance";
                  cachedSession = null;
                } catch (e: unknown) {
                  clearWorkingCopy();
                  restoreError = `Could not restore session: ${e instanceof Error ? e.message : String(e)}`;
                }
              }}
            >Restore session</button>
            <button
              class="restore-banner__dismiss"
              onclick={() => {
                clearWorkingCopy();
                cachedSession = null;
                restoreError = null;
              }}
            >Discard</button>
          </div>
        </div>
      {/if}
      <p class="splash__sub">Open a <code>.srs</code> or <code>.srsj</code> repository file to explore its governance records.</p>
      <SourceChooser providers={storageProviders} onOpen={loadDocument} onOpenArchive={loadArchiveDocument} />
      <p class="splash__divider">or start from scratch</p>
      <CreateGovernanceDocumentPanel providers={storageProviders} onCreate={createDocument} />
      <button class="splash__back" onclick={() => { editorMode = null; }}>← Back</button>
    </div>
  {:else}
    <div class="splash" data-testid="guides-file-picker">
      <h1 class="splash__title">muDemocracy Guides Editor</h1>
      <p class="splash__sub">Open a <code>.srs</code> or <code>.srsj</code> repository file to edit guides.</p>
      <SourceChooser providers={storageProviders} onOpen={loadDocument} onOpenArchive={loadArchiveDocument} />
      <button class="splash__back" onclick={() => { editorMode = null; }}>← Back</button>
    </div>
  {/if}

<!-- =========================================================================
     Loaded state — guides shell
     ========================================================================= -->
{:else if editorMode === "guides"}
  <GuidesShell
    repo={repo!}
    repoName={repoName}
    documentProvider={activeDocument?.provider ?? "local"}
    onExport={handleExportArchive}
    onExportSrsj={handleExport}
    onSave={activeDocument?.capabilities.write ? handleSave : undefined}
    saving={saving}
    saveMessage={saveMessage}
    onOpenAnother={() => {
      clearWorkingCopy();
      cachedSession = null;
      saveMessage = null;
      repo = null;
      activeDocument = null;
      editorMode = null;
      appState = "idle";
    }}
  />

<!-- =========================================================================
     Loaded state — governance shell
     ========================================================================= -->
{:else}
  <GovernanceShell
    repo={repo!}
    repoName={repoName}
    documentProvider={activeDocument?.provider ?? "local"}
    onExport={handleExportArchive}
    onExportSrsj={handleExport}
    onSave={activeDocument?.capabilities.write ? handleSave : undefined}
    saving={saving}
    saveMessage={saveMessage}
    onOpenAnother={() => {
      clearWorkingCopy();
      cachedSession = null;
      saveMessage = null;
      repo = null;
      activeDocument = null;
      editorMode = null;
      appState = "idle";
    }}
  />
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

  .splash__back {
    margin-top: 1rem;
    background: none;
    border: none;
    color: var(--color-muted, #888);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
  }
  .splash__back:hover {
    text-decoration: underline;
  }

  .mode-picker {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .mode-picker__btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 1rem 1.5rem;
    min-width: 10rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    background: var(--color-surface-1, #fafafa);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }
  .mode-picker__btn:hover {
    border-color: var(--color-accent, #4a90d9);
    background: var(--color-surface-2, #f0f6ff);
  }
  .mode-picker__btn strong {
    font-size: 0.95rem;
  }
  .mode-picker__btn span {
    font-size: 0.75rem;
    color: var(--color-muted, #888);
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
