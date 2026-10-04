<!--
  CommentThread — the comment sequence on one instance plus a reply box. Placement-agnostic (inline
  under a paragraph today, #426 may move it): it is bounded (the list scrolls, the composer stays),
  long comments clamp behind "Show more", threads past EARLIER_THRESHOLD keep the newest open behind
  "N earlier comments", and consecutive comments by one actor share one chip (later ones a compact
  ActorMark). Bodies render as markdown through MarkdownView. Presentation + events only: the shell
  reads comments from the engine and writes through srs-client. The author is the engine-stamped
  `createdBy` (RFC-046); the UI never sends it. Without an actor (no login, no saved name) the reply
  box also asks for a display name once. Ctrl/Cmd+Enter submits.
  Wraps .comments (src/styles/components/comments.css). Story: muDemocracy.org#227, srs-web#422
-->
<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { EARLIER_THRESHOLD, groupRuns, plainText } from '$lib/comments.js';
  import { relativeTime } from '$lib/relative-time.js';
  import type { Comment } from '$lib/comments.js';
  import ActorChip from './ActorChip.svelte';
  import ActorMark from './ActorMark.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';
  import MarkdownView from './MarkdownView.svelte';
  import Textarea from './Textarea.svelte';

  let {
    comments = [],
    needsName = false,
    now = Date.now(),
    onadd,
    onclose,
  }: {
    comments?: Comment[];
    /** No actor yet: ask for a display name with the first reply. */
    needsName?: boolean;
    /** The shell's clock, so "just now" advances with the rest of the panel. */
    now?: number;
    onadd: (text: string, name?: string) => void;
    /** Optional: shows a "Hide comments" control beside Comment (the shell owns the visibility state). */
    onclose?: () => void;
  } = $props();

  let text = $state('');
  let name = $state('');
  let reveal = $state(false);
  let folded = $state(false);
  let list = $state<HTMLElement>();
  const expanded = new SvelteSet<string>();
  const overflowing = new SvelteSet<string>();

  const long = $derived(comments.length > EARLIER_THRESHOLD);
  const hidden = $derived(long && !reveal ? comments.length - EARLIER_THRESHOLD : 0);
  const visible = $derived(comments.slice(hidden));
  const runs = $derived(groupRuns(visible));

  // The newest comment is what a reader wants: scroll to it on mount, on add and after "reveal".
  $effect(() => {
    void visible.length;
    void folded;
    if (list) list.scrollTop = list.scrollHeight;
  });

  /** Marks a comment as overflowing its clamp; stops measuring once the reader expands it. */
  function watch(node: HTMLElement, id: string) {
    const check = () => {
      if (expanded.has(id)) return;
      if (node.scrollHeight > node.clientHeight + 1) overflowing.add(id);
      else overflowing.delete(id);
    };
    check();
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(check);
    ro?.observe(node);
    return { destroy: () => ro?.disconnect() };
  }

  function toggle(id: string) {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
  }

  function submit(e?: Event) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || (needsName && !name.trim())) return;
    onadd(t, needsName ? name : undefined);
    text = '';
  }
</script>

<section class="comments" aria-label="Comments" data-testid="comment-thread" data-part="thread">
  {#if long}
    <Button size="sm" variant="ghost" class="comments__summary" data-part="summary" aria-expanded={!folded} onclick={() => (folded = !folded)}>
      <ActorMark actor={comments.at(-1)?.author} size="sm" />
      <span class="comments__count">{comments.length} comments</span>
      <span class="comments__first">{plainText(comments[comments.length - 1].text)}</span>
    </Button>
  {/if}
  {#if !folded}
    <div class="comments__list" bind:this={list} data-part="list">
      {#if hidden > 0}
        <Button size="sm" variant="ghost" class="comments__earlier" data-part="earlier" onclick={() => (reveal = true)}>{hidden} earlier comments</Button>
      {/if}
      {#each runs as run (run[0].id)}
        {#each run as c, i (c.id)}
          <article class="comments__item" data-testid="comment" data-part="item">
            <header class="comments__meta" data-part="meta">
              {#if i === 0}<ActorChip actor={c.author} />{:else}<ActorMark actor={c.author} size="sm" />{/if}
              {#if c.createdAt}
                <time class="comments__time" data-part="time" datetime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{relativeTime(c.createdAt, now)}</time>
              {/if}
            </header>
            <div class="comments__body" class:is-clamped={!expanded.has(c.id)} use:watch={c.id}>
              <MarkdownView class="comments__text" data-part="text" value={c.text} />
            </div>
            {#if overflowing.has(c.id) || expanded.has(c.id)}
              <Button size="sm" variant="ghost" class="comments__more" data-part="more" aria-expanded={expanded.has(c.id)} onclick={() => toggle(c.id)}>{expanded.has(c.id) ? 'Show less' : 'Show more'}</Button>
            {/if}
          </article>
        {/each}
      {/each}
    </div>
  {/if}
  <form class="comments__reply" data-part="reply" onsubmit={submit}>
    {#if needsName}
      <Input aria-label="Your name" placeholder="Your name" bind:value={name} required />
    {/if}
    <Textarea
      class="textarea--grow"
      aria-label="Reply"
      placeholder="Reply…"
      rows={2}
      bind:value={text}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e);
      }}
    />
    <Button size="sm" variant="primary" type="submit" disabled={!text.trim() || (needsName && !name.trim())}>Comment</Button>
    {#if onclose}<Button size="sm" variant="ghost" data-testid="comment-close" onclick={onclose}>Hide comments</Button>{/if}
  </form>
</section>
