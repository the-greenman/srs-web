<!--
  BinTray — paragraphs deleted from the essay. Restore puts one back at the end of the essay;
  Delete permanently removes it for good (the shell confirms). Shares the draft tray stylesheet.
  Issue: https://github.com/the-greenman/srs-web/issues/397
-->
<script lang="ts">
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

<section class="bin-tray" aria-label="Bin" data-testid="bin">
  {#if items.length === 0}<p class="bin-tray__empty">Deleted paragraphs wait here.</p>{/if}
  {#each items as d (d.id)}
    <div class="bin-tray__row" data-testid="bin-row">
      <span class="bin-tray__label">{d.label}</span>
      <button type="button" class="bin-tray__put" aria-label={`Restore ${d.label}`} onclick={() => onrestore(d.id)}>Restore</button>
      <button type="button" class="bin-tray__put" aria-label={`Delete ${d.label} permanently`} onclick={() => onforget(d.id)}>Delete permanently</button>
    </div>
  {/each}
</section>
