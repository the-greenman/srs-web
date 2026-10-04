<!--
  MarkdownView — read-only rendered markdown: the ONE `{@html renderMarkdown(...)}` site for
  display (CommentThread, PinnedPane). The core renderMarkdown output is already sanitized, so
  nothing here escapes or filters. MarkdownText keeps its own render on its contenteditable element
  (a documented exception: it is an editor, and moving it would change Block's DOM).
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { renderMarkdown } from '$lib/srs-client.js';

  let { value, class: klass = '', ...rest }: { value: string; class?: string } & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={`md-view ${klass}`} {...rest}>{@html renderMarkdown(value)}</div>
