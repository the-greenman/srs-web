<!--
  Inspector — the right rail container holding stacked Panels (class inspector__section).
  Inside an AppShell it carries a ResizeHandle on its left edge.
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
  srs-web#39: resizable
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getShell } from '../shell-context.svelte.js';
  import ResizeHandle from './ResizeHandle.svelte';

  let {
    label = 'Inspector',
    children,
  }: {
    label?: string;
    children?: Snippet;
  } = $props();

  const shell = getShell();
  const uid = $props.id();
</script>

<aside
  class="inspector app__inspector"
  id="inspector-{uid}"
  aria-label={label}
>
  {#if shell && !shell.inspectorDrawer}
    <ResizeHandle
      kind="inspector"
      value={shell.inspectorWidth}
      controls="inspector-{uid}"
      onchange={(w) => shell.setColumn('inspector', w)}
      oncommit={shell.commitColumns}
    />
  {/if}
  <div class="inspector__body">
    {@render children?.()}
  </div>
</aside>
