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
  import type { HTMLAttributes } from 'svelte/elements';
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
    ...rest
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
  } & Omit<HTMLAttributes<HTMLElement>, "onclose"> = $props(); // other attributes (e.g. data-feature, src/lib/help) go on the root

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
  // A filtered kind that no longer occurs (the thread changed) reads as All.
  const active = $derived(filter && present.includes(filter as ContentKind) ? filter : null);
  const shown = $derived(active ? comments.filter((c) => c.kind === active) : comments);
  const long = $derived(comments.length > EARLIER_THRESHOLD);
  const hidden = $derived(reveal ? 0 : Math.max(0, shown.length - EARLIER_THRESHOLD));
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

<section {...rest} class="comments" aria-label="Comments" data-testid="comment-thread" data-part="thread">
  {#if long}
    <Button size="sm" variant="ghost" class="comments__summary" data-part="summary" aria-expanded={!folded} onclick={() => (folded = !folded)}>
      <ActorMark actor={comments.at(-1)?.author} size="sm" />
      <span class="comments__count">{comments.length} comments</span>
      <span class="comments__first">{plainText(comments[comments.length - 1].text)}</span>
    </Button>
  {/if}
  {#if !folded && present.length > 0}
    <div class="comments__filter" role="group" aria-label="Show comments of kind" data-part="filter">
      <!-- Chips the size of the kind labels they filter by (srs-web#591). -->
      <button type="button" class="comments__kind comments__chip" aria-pressed={active === null} onclick={() => (filter = null)}>All</button>
      {#each present as k (k)}
        <button type="button" class="comments__kind comments__chip" aria-pressed={active === k} data-testid="comment-filter-{k}" onclick={() => (filter = active === k ? null : k)}>{k}</button>
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
              {#if c.task && c.task.state !== 'open'}<span class="comments__state is-{c.task.state}" data-part="state" data-testid="task-state">{c.task.state}</span>{#if onrespond}<Button size="sm" variant="ghost" class="comments__reopen" data-testid="task-reopen" onclick={() => onrespond(c.id, 'withdrawn')}>Reopen</Button>{/if}{/if}
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
            {#if c.task?.state === 'open' && onrespond}
              <div class="comments__task" data-part="task">
                {#if rejecting === c.id}
                  <form class="comments__task" data-part="reject" onsubmit={(e) => reject(e, c.id)}>
                    <!-- svelte-ignore a11y_autofocus -->
                    <Input aria-label="Reason (optional)" placeholder="Reason (optional)" bind:value={reason} autofocus />
                    <Button size="sm" type="submit" data-testid="task-reject-confirm">Reject</Button>
                    <Button size="sm" variant="ghost" type="button" onclick={() => (rejecting = null)}>Cancel</Button>
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
    {#if kinds}
      <!-- A native select dressed as the kind label it sets: small, ignorable by a human, there for agents and the odd task. -->
      <Select aria-label="Kind" title="Kind (optional)" data-testid="comment-kind-pick" class={`comments__kind comments__kind-pick${kind ? '' : ' is-empty'}`} value={kind} onchange={(e: Event) => (kind = (e.currentTarget as HTMLSelectElement).value)} options={[{ value: '', label: 'kind' }, ...CONTENT_KINDS]} />
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
    {#if onclose}<Button size="sm" variant="ghost" type="button" data-testid="comment-close" onclick={onclose}>Hide comments</Button>{/if}
  </form>
</section>
