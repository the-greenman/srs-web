<!--
  Nav — the dark navigation rail. Brand lockup + scrolling section list
  (NavGroup/NavItem children) + optional health footer snippet.
  Wraps .nav (src/styles/components/nav.css). Requires the host page to define
  the #ink-surface SVG filter once.
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
import type { Snippet } from "svelte";

const {
  repo,
  repoId,
  eyebrow = "srs · governance",
  children,
  footer,
}: {
  repo: string;
  repoId?: string;
  eyebrow?: string;
  children?: Snippet;
  footer?: Snippet;
} = $props();
</script>

<nav class="nav app__nav" aria-label="Repository sections">
  <div class="nav__brand">
    <p class="eyebrow" style="margin:0">{eyebrow}</p>
    <div class="nav__repo">{repo}</div>
    {#if repoId}<div class="nav__repo-id">{repoId}</div>{/if}
  </div>
  <div class="nav__scroll">{@render children?.()}</div>
  {#if footer}<div class="nav__foot">{@render footer()}</div>{/if}
</nav>
