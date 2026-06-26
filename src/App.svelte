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
  } from "$lib/srs-client.js";
  import type { SrsRepository } from "$lib/srs-client.js";

  import GuidesShell from "$lib/guides/GuidesShell.svelte";
  import GovernanceShell from "$lib/governance/GovernanceShell.svelte";
  import SourceChooser from "$lib/components/SourceChooser.svelte";
  import {
    createStorageProvidersFromEnv,
    downloadDocument,
    type DocumentHandle,
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

  let repo = $state<SrsRepository | null>(null);

  // ---------------------------------------------------------------------------
  // WASM initialisation
  // ---------------------------------------------------------------------------

  $effect(() => {
    initWasm()
      .then(() => {
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
  // Export
  // ---------------------------------------------------------------------------

  function handleExport() {
    if (!repo) return;
    const json = exportSrsj(repo);
    downloadDocument(json, `${repoName}.srsj`);
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
      <p class="splash__sub">Open a <code>.srsj</code> repository file to explore its governance records.</p>
      <SourceChooser providers={storageProviders} onOpen={loadDocument} />
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
    onOpenAnother={() => {
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
    onOpenAnother={() => {
      repo = null;
      activeDocument = null;
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
</style>
