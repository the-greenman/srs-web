<!--
  LandingFrame — the front-page frame: a hairline header (SemanticOps wordmark left, "What is SRS?"
  right), then a left-aligned hero (mono eyebrow, display headline, optional standfirst), an optional
  notices slot, and the body. Boot, error and migrate screens reuse it with their own title.
  Wraps .landing (landing.css); tokens `--landing-*`; parts `header brand link hero notices body`.
  Extra attributes (data-testid) go to the root.
-->
<script lang="ts">
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import SrsMark from './SrsMark.svelte';
  import Wordmark from './Wordmark.svelte';

  let {
    eyebrow = 'SRS Editor',
    title,
    standfirst,
    notices,
    children,
    ...rest
  }: {
    eyebrow?: string;
    title?: string;
    standfirst?: string;
    notices?: Snippet;
    children?: Snippet;
  } & Omit<HTMLAttributes<HTMLDivElement>, 'children'> = $props();
</script>

<div class="landing" {...rest}>
  <header class="landing__header" data-part="header">
    <div class="landing__inner">
      <span class="landing__brand" data-part="brand"><SrsMark size={24} /><Wordmark size="sm" /></span>
      <a class="landing__link" data-part="link" href="https://semanticops.com" target="_blank" rel="noopener">
        What is SRS? <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    </div>
  </header>
  <main class="landing__inner">
    <div class="landing__hero" data-part="hero">
      <p class="landing__eyebrow">{eyebrow}</p>
      {#if title}<h1 class="landing__title">{title}</h1>{/if}
      {#if standfirst}<p class="landing__standfirst">{standfirst}</p>{/if}
    </div>
    <div class="landing__notices" data-part="notices">{@render notices?.()}</div>
    {@render children?.()}
  </main>
</div>
