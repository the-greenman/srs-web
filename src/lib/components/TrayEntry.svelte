<!--
  TrayEntry — one thing to read in a tray (ReferencesTray, NotesTray): the kind line, the whole title
  (wrapped, never cut), two lines of `preview`, then the `actions`. The title opens the full text in
  place; `read` is called only while it is open. A quotation's `source` shows its passage highlighted.
  Wraps .tray-entry (draft-tray.css). Issue: https://github.com/the-greenman/srs-web/issues/787
-->
<script lang="ts" module>
  /** The whole text of an entry; `source`: a quotation's source text, holding `passage`. */
  export interface EntryText {
    text: string;
    source?: { title: string; text: string; passage: string };
  }
</script>

<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import type { Snippet } from 'svelte';
  import MarkdownView from './MarkdownView.svelte';

  let {
    kind,
    title,
    preview = '',
    read,
    actions,
  }: {
    kind: string;
    title: string;
    preview?: string;
    read: () => EntryText;
    actions?: Snippet;
  } = $props();

  let open = $state(false);
</script>

<div class="tray-entry" data-part="row">
  <span class="tray-entry__kind" data-part="kind">{kind}</span>
  <button type="button" class="tray-entry__title" data-part="title" data-testid="entry-title" aria-expanded={open} onclick={() => (open = !open)}>
    {#if open}<ChevronDown size={14} aria-hidden="true" />{:else}<ChevronRight size={14} aria-hidden="true" />{/if}
    <span>{title}</span>
  </button>
  {#if open}
    {@const full = read()}
    <!-- Long texts scroll inside the entry, so the keyboard must reach them. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="tray-entry__full" data-part="full" data-testid="entry-full" role="region" aria-label={title} tabindex="0">
      {#if full.text}<MarkdownView value={full.text} />{:else}<p class="tray__empty">No text to show here.</p>{/if}
      {#if full.source}
        <p class="tray-entry__source" data-testid="entry-source-title">From {full.source.title}</p>
        <MarkdownView data-testid="entry-source" value={full.source.text} mark={full.source.passage} />
      {/if}
    </div>
  {:else if preview}
    <p class="tray-entry__preview" data-part="preview" data-testid="entry-preview">{preview}</p>
  {/if}
  {#if actions}<div class="tray__actions" data-part="actions">{@render actions()}</div>{/if}
</div>
