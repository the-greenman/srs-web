<!--
  ImageParagraph — one essay image paragraph (srs-web#764): the image in a <figure>, its caption in a
  <figcaption>. The bytes become a blob: URL shown ONLY through <img> (decision 866167c1, D6): never
  inline SVG, {@html}, <object> or <iframe>, so an SVG's script never runs and it loads nothing. The
  URL is revoked when the bytes change or the component goes. Missing, unknown or unreadable bytes show
  a plain placeholder with the alt text, never a broken image. Layout classes come from
  image-paragraph.ts (D4); wraps .image-paragraph (image-paragraph.css).
-->
<script lang="ts">
  import { type ImageAlign, type ImageSize, imageClasses, imageMime } from "$lib/essay/image-paragraph.js";

  let {
    alt,
    caption = "",
    size = "full-width",
    align = "centre",
    bytes = null,
  }: { alt: string; caption?: string; size?: ImageSize; align?: ImageAlign; bytes?: Uint8Array | null } = $props();

  let url = $state<string | null>(null);
  let failed = $state(false);
  $effect(() => {
    failed = false;
    const mime = bytes ? imageMime(bytes) : null;
    if (!bytes || !mime) {
      url = null;
      return;
    }
    const u = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mime }));
    url = u;
    return () => URL.revokeObjectURL(u);
  });
</script>

<figure class={imageClasses(size, align)} data-testid="image-paragraph">
  {#if url && !failed}
    <img class="image-paragraph__img" src={url} {alt} onerror={() => (failed = true)} />
  {:else}
    <div class="image-paragraph__placeholder" role="img" aria-label={alt} data-part="placeholder">{alt}</div>
  {/if}
  {#if caption}<figcaption class="image-paragraph__caption">{caption}</figcaption>{/if}
</figure>
