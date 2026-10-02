<!--
  DraftTray — paragraphs pulled out of the essay. Drag a paragraph here to pull it out, drag
  one back onto the essay to put it back; the "Put back" button is the keyboard alternative.
  Built on BlockStack. Wraps .draft-tray (src/styles/components/draft-tray.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import BlockStack from './BlockStack.svelte';
  import type { DropTarget } from './BlockStack.svelte';
  import type { DragPayload } from './dnd';

  export interface DraftItem {
    id: string;
    label: string;
  }

  let {
    items,
    available = true,
    unavailableReason = 'No draft area for this essay.',
    ondrop,
    onputback,
    oncreate,
  }: {
    items: DraftItem[];
    /** False when the essay has no draft container yet. */
    available?: boolean;
    unavailableReason?: string;
    ondrop: (payload: DragPayload, target: DropTarget) => void;
    onputback: (id: string) => void;
    oncreate?: () => void;
  } = $props();

  const byId = $derived(new Map(items.map((i) => [i.id, i])));
</script>

<section class="draft-tray" aria-label="Draft tray">
  <h2 class="draft-tray__title">Draft</h2>
  {#if !available}
    <p class="draft-tray__empty">{unavailableReason}</p>
    {#if oncreate}<button type="button" class="btn btn--mono" onclick={oncreate}>Create draft area</button>{/if}
  {:else}
    {#if items.length === 0}<p class="draft-tray__empty">Drag paragraphs here to set them aside.</p>{/if}
    <BlockStack items={items.map((i) => ({ id: i.id, depth: 0 }))} source="draft" label="Draft paragraphs" {ondrop}>
      {#snippet row(item, handle)}
        {@const d = byId.get(item.id)}
        {#if d}
          <div class="draft-tray__row">
            <span class="draft-tray__label" aria-roledescription="drag handle" {...handle}>{d.label}</span>
            <button type="button" class="draft-tray__put" aria-label={`Put back ${d.label}`} onclick={() => onputback(d.id)}>Put back</button>
          </div>
        {/if}
      {/snippet}
    </BlockStack>
  {/if}
</section>
