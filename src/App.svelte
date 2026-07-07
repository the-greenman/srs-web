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
    exportSrsj,
    createGovernanceDocument,
  } from "$lib/srs-client.js";
  import type { SrsRepository } from "$lib/srs-client.js";
  import { loadWorkingCopy, clearWorkingCopy } from "$lib/browser-cache.js";
  import type { WorkingCopyEntry } from "$lib/browser-cache.js";

  import GuidesShell from "$lib/guides/GuidesShell.svelte";
  import GovernanceShell from "$lib/governance/GovernanceShell.svelte";
  import SourceChooser from "$lib/components/SourceChooser.svelte";
  import CreateGovernanceDocumentPanel from "$lib/components/CreateGovernanceDocumentPanel.svelte";
  import { slugifyFilename } from "$lib/slug.js";
  import {
    createStorageProvidersFromEnv,
    downloadDocument,
    StorageError,
    type DocumentHandle,
    type StorageProviderId,
  } from "$lib/storage/index.js";

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
      const text = await handle.read();
      repo = loadRepo(text);
      activeDocument = handle;
      repoName = handle.name.replace(/\.(srsj|json)$/i, "");
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
    const json = exportSrsj(newRepo);
    const filename = `${slugifyFilename(name)}.srsj`;

    if (destination === "local") {
      downloadDocument(json, filename);
      activeDocument = null;
    } else {
      const provider =
        destination === "dropbox" ? storageProviders.dropbox : storageProviders.googleDrive;
      if (!provider.create) throw new Error(`${provider.label} cannot create new files.`);
      activeDocument = await provider.create(filename, json);
    }

    repo = newRepo;
    repoName = name;
    cachedSession = null;
    saveMessage = null;
    appState = "loaded";
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  function handleExport() {
    if (!repo) return;
    const json = exportSrsj(repo);
    downloadDocument(json, `${repoName}.srsj`);
  }

  // ---------------------------------------------------------------------------
  // Save (write back to the opened cloud/git document)
  // ---------------------------------------------------------------------------

  /**
   * Write the current repo back to its source document (Dropbox/Drive/GitHub).
   * A concurrent edit surfaces as a reload-and-retry prompt rather than a clobber.
   * Provider-agnostic — any write-capable DocumentHandle works.
   */
  async function handleSave(): Promise<void> {
    if (!repo || !activeDocument?.capabilities.write) return;
    saving = true;
    saveMessage = null;
    try {
      await activeDocument.write(exportSrsj(repo), activeDocument.revision);
      saveMessage = "Saved.";
      clearWorkingCopy();
    } catch (e: unknown) {
      const code =
        e instanceof StorageError
          ? e.code
          : typeof e === "object" && e !== null && "code" in e
            ? (e as { code?: string }).code
            : null;
      if (code === "conflict") {
        saveMessage =
          "This file changed since you opened it. Use “Open another file” to reload the latest version, then re-apply your edits.";
      } else {
        saveMessage = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
      }
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
      <p class="splash__sub">Open a <code>.srsj</code> repository file to explore its governance records.</p>
      <SourceChooser providers={storageProviders} onOpen={loadDocument} />
      <p class="splash__divider">or start from scratch</p>
      <CreateGovernanceDocumentPanel providers={storageProviders} onCreate={createDocument} />
      <button class="splash__back" onclick={() => { editorMode = null; }}>← Back</button>
    </div>
  {:else}
    <div class="splash" data-testid="guides-file-picker">
      <h1 class="splash__title">muDemocracy Guides Editor</h1>
      <p class="splash__sub">Open a <code>.srsj</code> repository file to edit guides.</p>
      <SourceChooser providers={storageProviders} onOpen={loadDocument} />
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
    onExport={handleExport}
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
    onExport={handleExport}
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
