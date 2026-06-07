<!--
  NavGroup — a labelled cluster of NavItems in the rail.
  Wraps .nav__group (src/styles/components/nav.css).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { label, children }: { label: string; children?: Snippet } = $props();
</script>

<div class="nav__group">
  <div class="nav__group-label">{label}</div>
  {@render children?.()}
</div>
