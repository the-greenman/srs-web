<!--
  Workspace — the scrolling content area with a centred reading/edit canvas.
  Set `wide` to use the full width (e.g. tables). Wraps .workspace/.canvas
  (src/styles/layout.css).
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    wide = false,
    children,
  }: {
    wide?: boolean;
    children?: Snippet;
  } = $props();
</script>

<div class="workspace">
  <div class="canvas" class:canvas--wide={wide}>{@render children?.()}</div>
</div>
