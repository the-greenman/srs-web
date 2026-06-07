<!--
  AppShell — the three-pane grid (nav | main | inspector). Each region is a
  snippet; the inspector is optional and collapses on narrow viewports via CSS.
  Wraps .app (src/styles/layout.css).
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
import type { Snippet } from "svelte";

const {
  nav,
  main,
  inspector,
}: {
  nav: Snippet;
  main: Snippet;
  inspector?: Snippet;
} = $props();
</script>

<div class="app">
  {@render nav()}
  {@render main()}
  {#if inspector}{@render inspector()}{/if}
</div>
