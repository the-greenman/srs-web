<!--
  NotesTray — the conversation behind an essay: its notes (Tier-0 vignettes) in container order, apart
  from the essay's records. Each row shows the note's whole title and two lines of its words (TrayEntry: the title
  opens all of them in place), a "→ …" chip per record derived from it, and Pin, which keeps the words beside the text. Read-only: notes are written by agents and chats.
  Shares the tray stylesheet (draft-tray.css).
  Issue: https://github.com/the-greenman/srs-web/issues/624, #787
-->
<script lang="ts">
  import Pin from '@lucide/svelte/icons/pin';
  import IconButton from './IconButton.svelte';
  import TrayEntry from './TrayEntry.svelte';

  export interface NoteItem {
    id: string;
    title: string;
    /** The note's words. */
    text: string;
    /** Its opening words, shown under the title. */
    preview?: string;
    /** The records derived from this note. */
    produced: { id: string; label: string }[];
  }

  let { items, onpin, onopenrecord }: {
    items: NoteItem[];
    onpin: (id: string) => void;
    /** Absent: the produced records are listed as text, not chips. */
    onopenrecord?: (id: string) => void;
  } = $props();
</script>

<section class="tray notes-tray" aria-label="Notes" data-testid="notes">
  {#if items.length === 0}<p class="tray__empty">The notes of the conversation this essay grew from wait here. An agent or a chat adds them as vignettes.</p>{/if}
  {#each items as n (n.id)}
    <div class="notes-tray__item" data-testid="note-row">
      <TrayEntry kind="note" title={n.title} preview={n.preview} read={() => ({ text: n.text })}>
        {#snippet actions()}
          <IconButton icon={Pin} variant="outline" label={`Pin ${n.title}`} onclick={() => onpin(n.id)} />
        {/snippet}
      </TrayEntry>
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
