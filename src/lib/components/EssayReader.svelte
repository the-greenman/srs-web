<!--
  EssayReader — a finished essay for someone reading it (srs-web#716): its title, purpose and
  paragraphs on one page, with none of the writer's tools. Presentation only: the reading comes from
  essayReading (essay-document.ts). An image paragraph is an ImageParagraph (srs-web#764) whose bytes
  come from `imageBytes`. Wraps .essay-reader (essay-shell.css).
-->
<script lang="ts">
  import type { EssayReading } from "$lib/essay/essay-document.js";
  import ImageParagraph from "./ImageParagraph.svelte";
  import MarkdownView from "./MarkdownView.svelte";

  let {
    reading,
    imageBytes = () => null,
  }: { reading: EssayReading; /** An attached file's bytes, null when unreadable. */ imageBytes?: (documentId: string) => Uint8Array | null } = $props();
</script>

<article class="essay-shell__page essay-reader" data-testid="essay-reader" aria-label={reading.title}>
  <h1 class="essay-reader__title">{reading.title}</h1>
  {#if reading.purpose}
    <MarkdownView class="essay-reader__purpose" value={reading.purpose} />
  {/if}
  {#each reading.paragraphs as p (p.id)}
    {#if p.image}
      <ImageParagraph alt={p.image.alt} caption={p.image.caption} size={p.image.size} align={p.image.align} bytes={p.image.documentId ? imageBytes(p.image.documentId) : null} />
    {:else}
      <MarkdownView class="essay-reader__paragraph" value={p.body} />
    {/if}
  {/each}
</article>
