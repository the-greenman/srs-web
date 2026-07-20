<!-- AttachmentLinkPanel.svelte — show and link attachments for a selected record (srs-web#99) -->
<script lang="ts">
  import {
    getRecordAttachments,
    listAttachments,
    linkAttachment,
    getAttachmentBytes,
  } from "$lib/srs-client.js";
  import type {
    SrsRepository,
    GetRecordAttachmentsResult,
    ResolvedAttachment,
    AttachmentEntry,
  } from "$lib/srs-client.js";

  interface Props {
    repo: SrsRepository;
    instanceId: string;
    onMutate: () => void;
    onCountChange: (count: number) => void;
  }
  let { repo, instanceId, onMutate, onCountChange }: Props = $props();

  let linked = $state<ResolvedAttachment[]>([]);
  let allEntries = $state<AttachmentEntry[]>([]);
  let error = $state<string | null>(null);
  let linking = $state(false);

  function refresh() {
    error = null;
    try {
      const fetched: GetRecordAttachmentsResult | null = getRecordAttachments(repo, { instanceId });
      const attachments = fetched?.attachments ?? [];
      linked = attachments;
      onCountChange(attachments.length);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to load linked attachments";
      onCountChange(0);
    }
    try {
      const list = listAttachments(repo);
      allEntries = list.entries;
    } catch {
      allEntries = [];
    }
  }

  $effect(() => {
    void instanceId;
    refresh();
  });

  function isLinked(documentId: string): boolean {
    return linked.some((a) => a.documentId === documentId);
  }

  async function handleLink(documentId: string) {
    linking = true;
    error = null;
    try {
      linkAttachment(repo, { instanceId, documentId });
      refresh();
      onMutate();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Link failed";
    } finally {
      linking = false;
    }
  }

  function handleDownload(attachment: ResolvedAttachment) {
    error = null;
    try {
      const bytes = getAttachmentBytes(repo, attachment.documentId);
      const blob = new Blob([Uint8Array.from(bytes)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const name = attachment.contentPath?.split("/").at(-1) ?? attachment.documentId;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Download failed";
    }
  }
</script>

<div class="link-panel" data-testid="attachment-link-panel">
  {#if error}
    <p class="link-panel__error" role="alert">{error}</p>
  {/if}

  {#if linked.length === 0}
    <p class="link-panel__empty">No attachments linked to this record.</p>
  {:else}
    <ul class="link-panel__list" data-testid="linked-attachments-list">
      {#each linked as attachment (attachment.documentId)}
        <li class="link-panel__item" data-testid="linked-attachment-item">
          <span class="link-panel__name" title={attachment.contentPath ?? attachment.documentId}>
            {attachment.title ?? attachment.contentPath?.split("/").at(-1) ?? attachment.documentId}
          </span>
          <button
            class="link-panel__btn"
            data-testid="linked-attachment-download-btn"
            aria-label="Download {attachment.title ?? attachment.documentId}"
            onclick={() => handleDownload(attachment)}
          >↓</button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if allEntries.length > 0}
    <details class="link-panel__picker" data-testid="attachment-link-picker">
      <summary class="link-panel__summary">Link existing attachment</summary>
      <ul class="link-panel__all-list">
        {#each allEntries as entry (entry.path)}
          {@const alreadyLinked = entry.documentId ? isLinked(entry.documentId) : false}
          <li class="link-panel__all-item" data-testid="linkable-attachment-item">
            <span class="link-panel__all-name" title={entry.path}>
              {entry.title ?? entry.path.split("/").at(-1) ?? entry.path}
            </span>
            <button
              class="link-panel__btn"
              data-testid="link-attachment-btn"
              disabled={alreadyLinked || !entry.documentId || linking}
              aria-label={alreadyLinked ? "Already linked" : "Link this attachment"}
              onclick={() => entry.documentId && handleLink(entry.documentId)}
            >{alreadyLinked ? "✓" : "Link"}</button>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>

<style>
  .link-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .link-panel__error {
    color: #c00;
    font-size: 0.8em;
    margin: 0;
  }
  .link-panel__empty {
    color: var(--color-muted, #888);
    font-size: 0.85em;
    margin: 0;
  }
  .link-panel__list,
  .link-panel__all-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .link-panel__item,
  .link-panel__all-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85em;
  }
  .link-panel__name,
  .link-panel__all-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link-panel__btn {
    background: none;
    border: 1px solid currentColor;
    border-radius: 3px;
    cursor: pointer;
    padding: 1px 6px;
    font-size: 0.85em;
    flex-shrink: 0;
  }
  .link-panel__btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .link-panel__picker {
    margin-top: 4px;
  }
  .link-panel__summary {
    font-size: 0.85em;
    cursor: pointer;
    color: var(--color-muted, #888);
  }
</style>
