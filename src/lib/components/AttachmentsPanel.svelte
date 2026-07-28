<!-- AttachmentsPanel.svelte — list repo attachments and upload new files (srs-web#99) -->
<script lang="ts">
  import { tick } from "svelte";
  import { onDestroy } from "svelte";
  import { listAttachments, addAttachment, getAttachmentBytes } from "$lib/srs-client.js";
  import type {
    SrsRepository,
    AttachmentListResult,
    AttachmentEntry,
  } from "$lib/srs-client.js";

  type PreviewState = 'idle' | 'loading' | 'loaded' | 'error';

  interface Props {
    repo: SrsRepository;
    onMutate: () => void;
    onCountChange: (count: number) => void;
  }
  let { repo, onMutate, onCountChange }: Props = $props();

  let result = $state<AttachmentListResult>({ sourceDocumentsPath: "", entries: [] });
  let error = $state<string | null>(null);
  let uploading = $state(false);

  let previewState = $state(new Map<string, PreviewState>());
  let previewUrls = $state(new Map<string, string>());
  let previewErrors = $state(new Map<string, string>());
  let destroyed = false;

  function refresh() {
    try {
      const fetched = listAttachments(repo);
      result = fetched;
      onCountChange(fetched.entries.length);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to list attachments";
      onCountChange(0);
    }
  }

  $effect(() => {
    refresh();
  });

  onDestroy(() => {
    destroyed = true;
    for (const url of previewUrls.values()) {
      URL.revokeObjectURL(url);
    }
    previewUrls.clear();
  });

  async function togglePreview(entry: AttachmentEntry) {
    if (!entry.documentId) return;
    const id = entry.documentId;
    const state = previewState.get(id) ?? 'idle';

    if (state === 'loading') {
      return;
    }

    if (state === 'loaded') {
      const url = previewUrls.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        previewUrls.delete(id);
        // trigger reactivity
        previewUrls = new Map(previewUrls);
      }
      previewState.set(id, 'idle');
      previewState = new Map(previewState);
      return;
    }

    // idle or error → start/retry fetch
    previewState.set(id, 'loading');
    previewState = new Map(previewState);

    // yield the render loop so "Loading…" appears before the synchronous WASM call
    await tick();

    let bytes: Uint8Array;
    try {
      bytes = getAttachmentBytes(repo, id);
    } catch (e: unknown) {
      if (destroyed) return;
      previewErrors.set(id, "Attachment bytes unavailable — export a .srs archive to preserve attachment content.");
      previewErrors = new Map(previewErrors);
      previewState.set(id, 'error');
      previewState = new Map(previewState);
      return;
    }

    if (destroyed) return;

    let url: string;
    try {
      url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)]));
    } catch (e: unknown) {
      previewErrors.set(id, "Cannot display as image");
      previewErrors = new Map(previewErrors);
      previewState.set(id, 'error');
      previewState = new Map(previewState);
      return;
    }

    previewUrls.set(id, url);
    previewUrls = new Map(previewUrls);
    previewState.set(id, 'loaded');
    previewState = new Map(previewState);
  }

  function handlePreviewError(entry: AttachmentEntry) {
    if (!entry.documentId) return;
    const id = entry.documentId;
    const url = previewUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrls.delete(id);
      previewUrls = new Map(previewUrls);
    }
    previewErrors.set(id, "Cannot display as image");
    previewErrors = new Map(previewErrors);
    previewState.set(id, 'error');
    previewState = new Map(previewState);
  }

  async function handleUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    error = null;
    try {
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });
      addAttachment(repo, { fileName: file.name }, bytes);
      refresh();
      onMutate();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Upload failed";
    } finally {
      uploading = false;
      input.value = "";
    }
  }

  function handleDownload(entry: AttachmentEntry) {
    if (!entry.documentId) return;
    error = null;
    try {
      const bytes = getAttachmentBytes(repo, entry.documentId);
      const blob = new Blob([Uint8Array.from(bytes)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.path.split("/").at(-1) ?? entry.path;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Download failed";
    }
  }
</script>

<div class="attachments-panel" data-testid="attachments-panel">
  {#if error}
    <p class="attachments-panel__error" role="alert">{error}</p>
  {/if}
  {#if result.entries.length === 0}
    <p class="attachments-panel__empty">No attachments yet.</p>
  {:else}
    <ul class="attachments-panel__list" data-testid="attachments-list">
      {#each result.entries as entry (entry.path)}
        <li class="attachments-panel__item" data-testid="attachment-item">
          <span class="attachments-panel__name" title={entry.path}>
            {entry.title ?? entry.path.split("/").at(-1) ?? entry.path}
          </span>
          <span class="attachments-panel__id" title={entry.documentId ?? ""}>
            {entry.documentId ? entry.documentId.slice(0, 8) + "…" : "—"}
          </span>
          {#if entry.documentId}
            <button
              class="attachments-panel__btn"
              data-testid="attachment-download-btn"
              aria-label="Download {entry.title ?? entry.path.split('/').at(-1) ?? entry.path}"
              onclick={() => handleDownload(entry)}
            >↓</button>
            <button
              class="attachments-panel__btn attachments-panel__btn--preview"
              data-testid="attachment-preview-btn"
              aria-label="Preview {entry.title ?? entry.path.split('/').at(-1) ?? entry.path}"
              disabled={previewState.get(entry.documentId) === 'loading'}
              onclick={() => togglePreview(entry)}
            >{previewState.get(entry.documentId) === 'loaded' ? 'Hide' : 'Preview'}</button>
          {/if}
          {#if entry.documentId && previewState.get(entry.documentId) === 'loading'}
            <span class="attachments-panel__preview-status" data-testid="attachment-preview-loading">Loading…</span>
          {/if}
          {#if entry.documentId && previewState.get(entry.documentId) === 'error'}
            <span class="attachments-panel__preview-status attachments-panel__preview-status--error" data-testid="attachment-preview-error">
              {previewErrors.get(entry.documentId) ?? "Cannot display as image"}
            </span>
          {/if}
          {#if entry.documentId && previewState.get(entry.documentId) === 'loaded' && previewUrls.get(entry.documentId)}
            <img
              class="attachments-panel__thumbnail"
              data-testid="attachment-preview-img"
              src={previewUrls.get(entry.documentId)}
              alt={entry.title ?? entry.path.split("/").at(-1) ?? entry.path}
              onerror={() => handlePreviewError(entry)}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <label class="attachments-panel__upload" data-testid="attachments-upload-label">
    {#if uploading}Uploading…{:else}Add file{/if}
    <input
      type="file"
      class="attachments-panel__file-input"
      data-testid="attachments-file-input"
      disabled={uploading}
      onchange={handleUpload}
    />
  </label>
  <p class="attachments-panel__note" data-testid="attachments-persistence-note">
    Attachment bytes are only preserved in .srs archive exports.
  </p>
</div>

<style>
  .attachments-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .attachments-panel__error {
    color: #c00;
    font-size: 0.8em;
    margin: 0;
  }
  .attachments-panel__empty {
    color: var(--color-muted, #888);
    font-size: 0.85em;
    margin: 0;
  }
  .attachments-panel__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .attachments-panel__item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 0.85em;
    flex-wrap: wrap;
  }
  .attachments-panel__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .attachments-panel__id {
    color: var(--color-muted, #888);
    font-family: monospace;
    font-size: 0.9em;
  }
  .attachments-panel__btn {
    background: none;
    border: 1px solid currentColor;
    border-radius: 3px;
    cursor: pointer;
    padding: 1px 4px;
    font-size: 0.85em;
    flex-shrink: 0;
  }
  .attachments-panel__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .attachments-panel__preview-status {
    font-size: 0.85em;
    color: var(--color-muted, #888);
    flex-basis: 100%;
  }
  .attachments-panel__preview-status--error {
    color: #c00;
  }
  .attachments-panel__thumbnail {
    max-width: 100%;
    max-height: 200px;
    border-radius: 4px;
    border: 1px solid var(--color-border, #ccc);
    display: block;
    flex-basis: 100%;
    object-fit: contain;
  }
  .attachments-panel__upload {
    display: inline-block;
    cursor: pointer;
    font-size: 0.85em;
    padding: 3px 8px;
    border: 1px solid currentColor;
    border-radius: 4px;
    align-self: flex-start;
  }
  .attachments-panel__file-input {
    display: none;
  }
  .attachments-panel__note {
    color: var(--color-muted, #888);
    font-size: 0.75em;
    margin: 2px 0 0;
  }
</style>
