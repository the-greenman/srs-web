<!--
  PreviewPane — live HTML preview of a rendered SRS document view.

  Wraps a rendered HTML fragment (from renderDocumentView "html") inside an
  <iframe srcdoc> so the guide's CSS is isolated from the app shell. The iframe
  uses sandbox="" (fully restrictive) — no scripts, no same-origin access, no
  allow-* flags — since the srcdoc template needs no external resources.

  ADR-003: Document Views drive rendered output; this is a render-surface concern.
  ADR-007: Preview themes are inline CSS constants; themeCss prop replaces the
           hardcoded style block.
  srs-web#39: live preview for the guides inspector slot.
  srs-web#41: themeCss prop added for theme picker support.
-->
<script lang="ts">
  import { THEME_DEFAULT } from "$lib/guides/preview-themes.js";

  let {
    html = null,
    loading = false,
    themeCss = THEME_DEFAULT,
  }: {
    /** Rendered HTML fragment from renderDocumentView("html"). Null = no guide selected. */
    html?: string | null;
    loading?: boolean;
    /** CSS string to inject into the preview iframe. Defaults to THEME_DEFAULT. */
    themeCss?: string;
  } = $props();

  const srcdoc = $derived(
    html
      ? `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${themeCss}</style>
</head>
<body>${html}</body>
</html>`
      : ""
  );
</script>

<div class="preview-pane" data-testid="guides-preview-pane">
  {#if loading}
    <p class="preview-pane__status">Rendering…</p>
  {:else if !html}
    <p class="preview-pane__status">No guide selected.</p>
  {:else}
    <iframe
      class="preview-pane__frame"
      data-testid="guides-preview-frame"
      sandbox=""
      title="Guide preview"
      {srcdoc}
    ></iframe>
  {/if}
</div>

<style>
  .preview-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .preview-pane__status {
    font-size: 0.8rem;
    color: var(--color-muted, #888);
    margin: 0;
    padding: 0.25rem 0;
  }

  .preview-pane__frame {
    border: none;
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
    display: block;
  }
</style>
