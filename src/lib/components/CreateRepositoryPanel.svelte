<!--
  CreateRepositoryPanel — "New repository" onboarding (srs-web#141, #341).

  Presentation only (ADR-001): the caller owns scaffolding (WASM) and persistence;
  this panel collects a name, the editors to start with (none = a blank repository,
  where Install is offered later) and a destination, mirroring SourceChooser's
  three-backend layout and busy/error handling.
-->
<script lang="ts">
  import Notice from './Notice.svelte';
  import type { StorageProviderId, StorageProviders } from "$lib/storage/index.js";
  import { StorageError } from "$lib/storage/index.js";
  import Button from "./Button.svelte";
  import { creatableEditors } from "$lib/editors/registry.js";

  interface Props {
    providers: StorageProviders;
    onCreate: (name: string, editors: string[], destination: StorageProviderId) => Promise<void>;
  }

  let { providers, onCreate }: Props = $props();

  const editors = creatableEditors();

  let name = $state("");
  let chosen = $state<string[]>([]);
  let busy = $state<StorageProviderId | null>(null);
  let error = $state<string | null>(null);

  const trimmedName = $derived(name.trim());

  function canCreateCloud(provider: { configured: boolean; create?: unknown }): boolean {
    return provider.configured && typeof provider.create === "function";
  }

  async function run(destination: StorageProviderId): Promise<void> {
    if (trimmedName === "" || busy !== null) return;
    busy = destination;
    error = null;
    try {
      await onCreate(trimmedName, chosen, destination);
    } catch (caught) {
      const code =
        caught instanceof StorageError
          ? caught.code
          : typeof caught === "object" && caught !== null && "code" in caught
            ? caught.code
            : null;
      if (code !== "cancelled") {
        error = caught instanceof Error ? caught.message : String(caught);
      }
    } finally {
      busy = null;
    }
  }
</script>

<div class="create-panel" data-testid="create-panel">
  <input
    class="create-panel__name"
    data-testid="create-name"
    type="text"
    placeholder="Name your repository…"
    bind:value={name}
    disabled={busy !== null}
    onkeydown={(e) => {
      if (e.key === "Enter") void run("local");
    }}
  />

  <fieldset class="create-panel__editors" disabled={busy !== null}>
    <legend>Start with</legend>
    {#each editors as editor (editor.id)}
      <label title={editor.description}>
        <input type="checkbox" data-testid="create-editor-{editor.id}" value={editor.id} bind:group={chosen} />
        {editor.label}
      </label>
    {/each}
  </fieldset>

  <div class="create-panel__destinations">
    <Button
      data-testid="create-local"
      disabled={trimmedName === "" || busy !== null}
      title="Create and download to this device"
      onclick={() => void run("local")}
    >{busy === "local" ? "Creating…" : "To this device"}</Button>

    <Button
      variant="secondary"
      data-testid="create-dropbox"
      disabled={trimmedName === "" || busy !== null || !canCreateCloud(providers.dropbox)}
      title={providers.dropbox.configured ? "Create in Dropbox" : "Dropbox is not configured"}
      onclick={() => void run("dropbox")}
    >{busy === "dropbox" ? "Creating…" : "In Dropbox"}</Button>

    <Button
      variant="secondary"
      data-testid="create-google-drive"
      disabled={trimmedName === "" || busy !== null || !canCreateCloud(providers.googleDrive)}
      title={providers.googleDrive.configured
        ? "Create in Google Drive"
        : "Google Drive is not configured"}
      onclick={() => void run("google-drive")}
    >{busy === "google-drive" ? "Creating…" : "In Google Drive"}</Button>
  </div>

  {#if error}
    <Notice kind="error">{error}</Notice>
  {/if}
</div>

<style>
  .create-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(38rem, calc(100vw - 2rem));
    margin-top: 0.5rem;
  }

  .create-panel__name {
    min-height: 3rem;
    padding: 0.75rem 1rem;
    box-sizing: border-box;
    border: 1px solid var(--color-text-strong);
    background: var(--color-bg);
    font-family: var(--font-sans);
    font-size: 1rem;
  }

  .create-panel__editors {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    margin: 0;
    padding: 0;
    border: 0;
    font-family: var(--font-sans);
  }

  .create-panel__editors legend {
    padding: 0;
    margin-bottom: 0.25rem;
    color: var(--color-text-muted, inherit);
  }

  .create-panel__destinations {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .create-panel__destinations :global(.btn) {
    min-height: 3.25rem;
    display: grid;
    place-items: center;
    padding: 0.75rem 1rem;
    box-sizing: border-box;
  }


  /* bp: form */
  @media (max-width: 640px) {
    .create-panel__destinations {
      grid-template-columns: 1fr;
    }
  }
</style>
