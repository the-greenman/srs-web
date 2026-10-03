<!--
  LayersPanel — the essay outline as a layers tree (Photoshop model): eye toggle per layer,
  fold chevron for groups, drag a row to reorder (middle of a row = nest under it), Alt+Arrows
  as the keyboard alternative, a ⋯ menu per row on touch. Nesting is layout, not meaning. A group moves with its run.
  Built on BlockStack. Wraps .layers (src/styles/components/layers.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import ActionMenu from './ActionMenu.svelte';
  import BlockStack from './BlockStack.svelte';
  import type { DropTarget } from './BlockStack.svelte';
  import EyeToggle from './EyeToggle.svelte';
  import { keyMove } from './dnd';
  import type { DragPayload, KeyMove } from './dnd';
  import { paragraphActions } from '../essay/paragraph-actions.js';

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
    ondelete,
    onfold,
    onselect,
    onkey,
  }: {
    layers: Layer[];
    ondrop: (payload: DragPayload, target: DropTarget) => void;
    candrop?: (dragId: string, targetId: string) => boolean;
    onhide: (id: string, hidden: boolean) => void;
    ondelete?: (id: string) => void;
    onfold: (id: string, folded: boolean) => void;
    onselect: (id: string) => void;
    onkey: (id: string, move: KeyMove) => void;
  } = $props();

  const byId = $derived(new Map(layers.map((l) => [l.id, l])));
</script>

<section class="layers" aria-label="Layers">
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
          <!-- Touch reorder: the same action list as Block's menu (move, indent, hide); the menu is shown on hover:none only. -->
          <ActionMenu
            class="layers__menu action-menu--end"
            testid="layer-menu"
            label={l.label}
            actions={paragraphActions(
              {
                onmove: (d) => onkey(l.id, d),
                onindent: (d) => onkey(l.id, d === 1 ? 'in' : 'out'),
                onhide: (h) => onhide(l.id, h),
                ondelete: ondelete && (() => ondelete(l.id)),
              },
              { label: l.label, hidden: l.hidden, inherited: l.inherited },
            )}
          />
        </div>
      {/if}
    {/snippet}
  </BlockStack>
</section>
