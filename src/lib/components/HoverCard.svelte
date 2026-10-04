<!--
  HoverCard — a small read-only preview card (kind, title, text). Presentation only; its host
  decides when it shows (AttachmentGlyph reveals it on hover/focus with CSS). PinnedPane entries
  reuse its text classes. Wraps .hover-card (src/styles/components/attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  let {
    kind,
    title,
    text = '',
    relation = '',
    onremove,
    class: className = '',
  }: { kind: string; title: string; text?: string; relation?: string; onremove?: () => void; class?: string } = $props();
</script>

<div class="hover-card {className}" role="tooltip">
  <span class="hover-card__kind">{relation ? `${kind} · ${relation}` : kind}</span>
  <strong class="hover-card__title">{title}</strong>
  {#if text}<p class="hover-card__text">{text}</p>{/if}
  {#if onremove}<button type="button" class="hover-card__remove" onclick={onremove}>Remove link</button>{/if}
</div>
