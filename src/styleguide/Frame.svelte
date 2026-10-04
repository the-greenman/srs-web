<!--
  Frame — a fixed-width, clipping box for the styleguide, so rail components render at the real
  rail width (--rail-width, 18rem) and a narrow width (15rem). It clips (overflow: hidden) on
  purpose: e2e/styleguide.spec.ts compares every descendant to the frame's edge to catch overflow.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  let { width, caption, children }: { width: string; caption: string; children: Snippet } = $props();
</script>

<figure class="sg__figure">
  <figcaption>{caption}</figcaption>
  <div class="sg__frame" data-testid="sg-frame" data-caption={caption} style:width>
    {@render children()}
  </div>
</figure>
