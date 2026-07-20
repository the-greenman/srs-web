<!-- AttachmentsPanel.svelte — list repo attachments and upload new files (srs-web#99) -->
<script lang="ts">
  import { listAttachments, addAttachment, getAttachmentBytes } from "$lib/srs-client.js";
  import type {
    SrsRepository,
    AttachmentListResult,
    AttachmentEntry,
  } from "$lib/srs-client.js";

  interface Props {
    repo: SrsRepository;
    onMutate: () => void;
    onCountChange: (count: number) => void;
  }
  let { repo, onMutate, onCountChange }: Props = $props();

  let result = $state<AttachmentListResult>({ sourceDocumentsPath: "", entries: [] });
  let error = $state<string | null>(null);
  let uploading = $state(false);

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
    align-items: center;
    gap: 6px;
    font-size: 0.85em;
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
