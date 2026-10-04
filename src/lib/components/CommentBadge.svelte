<!--
  CommentBadge — right-margin speech bubble with the size of a paragraph's conversation.
  At 0 it shows "+" and only appears on block hover / focus (see comments.css).
  Presentation only: the shell owns which threads are open.
  Wraps .comment-badge (src/styles/components/comments.css). Story: srs-web#364.
-->
<script lang="ts">
  let {
    count = 0,
    label,
    open = false,
    onclick,
  }: { count?: number; label: string; open?: boolean; onclick: () => void } = $props();
</script>

<button
  type="button"
  class="comment-badge"
  class:is-empty={count === 0}
  aria-label={count === 0 ? `Add a comment on ${label}` : `${count} comment${count === 1 ? '' : 's'} on ${label}`}
  aria-expanded={open}
  data-part="mark"
  data-testid="comment-badge"
  {onclick}
>{count || '+'}</button>
