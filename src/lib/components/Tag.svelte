<!--
  Tag — governance lifecycle status chip.
  Thin wrapper over .tag / .tag--<status> (src/styles/components/tag.css).
  B11 lifecycle/supersession: https://github.com/the-greenman/srs-web/issues/7
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Status } from '../types';

  let {
    status,
    onDark = false,
    children,
  }: {
    status: Status;
    /** Render on an ink surface (record header). */
    onDark?: boolean;
    children?: Snippet;
  } = $props();
</script>

<span class="tag tag--{status}" class:tag--on-dark={onDark}>
  {#if children}{@render children()}{:else}{status}{/if}
</span>
