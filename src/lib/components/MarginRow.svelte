<!--
  MarginRow — one row of an AnnotationMargin: a mark on the shared left edge, then (expanded) a
  clamped label. Hover or focus highlights the owning paragraph (`.block[data-annotation-hover]`)
  and, when `card` is set, shows the full text in a HoverCard (attachments already have their own
  card on the glyph). Presentation only. Wraps .margin__item (margin.css).
-->
<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import HoverCard from './HoverCard.svelte';
  import { hoverBridge } from './hover-bridge.js';

  let {
    kind,
    label,
    text = '',
    card = false,
    children,
  }: {
    /** Short kind line for the card (the relation type, "shared"). */
    kind: string;
    /** The visible label (clamped) and the card's title. */
    label: string;
    /** Expanded form: show the label next to the mark. */
    text?: string;
    card?: boolean;
    /** The mark. */
    children: Snippet;
  } = $props();

  let row = $state<HTMLElement>();
  let cardOpen = $state(false);
  const hover = hoverBridge((o) => (cardOpen = o && card));
  const highlight = (on: boolean) =>
    on ? row?.closest('.block')?.setAttribute('data-annotation-hover', '') : row?.closest('.block')?.removeAttribute('data-annotation-hover');
  onDestroy(() => {
    hover.destroy();
    highlight(false);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="margin__item"
  data-part="row"
  bind:this={row}
  onmouseenter={() => {
    highlight(true);
    hover.show();
  }}
  onmouseleave={() => {
    highlight(false);
    hover.hide();
  }}
  onfocusin={() => {
    highlight(true);
    hover.show();
  }}
  onfocusout={() => {
    highlight(false);
    hover.hide();
  }}
>
  {@render children()}
  {#if text}<span class="margin__text" data-part="label" title={label}>{text}</span>{/if}
  {#if card}<HoverCard {kind} title={label} bind:open={cardOpen} anchor={row} />{/if}
</div>
