<!--
  ReferencesTray — the essay's collected sources, claims and problems. Each row shows the label, the
  type and a "¶ …" chip per paragraph it is linked to (a chip focuses its paragraph; no chips = not
  linked yet). Open reads the record in the pinned pane (linked references only); Remove takes it out
  of the collection only, never deletes the record. Shares the tray stylesheet (draft-tray.css).
  Issue: https://github.com/the-greenman/srs-web/issues/495
-->
<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import X from '@lucide/svelte/icons/x';
  import IconButton from './IconButton.svelte';
  import TrayRow from './TrayRow.svelte';

  export interface ReferenceItem {
    id: string;
    label: string;
    /** Record type name (source, claim, problem...). */
    type: string;
    /** The paragraphs it is linked to; none = not linked yet. */
    paragraphs: { id: string; label: string }[];
    /** Whether Open has something to show. */
    openable: boolean;
  }

  let {
    items,
    onopen,
    onfocus,
    onremove,
  }: {
    items: ReferenceItem[];
    onopen: (id: string) => void;
    onfocus: (paragraphId: string) => void;
    onremove: (id: string) => void;
  } = $props();
</script>

<section class="tray refs-tray" aria-label="References" data-testid="references">
  {#if items.length === 0}<p class="tray__empty">Sources, claims and problems that agents and attach flows collect for this essay wait here.</p>{/if}
  {#each items as r (r.id)}
    <div class="refs-tray__item" data-testid="reference-row">
      <TrayRow label={`${r.label} (${r.type})`}>
        {#snippet actions()}
          {#if r.openable}<IconButton icon={BookOpen} variant="outline" label={`Open ${r.label}`} onclick={() => onopen(r.id)} />{/if}
          <IconButton icon={X} variant="outline" label={`Remove ${r.label} from references`} onclick={() => onremove(r.id)} />
        {/snippet}
      </TrayRow>
      {#if r.paragraphs.length}
        <div class="tray__chips">
          {#each r.paragraphs as p (p.id)}
            <button type="button" class="tray__chip" data-testid="reference-chip" title={`Go to ${p.label}`} onclick={() => onfocus(p.id)}>¶ {p.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</section>
