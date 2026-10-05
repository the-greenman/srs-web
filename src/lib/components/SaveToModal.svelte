<!--
  SaveToModal.svelte — "Where to save?" dialog for a document with no storage handle
  (a new repository or a restored session), srs-web#341.

  Built on the Modal primitive. Presentation only (ADR-001); the caller does
  the download or provider.create().
-->
<script lang="ts">
  import Notice from "./Notice.svelte";
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";
  import type { StorageProviders } from "$lib/storage/index.js";

  type Destination = "local" | "dropbox" | "google-drive";

  interface Props {
    providers: StorageProviders;
    busy: boolean;
    error: string | null;
    onSave: (destination: Destination) => void;
    onCancel: () => void;
  }

  const { providers, busy, error, onSave, onCancel }: Props = $props();

  function canCreateCloud(provider: { configured: boolean; create?: unknown }): boolean {
    return provider.configured && typeof provider.create === "function";
  }
</script>

<Modal title="Save to…" testid="save-to-modal" {onCancel}>
  <p>This repository is not saved yet. Choose where to keep it.</p>

  <Button variant="primary" disabled={busy} data-testid="save-to-local" onclick={() => onSave("local")}>To this device</Button>
  <Button
    disabled={busy || !canCreateCloud(providers.dropbox)}
    title={providers.dropbox.configured ? "Save to Dropbox" : "Dropbox is not configured"}
    data-testid="save-to-dropbox"
    onclick={() => onSave("dropbox")}
  >Dropbox</Button>
  <Button
    disabled={busy || !canCreateCloud(providers.googleDrive)}
    title={providers.googleDrive.configured ? "Save to Google Drive" : "Google Drive is not configured"}
    data-testid="save-to-google-drive"
    onclick={() => onSave("google-drive")}
  >Google Drive</Button>

  {#if busy}<p>Saving…</p>{/if}
  {#if error}<Notice kind="error">{error}</Notice>{/if}

  {#snippet actions()}
    <Button size="sm" onclick={onCancel} disabled={busy}>Cancel</Button>
  {/snippet}
</Modal>
