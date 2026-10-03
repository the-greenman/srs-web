<!--
  InspectorSection — a titled block in the inspector rail, with an optional
  right-aligned aside (e.g. a count or "clean"). A static <Panel>; keeps the
  .inspector__section frame (src/styles/components/inspector.css).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Panel from './Panel.svelte';

  let {
    title,
    aside,
    grow = false,
    children,
  }: {
    title: string;
    aside?: string;
    /** Stretch this section to fill remaining inspector height. */
    grow?: boolean;
    children?: Snippet;
  } = $props();
</script>

<Panel {title} {aside} collapsible={false} class={grow ? 'inspector__section inspector__section--grow' : 'inspector__section'}>
  {@render children?.()}
</Panel>
