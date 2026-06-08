<!--
  PreviewPane — live HTML preview of a rendered SRS document view.

  Wraps a rendered HTML fragment (from renderDocumentView "html") inside an
  <iframe srcdoc> so the guide's CSS is isolated from the app shell. The iframe
  uses sandbox="" (fully restrictive) — no scripts, no same-origin access, no
  allow-* flags — since the srcdoc template needs no external resources.

  ADR-003: Document Views drive rendered output; this is a render-surface concern.
  srs-web#39: live preview for the guides inspector slot.
-->
<script lang="ts">
  let {
    html = null,
    loading = false,
  }: {
    /** Rendered HTML fragment from renderDocumentView("html"). Null = no guide selected. */
    html?: string | null;
    loading?: boolean;
  } = $props();

  const srcdoc = $derived(
    html
      ? `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 0.875rem;
    line-height: 1.65;
    color: #111;
    margin: 1rem 1.25rem;
    padding: 0;
  }
  h1, h2, h3, h4 { font-weight: 600; margin: 1rem 0 0.4rem; }
  h1 { font-size: 1.1rem; }
  h2 { font-size: 1rem; }
  h3, h4 { font-size: 0.9rem; }
  p { margin: 0 0 0.6rem; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; font-size: 0.8rem; }
  th, td { border: 1px solid #ddd; padding: 0.3rem 0.5rem; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  .srs-document { max-width: 100%; }
  .srs-section { margin-bottom: 1.25rem; }
  .srs-field-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: #888; margin-bottom: 0.2rem; }
</style>
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
