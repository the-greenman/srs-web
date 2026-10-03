<!--
  CommentThread — the flat comment sequence under one paragraph plus a reply box.
  Presentation + events only: the shell reads comments from the engine and writes through
  srs-client. The author is the engine-stamped `createdBy` (RFC-046); the UI never sends it.
  Without an actor (no login, no saved name) the reply box also asks for a display name once.
  Wraps .comments (src/styles/components/comments.css).
  Story: https://github.com/the-greenman/muDemocracy.org/issues/227
-->
<script lang="ts">
  import type { Actor } from '$lib/srs-client';
  import ActorChip from './ActorChip.svelte';

  export interface ThreadComment {
    id: string;
    text: string;
    author?: Actor;
  }

  let {
    comments = [],
    needsName = false,
    onadd,
  }: {
    comments?: ThreadComment[];
    /** No actor yet: ask for a display name with the first reply. */
    needsName?: boolean;
    onadd: (text: string, name?: string) => void;
  } = $props();

  let text = $state('');
  let name = $state('');

  function submit(e: Event) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onadd(t, needsName ? name : undefined);
    text = '';
  }
</script>

<section class="comments" aria-label="Comments" data-testid="comment-thread">
  {#each comments as c (c.id)}
    <article class="comments__item" data-testid="comment">
      <header class="comments__meta">
        {#if c.author}
          <ActorChip actor={c.author} />
        {:else}
          <span class="comments__author" data-testid="comment-author">Unknown author</span>
        {/if}
      </header>
      <p class="comments__text">{c.text}</p>
    </article>
  {/each}
  <form class="comments__reply" onsubmit={submit}>
    {#if needsName}
      <input class="comments__name" aria-label="Your name" placeholder="Your name" bind:value={name} required />
    {/if}
    <textarea class="comments__input" aria-label="Reply" placeholder="Reply…" rows="2" bind:value={text}></textarea>
    <button class="btn btn--mono" type="submit" disabled={!text.trim() || (needsName && !name.trim())}>Comment</button>
  </form>
</section>
