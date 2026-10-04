<!--
  AttachmentPreview — the kind line, title and (optionally clamped) text of one attachment.
  Shared by HoverCard (the margin glyph's preview) and PinnedPane items, so the two cannot drift.
  Wraps .attachment-preview (src/styles/components/attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  let {
    kind,
    title,
    text = '',
    relation = '',
    clamp = false,
  }: { kind: string; title: string; text?: string; relation?: string; /** Limit the text to three lines (pinned list). */ clamp?: boolean } = $props();
</script>

<span class="attachment-preview__kind" data-part="kind">{relation ? `${kind} · ${relation}` : kind}</span>
<strong class="attachment-preview__title" data-part="title">{title}</strong>
{#if text}<p class="attachment-preview__text" class:attachment-preview__text--clamp={clamp} data-part="text">{text}</p>{/if}
