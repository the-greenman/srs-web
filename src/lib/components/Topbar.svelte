<!--
  Topbar — the breadcrumb + contextual actions bar (a plain flex row above the shell's ONE scroller).
  Both regions are snippets. Inside an AppShell it renders the drawer triggers itself (NavTrigger
  first, InspectorTrigger last); outside one it renders none. Goes away when the last shell moves to
  Toolbar (#424 PR-B). Wraps .topbar (src/styles/layout.css).
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import InspectorTrigger from './InspectorTrigger.svelte';
  import NavTrigger from './NavTrigger.svelte';

  let {
    crumb,
    actions,
  }: {
    crumb?: Snippet;
    actions?: Snippet;
  } = $props();
</script>

<div class="topbar">
  <NavTrigger />
  <div class="topbar__crumb">{@render crumb?.()}</div>
  {#if actions}<div class="topbar__actions">{@render actions()}</div>{/if}
  <InspectorTrigger />
</div>
