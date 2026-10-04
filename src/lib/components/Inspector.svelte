<!--
  Inspector — the right rail container holding stacked Panels (class inspector__section).
  Inside an AppShell it carries a ResizeHandle on its left edge, and
  supports an `open` prop to override the responsive hide rule (used by
  GuidesShell's narrow-screen toggle).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
  srs-web#39: resizable + narrow-screen toggle
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getShell } from '../shell-context.svelte.js';
  import ResizeHandle from './ResizeHandle.svelte';

  let {
    label = 'Inspector',
    open = false,
    children,
  }: {
    label?: string;
    /** Force-show on narrow screens (overrides the responsive hide). */
    open?: boolean;
    children?: Snippet;
  } = $props();

  const shell = getShell();
  const uid = $props.id();
</script>

<aside
  class="inspector app__inspector"
  class:inspector--open={open}
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
