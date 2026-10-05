<!--
  SaveToModal.svelte — "Where to save?" dialog for a document with no storage handle
  (a new repository or a restored session), srs-web#341.

  Mirrors GitSaveModal's popup pattern. Presentation only (ADR-001); the caller does
  the download or provider.create().
-->
<script lang="ts">
  import Notice from "./Notice.svelte";
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

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="save-to-title" data-testid="save-to-modal">
  <div class="modal-dialog">
    <h2 class="modal-dialog__title" id="save-to-title">Save to…</h2>
    <p class="modal-dialog__body">This repository is not saved yet. Choose where to keep it.</p>

    <div class="save-to__options">
      <button class="modal-btn modal-btn--primary" disabled={busy} data-testid="save-to-local" onclick={() => onSave("local")}>
        To this device
      </button>
      <button
        class="modal-btn"
        disabled={busy || !canCreateCloud(providers.dropbox)}
        title={providers.dropbox.configured ? "Save to Dropbox" : "Dropbox is not configured"}
        data-testid="save-to-dropbox"
        onclick={() => onSave("dropbox")}
      >Dropbox</button>
      <button
        class="modal-btn"
        disabled={busy || !canCreateCloud(providers.googleDrive)}
        title={providers.googleDrive.configured ? "Save to Google Drive" : "Google Drive is not configured"}
        data-testid="save-to-google-drive"
        onclick={() => onSave("google-drive")}
      >Google Drive</button>
    </div>

    {#if busy}<p class="modal-dialog__body">Saving…</p>{/if}
    {#if error}<Notice kind="error">{error}</Notice>{/if}

    <div class="modal-dialog__actions">
      <button class="modal-btn modal-btn--cancel" onclick={onCancel} disabled={busy}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-overlay);
  }

  .modal-dialog {
    background: var(--color-surface);
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 1.5rem;
    max-width: 30rem;
    width: 90vw;
  }

  .modal-dialog__title {
    font-weight: 600;
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .modal-dialog__body {
    font-size: 0.875rem;
    margin: 0 0 1rem;
    opacity: 0.75;
  }

  .save-to__options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0 0 1rem;
  }

  .modal-dialog__actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .modal-btn {
    font-size: 0.75rem;
    background: none;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0.3rem 0.65rem;
    cursor: pointer;
    opacity: 0.75;
  }

  .modal-btn:hover {
    opacity: 1;
  }

  .modal-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .modal-btn--primary {
    font-weight: 600;
  }

  .modal-btn--cancel {
    opacity: 0.5;
  }
</style>
