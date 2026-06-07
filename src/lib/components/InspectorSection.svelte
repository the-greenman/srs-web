<!--
  InspectorSection — a titled block in the inspector rail, with an optional
  right-aligned aside (e.g. a count or "clean"). Wraps .inspector__section
  (src/styles/components/inspector.css).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    aside,
    children,
  }: {
    title: string;
    aside?: string;
    children?: Snippet;
  } = $props();
</script>

<section class="inspector__section">
  <div class="inspector__title">
    {title}{#if aside}<span class="inspector__title-aside">{aside}</span>{/if}
  </div>
  {@render children?.()}
</section>
