<!--
  AttachmentGlyph — a small mark for one thing attached to a paragraph. The mark is the first
  letter of `kind` on a hue derived from `kind`, so kinds need no registry. Hover or focus
  shows a HoverCard (CSS only); click toggles `pinned`. Wraps .glyph (attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  import HoverCard from './HoverCard.svelte';

  let {
    kind,
    title,
    text = '',
    pinned = false,
    onpin,
  }: { kind: string; title: string; text?: string; pinned?: boolean; onpin?: () => void } = $props();

  // Stable 0-359 hue from the kind string (same kind, same colour, in every session).
  const hue = $derived([...kind].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

<span class="glyph-wrap">
  <button
    type="button"
    class="glyph"
    class:is-pinned={pinned}
    style:--glyph-hue={hue}
    aria-pressed={pinned}
    aria-label={`${kind}: ${title}. ${pinned ? 'Unpin' : 'Pin'}`}
    onclick={onpin}
  >{kind.charAt(0).toUpperCase()}</button>
  <HoverCard {kind} {title} {text} />
</span>
