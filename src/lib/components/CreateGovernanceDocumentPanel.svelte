<!--
  CreateGovernanceDocumentPanel — "Create new governance document" onboarding (srs-web#141).

  Presentation only (ADR-001): the caller owns scaffolding (WASM) and persistence;
  this panel collects a name and a destination, mirroring SourceChooser's
  three-backend layout and busy/error handling.
-->
<script lang="ts">
  import type { StorageProviderId, StorageProviders } from "$lib/storage/index.js";
  import { StorageError } from "$lib/storage/index.js";
  import Button from "./Button.svelte";

  interface Props {
    providers: StorageProviders;
    onCreate: (name: string, destination: StorageProviderId) => Promise<void>;
  }

  let { providers, onCreate }: Props = $props();

  let name = $state("");
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
      await onCreate(trimmedName, destination);
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
    placeholder="Name your governance document…"
    bind:value={name}
    disabled={busy !== null}
    onkeydown={(e) => {
      if (e.key === "Enter") void run("local");
    }}
  />

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
    <p class="create-panel__error" role="alert">{error}</p>
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
    border: 1px solid var(--black);
    background: var(--paper);
    font-family: var(--font-sans);
    font-size: 1rem;
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

  .create-panel__error {
    color: #a22b1f;
    margin: 0;
    font-size: 0.875rem;
  }

  @media (max-width: 640px) {
    .create-panel__destinations {
      grid-template-columns: 1fr;
    }
  }
</style>
