<!--
  CommentThread — the comment sequence on one instance plus a reply box. Placement-agnostic (inline
  under a paragraph today, #426 may move it): it is bounded (the list scrolls, the composer stays),
  long comments clamp behind "Show more", threads past EARLIER_THRESHOLD keep the newest open behind
  "N earlier comments", and consecutive comments by one actor share one chip (later ones a compact
  ActorMark). Bodies render as markdown through MarkdownView. Presentation + events only: the shell
  reads comments from the engine and writes through srs-client. The author is the engine-stamped
  `createdBy` (RFC-046); the UI never sends it. Without an actor (no login, no saved name) the reply
  box also asks for a display name once. Ctrl/Cmd+Enter submits. A comment's kind (comments 1.1.0)
  shows as a label, and the thread filters by kind; with `onrespond`, a task offers Done, Reject (an
  optional reason) and Reopen, each a response comment (ruling ff946eb1); with `kinds` the reply box
  picks a kind. Story: srs-web#591.
  Wraps .comments (src/styles/components/comments.css). Story: muDemocracy.org#227, srs-web#422
-->
<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { CONTENT_KINDS, EARLIER_THRESHOLD, groupRuns, plainText } from '$lib/comments.js';
  import { relativeTime } from '$lib/relative-time.js';
  import type { Comment, ContentKind } from '$lib/comments.js';
  import ActorChip from './ActorChip.svelte';
  import ActorMark from './ActorMark.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';
  import MarkdownView from './MarkdownView.svelte';
  import Select from './Select.svelte';
  import Textarea from './Textarea.svelte';

  let {
    comments = [],
    needsName = false,
    now = Date.now(),
    kinds = false,
    onadd,
    onrespond,
    onclose,
  }: {
    comments?: Comment[];
    /** No actor yet: ask for a display name with the first reply. */
    needsName?: boolean;
    /** The shell's clock, so "just now" advances with the rest of the panel. */
    now?: number;
    /** Comments here can carry a kind: the reply box offers one. */
    kinds?: boolean;
    onadd: (text: string, name?: string, kind?: ContentKind) => void;
    /** Optional: settle a task (done, rejected with an optional reason) or reopen it (withdrawn). */
    onrespond?: (commentId: string, kind: 'done' | 'rejected' | 'withdrawn', text?: string) => void;
    /** Optional: shows a "Hide comments" control beside Comment (the shell owns the visibility state). */
    onclose?: () => void;
  } = $props();

  let text = $state('');
  let name = $state('');
  let kind = $state('');
  let filter = $state<string | null>(null);
  let rejecting = $state<string | null>(null);
  let reason = $state('');
  let reveal = $state(false);
  let folded = $state(false);
  let list = $state<HTMLElement>();
  const expanded = new SvelteSet<string>();
  const overflowing = new SvelteSet<string>();

  const present = $derived(CONTENT_KINDS.filter((k) => comments.some((c) => c.kind === k)));
  const shown = $derived(filter ? comments.filter((c) => c.kind === filter) : comments);
  const long = $derived(comments.length > EARLIER_THRESHOLD);
  const hidden = $derived(long && !reveal ? Math.max(0, shown.length - EARLIER_THRESHOLD) : 0);
  const visible = $derived(shown.slice(hidden));
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
    onadd(t, needsName ? name : undefined, (kind || undefined) as ContentKind | undefined);
    text = '';
    kind = '';
  }

  function reject(e: Event, id: string) {
    e.preventDefault();
    onrespond?.(id, 'rejected', reason.trim() || undefined);
    rejecting = null;
    reason = '';
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
  {#if !folded && present.length > 0}
    <div class="comments__filter" role="group" aria-label="Show comments of kind" data-part="filter">
      <Button size="sm" variant="ghost" aria-pressed={filter === null} onclick={() => (filter = null)}>All</Button>
      {#each present as k (k)}
        <Button size="sm" variant="ghost" aria-pressed={filter === k} data-testid="comment-filter-{k}" onclick={() => (filter = filter === k ? null : k)}>{k}</Button>
      {/each}
    </div>
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
              {#if c.kind}<span class="comments__kind" data-part="kind" data-testid="comment-kind">{c.kind}</span>{/if}
              {#if c.task && c.task.state !== 'open'}<span class="comments__state is-{c.task.state}" data-part="state" data-testid="task-state">{c.task.state}</span>{/if}
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
            {#if c.task?.reason}<p class="comments__reason" data-part="reason">{c.task.reason}</p>{/if}
            {#if c.task && onrespond}
              <div class="comments__task" data-part="task">
                {#if c.task.state !== 'open'}
                  <Button size="sm" variant="ghost" data-testid="task-reopen" onclick={() => onrespond(c.id, 'withdrawn')}>Reopen</Button>
                {:else if rejecting === c.id}
                  <form class="comments__task" onsubmit={(e) => reject(e, c.id)}>
                    <Input aria-label="Reason (optional)" placeholder="Reason (optional)" bind:value={reason} />
                    <Button size="sm" type="submit" data-testid="task-reject-confirm">Reject</Button>
                    <Button size="sm" variant="ghost" onclick={() => (rejecting = null)}>Cancel</Button>
                  </form>
                {:else}
                  <Button size="sm" data-testid="task-done" onclick={() => onrespond(c.id, 'done')}>Done</Button>
                  <Button size="sm" variant="ghost" data-testid="task-reject" onclick={() => { rejecting = c.id; reason = ''; }}>Reject</Button>
                {/if}
              </div>
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
    {#if kinds}
      <Select aria-label="Kind" data-testid="comment-kind-pick" value={kind} onchange={(e: Event) => (kind = (e.currentTarget as HTMLSelectElement).value)} options={[{ value: '', label: 'No kind' }, ...CONTENT_KINDS]} />
    {/if}
    <Button size="sm" variant="primary" type="submit" disabled={!text.trim() || (needsName && !name.trim())}>Comment</Button>
    {#if onclose}<Button size="sm" variant="ghost" data-testid="comment-close" onclick={onclose}>Hide comments</Button>{/if}
  </form>
</section>
