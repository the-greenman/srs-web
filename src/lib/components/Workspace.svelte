<!--
  Workspace — the scrolling content area with a centred reading/edit canvas.
  The canvas is capped by the one `--content-max` token (Wide swaps in the wider cap on the shell). Wraps .workspace/.canvas
  (src/styles/layout.css).
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
  }: {
    children?: Snippet;
  } = $props();
</script>

<div class="workspace">
  <div class="canvas">{@render children?.()}</div>
</div>
