<!--
  BinTray — paragraphs deleted from the essay. Restore puts one back at the end of the essay;
  Delete permanently removes it for good (the shell confirms). Shares the tray stylesheet (draft-tray.css).
  Issue: https://github.com/the-greenman/srs-web/issues/397
-->
<script lang="ts">
  import Trash from '@lucide/svelte/icons/trash';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import IconButton from './IconButton.svelte';
  import TrayRow from './TrayRow.svelte';

  let {
    items,
    onrestore,
    onforget,
  }: {
    items: { id: string; label: string }[];
    onrestore: (id: string) => void;
    onforget: (id: string) => void;
  } = $props();
</script>

<section class="tray bin-tray" aria-label="Bin" data-testid="bin">
  {#if items.length === 0}<p class="tray__empty">Deleted paragraphs wait here.</p>{/if}
  {#each items as d (d.id)}
    <TrayRow label={d.label} data-testid="bin-row">
      {#snippet actions()}
        <IconButton icon={Undo2} variant="outline" label={`Restore ${d.label}`} onclick={() => onrestore(d.id)} />
        <IconButton icon={Trash} variant="outline" label={`Delete ${d.label} permanently`} onclick={() => onforget(d.id)} />
      {/snippet}
    </TrayRow>
  {/each}
</section>
