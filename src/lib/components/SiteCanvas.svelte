<!--
  SiteCanvas — the site editor's page surface (srs-web#680, ADR-029 E1): blocks laid out generically
  in srs-web's tokens. The site's own tokens (its Theme stylesheet) load here once the engine can
  read a Theme (srs-rust#1558).
  Wraps .site-canvas (src/styles/components/site.css).
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<article class="site-canvas" aria-label={label}>
  {@render children()}
</article>
