<!--
  LayersPanel — the essay outline as a layers tree (Photoshop model): eye toggle per layer,
  fold chevron for groups, drag a row to reorder (middle of a row = nest under it), Alt+Arrows
  as the keyboard alternative. Nesting is layout, not meaning. A group moves with its run.
  Built on BlockStack. Wraps .layers (src/styles/components/layers.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import BlockStack from './BlockStack.svelte';
  import type { DropTarget } from './BlockStack.svelte';
  import EyeToggle from './EyeToggle.svelte';
  import { keyMove } from './dnd';
  import type { DragPayload, KeyMove } from './dnd';

  export interface Layer {
    id: string;
    depth: number;
    label: string;
    hidden: boolean;
    /** Hidden only by an ancestor (greyed eye). */
    inherited: boolean;
    hasChildren: boolean;
    folded: boolean;
  }

  let {
    layers,
    ondrop,
    candrop,
    onhide,
    onfold,
    onselect,
    onkey,
  }: {
    layers: Layer[];
    ondrop: (payload: DragPayload, target: DropTarget) => void;
    candrop?: (dragId: string, targetId: string) => boolean;
    onhide: (id: string, hidden: boolean) => void;
    onfold: (id: string, folded: boolean) => void;
    onselect: (id: string) => void;
    onkey: (id: string, move: KeyMove) => void;
  } = $props();

  const byId = $derived(new Map(layers.map((l) => [l.id, l])));
</script>

<section class="layers" aria-label="Layers">
  <h2 class="layers__title">Layers</h2>
  <BlockStack items={layers} source="essay" nest label="Layers" {ondrop} {candrop}>
    {#snippet row(item, handle)}
      {@const l = byId.get(item.id)}
      {#if l}
        <div class="layers__row" class:is-off={l.hidden || l.inherited}>
          {#if l.hasChildren}
            <button
              type="button"
              class="layers__fold"
              aria-expanded={!l.folded}
              aria-label={`${l.folded ? 'Expand' : 'Collapse'} ${l.label}`}
              onclick={() => onfold(l.id, !l.folded)}
            >{l.folded ? '▸' : '▾'}</button>
          {:else}<span class="layers__fold" aria-hidden="true"></span>{/if}
          <EyeToggle hidden={l.hidden} inherited={l.inherited} label={l.label} onclick={() => onhide(l.id, !l.hidden)} />
          <button
            type="button"
            class="layers__label"
            aria-roledescription="drag handle"
            aria-label={`${l.label}. Enter focuses the paragraph; Alt plus arrow keys reorder and change level.`}
            data-focus-key={`layer:${l.id}`}
            onclick={() => onselect(l.id)}
            onkeydown={(e) => {
              const m = keyMove(e);
              if (m) {
                e.preventDefault();
                onkey(l.id, m);
              }
            }}
            {...handle}
          >{l.label}</button>
        </div>
      {/if}
    {/snippet}
  </BlockStack>
</section>
