<!--
  AttachmentGlyph — a small mark for one thing attached to a paragraph. The mark is the
  icon of `kind`, in the hue of the actor who attached it (--actor-hue, the one actorHue function;
  neutral when there is none). Hover or focus
  shows a HoverCard (a manual popover; a short close delay bridges the gap to the card, so
  Remove link stays reachable); click toggles `pinned`. Wraps .glyph (attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { actorHue } from '$lib/actor-hue.js';
  import type { Actor } from '$lib/srs-client.js';
  import { iconFor } from './annotation-icons.js';
  import HoverCard from './HoverCard.svelte';
  import { hoverBridge } from './hover-bridge.js';

  let {
    kind,
    title,
    text = '',
    relation = '',
    actor,
    pinned = false,
    onpin,
    onremove,
    ondownload,
  }: { kind: string; title: string; text?: string; relation?: string; actor?: Actor; pinned?: boolean; onpin?: () => void; onremove?: () => void; ondownload?: () => void } = $props();

  const Icon = $derived(iconFor(kind));

  // The card is a top-layer sibling inside this wrapper, so enter/leave on the wrapper covers both.
  let cardOpen = $state(false);
  let wrap = $state<HTMLElement>();
  const hover = hoverBridge((o) => (cardOpen = o));
  onDestroy(hover.destroy);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="glyph-wrap"
  data-part="mark"
  bind:this={wrap}
  onmouseenter={hover.show}
  onmouseleave={hover.hide}
  onfocusin={hover.show}
  onfocusout={hover.hide}
  onkeydown={(e) => {
    if (e.key === 'Escape' && cardOpen) {
      e.stopPropagation(); // closes the card only, not the shell's zoom
      hover.close();
    }
  }}
>
  <button
    type="button"
    class="glyph hue-pill"
    class:hue-pill--solid={pinned}
    class:hue-pill--neutral={!actor?.id}
    style:--actor-hue={actor?.id ? actorHue(actor.id) : undefined}
    aria-pressed={onpin ? pinned : undefined}
    aria-label={`${kind}${relation ? ` (${relation})` : ''}: ${title}${onpin ? `. ${pinned ? 'Unpin' : 'Pin'}` : ''}`}
    onclick={onpin}
  ><Icon size={14} aria-hidden="true" /></button>
  <HoverCard {kind} {title} {text} {relation} {onremove} {ondownload} bind:open={cardOpen} anchor={wrap} />
</span>
