<!--
  NotesTray — the conversation behind an essay: its notes (Tier-0 vignettes) in container order, apart
  from the essay's records. Each row shows the note's title, a "→ …" chip per record derived from it, and
  Open, which pins the note's words beside the text. Read-only: notes are written by agents and chats.
  Shares the tray stylesheet (draft-tray.css).
  Issue: https://github.com/the-greenman/srs-web/issues/624
-->
<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import IconButton from './IconButton.svelte';
  import TrayRow from './TrayRow.svelte';

  export interface NoteItem {
    id: string;
    title: string;
    /** The records derived from this note. */
    produced: { id: string; label: string }[];
  }

  let { items, onopen, onopenrecord }: {
    items: NoteItem[];
    onopen: (id: string) => void;
    /** Absent: the produced records are listed as text, not chips. */
    onopenrecord?: (id: string) => void;
  } = $props();
</script>

<section class="tray notes-tray" aria-label="Notes" data-testid="notes">
  {#if items.length === 0}<p class="tray__empty">The notes of the conversation this essay grew from wait here. An agent or a chat adds them as vignettes.</p>{/if}
  {#each items as n (n.id)}
    <div class="notes-tray__item" data-testid="note-row">
      <TrayRow label={n.title}>
        {#snippet actions()}
          <IconButton icon={BookOpen} variant="outline" label={`Open ${n.title}`} onclick={() => onopen(n.id)} />
        {/snippet}
      </TrayRow>
      {#if n.produced.length}
        <div class="tray__chips">
          {#each n.produced as r (r.id)}
            {#if onopenrecord}
              <button type="button" class="tray__chip" data-testid="note-produced" onclick={() => onopenrecord(r.id)}>→ {r.label}</button>
            {:else}
              <span class="tray__chip" data-testid="note-produced">→ {r.label}</span>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</section>
