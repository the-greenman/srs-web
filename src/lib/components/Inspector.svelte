<!--
  Inspector — the right rail container holding stacked InspectorSections
  (validation, lifecycle, metadata). Wraps .inspector
  (src/styles/components/inspector.css).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
import type { Snippet } from "svelte";

const {
  label = "Inspector",
  children,
}: {
  label?: string;
  children?: Snippet;
} = $props();
</script>

<aside class="inspector app__inspector" aria-label={label}>
  {@render children?.()}
</aside>
