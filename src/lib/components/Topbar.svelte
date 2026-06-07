<!--
  Topbar — sticky breadcrumb + contextual actions. Both regions are snippets.
  Wraps .topbar (src/styles/layout.css).
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    crumb,
    actions,
  }: {
    crumb?: Snippet;
    actions?: Snippet;
  } = $props();
</script>

<div class="topbar">
  <div class="topbar__crumb">{@render crumb?.()}</div>
  {#if actions}<div class="topbar__actions">{@render actions()}</div>{/if}
</div>
