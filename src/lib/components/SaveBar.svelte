<!--
  SaveBar — sticky form footer. Shows the unsaved-change count and hosts the
  action buttons (passed as children). Wraps .save-bar
  (src/styles/components/field.css).
  B9 edit forms:        https://github.com/the-greenman/srs-web/issues/5
  B13 validate-on-save: https://github.com/the-greenman/srs-web/issues/9
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    dirtyCount = 0,
    children,
  }: {
    dirtyCount?: number;
    children?: Snippet;
  } = $props();
</script>

<div class="save-bar">
  {#if dirtyCount > 0}
    <span class="save-bar__dirty">
      {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}
    </span>
  {/if}
  <span class="save-bar__spacer"></span>
  {@render children?.()}
</div>
