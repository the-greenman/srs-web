<!--
  AttachmentGlyph — a small mark for one thing attached to a paragraph. The mark is the first
  letter of `kind` on a hue derived from `kind`, so kinds need no registry. Hover or focus
  shows a HoverCard (a manual popover; a short close delay bridges the gap to the card, so
  Remove link stays reachable); click toggles `pinned`. Wraps .glyph (attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import HoverCard from './HoverCard.svelte';

  /** Close delay after the pointer or focus leaves the glyph and card (the one place it lives). */
  const CLOSE_DELAY_MS = 150;

  let {
    kind,
    title,
    text = '',
    relation = '',
    pinned = false,
    onpin,
    onremove,
  }: { kind: string; title: string; text?: string; relation?: string; pinned?: boolean; onpin?: () => void; onremove?: () => void } = $props();

  // Stable 0-359 hue from the kind string (same kind, same colour, in every session).
  const hue = $derived([...kind].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));

  // The card is a top-layer sibling inside this wrapper, so enter/leave on the wrapper covers both.
  let cardOpen = $state(false);
  let wrap = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = () => {
    clearTimeout(timer);
    cardOpen = true;
  };
  const hide = () => {
    clearTimeout(timer);
    timer = setTimeout(() => (cardOpen = false), CLOSE_DELAY_MS);
  };
  onDestroy(() => clearTimeout(timer));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="glyph-wrap"
  bind:this={wrap}
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
  onkeydown={(e) => {
    if (e.key === 'Escape' && cardOpen) {
      e.stopPropagation(); // closes the card only, not the shell's zoom
      cardOpen = false;
    }
  }}
>
  <button
    type="button"
    class="glyph"
    class:is-pinned={pinned}
    style:--glyph-hue={hue}
    aria-pressed={pinned}
    aria-label={`${kind}${relation ? ` (${relation})` : ''}: ${title}. ${pinned ? 'Unpin' : 'Pin'}`}
    onclick={onpin}
  >{kind.charAt(0).toUpperCase()}</button>
  <HoverCard {kind} {title} {text} {relation} {onremove} bind:open={cardOpen} anchor={wrap} />
</span>
