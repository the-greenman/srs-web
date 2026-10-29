<!--
  Count — a small word / character count, e.g. "84w 512c · Σ 320w 1,904c". The full sentence is the
  hover title and the screen-reader text. Renders nothing for an empty count with no subtotal.
  Presentation only: the counting is headless (essay-model.ts essayCounts).
  Wraps .count (src/styles/components/count.css). Story: srs-web#648.
-->
<script lang="ts">
  import type { Count } from '../essay/essay-model.js';

  let {
    count,
    subtotal,
    label = '',
    class: klass = '',
  }: {
    count: Count;
    /** This item and everything nested under it; shown after "Σ". */
    subtotal?: Count;
    /** Visible prefix and start of the sentence (e.g. "Essay"). */
    label?: string;
    class?: string;
  } = $props();

  const n = (x: number) => x.toLocaleString();
  const short = (c: Count) => `${n(c.words)}w ${n(c.chars)}c`;
  const long = (c: Count) => `${n(c.words)} words, ${n(c.chars)} characters`;
  const text = $derived(`${label ? `${label} ` : ''}${short(count)}${subtotal ? ` · Σ ${short(subtotal)}` : ''}`);
  const title = $derived(
    `${label ? `${label}: ` : ''}${long(count)}${subtotal ? `. With nested paragraphs: ${long(subtotal)}` : ''}.`,
  );
</script>

{#if count.chars || subtotal}
  <p class={['count', klass]} data-testid="count" {title}><span aria-hidden="true">{text}</span><span class="sr-only">{title}</span></p>
{/if}
