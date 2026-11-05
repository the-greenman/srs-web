<!--
  EssayReader — a finished essay for someone reading it (srs-web#716): its title, purpose and
  paragraphs on one page, with none of the writer's tools. Presentation only: the reading comes from
  essayReading (essay-document.ts). Wraps .essay-reader (essay-shell.css).
-->
<script lang="ts">
  import type { EssayReading } from "$lib/essay/essay-document.js";
  import MarkdownView from "./MarkdownView.svelte";

  let { reading }: { reading: EssayReading } = $props();
</script>

<article class="essay-shell__page essay-reader" data-testid="essay-reader" aria-label={reading.title}>
  <h1 class="essay-reader__title">{reading.title}</h1>
  {#if reading.purpose}
    <MarkdownView class="essay-reader__purpose" value={reading.purpose} />
  {/if}
  {#each reading.paragraphs as p (p.id)}
    <MarkdownView class="essay-reader__paragraph" value={p.body} />
  {/each}
</article>
