<!--
  Main — the centre column wrapper (.app__main). Renders, in real DOM order (tab and reading order, no CSS
  `order`): the shell's bar (the Toolbar, passed as the `bar` snippet), the NoticeRegion (pinned
  document notices), then the content (whose .workspace is the one scroller). It also hosts the one toast
  system: LiveRegions (always rendered) and the ToastHost (#441, ADR-020 j). One Main is mounted at a time,
  so there is one ToastHost per app.
  Wraps .app__main (src/styles/layout.css).
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import LiveRegions from './LiveRegions.svelte';
  import NoticeRegion from './NoticeRegion.svelte';
  import ToastHost from './ToastHost.svelte';
  let { bar, children }: { bar?: Snippet; children?: Snippet } = $props();
</script>

<main class="app__main">
  {@render bar?.()}
  <NoticeRegion />
  {@render children?.()}
  <LiveRegions />
  <ToastHost />
</main>
