<!--
  Nav — the dark navigation rail. Brand lockup + scrolling section list
  (NavGroup/NavItem children) + optional health footer snippet.
  Wraps .nav (src/styles/components/nav.css). Brand and footer stay put; `.nav__scroll` is the nav's one scroller.
  Inside an AppShell it carries a ResizeHandle on its right edge. The #ink-surface SVG filter it
  uses is defined once in index.html.
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getShell } from '../shell-context.svelte.js';
  import ResizeHandle from './ResizeHandle.svelte';

  let {
    repo,
    repoId,
    eyebrow = 'srs · governance',
    children,
    footer,
  }: {
    repo: string;
    repoId?: string;
    eyebrow?: string;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  const shell = getShell();
  const uid = $props.id();
</script>

<nav class="nav app__nav" id="nav-{uid}" aria-label="Repository sections">
  <div class="nav__brand">
    <p class="eyebrow" style="margin:0">{eyebrow}</p>
    <div class="nav__repo">{repo}</div>
    {#if repoId}<div class="nav__repo-id">{repoId}</div>{/if}
  </div>
  <div class="nav__scroll">{@render children?.()}</div>
  {#if footer}<div class="nav__foot">{@render footer()}</div>{/if}
  {#if shell && !shell.navDrawer}
    <ResizeHandle
      kind="nav"
      value={shell.navWidth}
      controls="nav-{uid}"
      onchange={(w) => shell.setColumn('nav', w)}
      oncommit={shell.commitColumns}
    />
  {/if}
</nav>
