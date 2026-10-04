<!--
  Block — one paragraph: a narrow gutter (⋮⋮ drag handle; eye + move-to-draft + zoom + copy-link on hover/focus; one ⋯ action menu, the only tool on touch), a right margin slot (`margin`),
  a small mono title above the body (InlineText) and the body in two states: rendered markdown
  (core renderMarkdown, already sanitized) until focused, then a plain-text source editor
  (`contenteditable="plaintext-only"`, no rich-text dependency). Hidden = collapsed in place.
  Presentation + events only; the shell commits through the engine.
    Ctrl/Cmd+Enter  new block after this one     Alt+Arrows  move / change level
    Tab at start    indent (Shift+Tab outdent)   F2 on the handle / click title  rename
  Wraps .block (src/styles/components/block.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import ActionMenu from './ActionMenu.svelte';
  import EyeToggle from './EyeToggle.svelte';
  import InlineText from './InlineText.svelte';
  import MarkdownText from './MarkdownText.svelte';
  import { keyMove } from './dnd';
  import type { KeyMove } from './dnd';
  import { HOVER_TOOLS, paragraphActions } from '../essay/paragraph-actions.js';

  let {
    id,
    title = '',
    body = '',
    hidden = false,
    inherited = false,
    handle = {},
    onbody,
    ontitle,
    onhide,
    onnew,
    onindent,
    onmove,
    onnavigate,
    onpull,
    ondelete,
    onzoom,
    oncopylink,
    oncopyagent,
    margin,
  }: {
    id: string;
    title?: string;
    body?: string;
    hidden?: boolean;
    /** Hidden because an ancestor is hidden. */
    inherited?: boolean;
    /** Drag attributes from BlockStack, spread on the handle. */
    handle?: Record<string, unknown>;
    onbody: (value: string) => void;
    ontitle: (value: string) => void;
    onhide: (hidden: boolean) => void;
    onnew: () => void;
    onindent: (delta: 1 | -1) => void;
    onmove: (dir: 'up' | 'down') => void;
    /** Caret left the first/last line: focus the neighbouring paragraph (the shell owns the order). */
    onnavigate?: (dir: 'prev' | 'next') => void;
    onpull?: () => void;
    ondelete?: () => void;
    onzoom?: () => void;
    oncopylink?: () => void;
    oncopyagent?: () => void;
    /** The one right-margin slot: comment badge, attachment glyphs. */
    margin?: Snippet;
  } = $props();

  let editingTitle = $state(false);

  const plainArrow = (e: KeyboardEvent) =>
    (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey);

  /** True when the caret sits on the first (up) / last (down) visual line; wrapping makes offsets useless. */
  function atEdgeLine(el: HTMLElement | undefined, up: boolean): boolean {
    const sel = getSelection();
    if (!el || !sel?.isCollapsed || !sel.rangeCount) return false;
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const caret = sel.getRangeAt(0).getClientRects()[0];
    if (!caret || !caret.height) {
      // A blank line has no rect: decide from the text. An empty body is on both edges.
      const r = document.createRange();
      const rng = sel.getRangeAt(0);
      if (up) r.setStart(el, 0), r.setEnd(rng.startContainer, rng.startOffset);
      else r.setStart(rng.endContainer, rng.endOffset), r.setEnd(el, el.childNodes.length);
      return !r.toString().includes('\n');
    }
    return up
      ? caret.top < box.top + parseFloat(cs.paddingTop) + caret.height / 2
      : caret.bottom > box.bottom - parseFloat(cs.paddingBottom) - caret.height / 2;
  }

  function applyMove(m: KeyMove) {
    if (m === 'up' || m === 'down') onmove(m);
    else onindent(m === 'in' ? 1 : -1);
  }

  /** Paragraph shortcuts, for both the rendered and the editing state of the body. */
  function bodyKeydown(e: KeyboardEvent, { flush, el, rendered }: { flush: () => void; el?: HTMLElement; rendered: boolean }) {
    if (rendered && plainArrow(e)) {
      e.preventDefault();
      onnavigate?.(e.key === 'ArrowUp' ? 'prev' : 'next');
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      flush();
      onnew();
      return;
    }
    const m = keyMove(e);
    if (m) {
      e.preventDefault();
      flush();
      applyMove(m);
      return;
    }
    if (plainArrow(e) && atEdgeLine(el, e.key === 'ArrowUp')) {
      e.preventDefault();
      flush();
      onnavigate?.(e.key === 'ArrowUp' ? 'prev' : 'next');
      return;
    }
    // Tab only indents at the very start of the block, so it never traps keyboard focus.
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const sel = getSelection();
      if (sel?.isCollapsed && sel.anchorOffset === 0) {
        e.preventDefault();
        flush();
        onindent(e.shiftKey ? -1 : 1);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const m = keyMove(e);
    if (m) {
      e.preventDefault();
      applyMove(m);
    } else if (e.key === 'F2') editingTitle = true;
  }

  const shortLabel = $derived(title || 'untitled paragraph');
  // The one action list: hover tools (devices with hover) and the ⋯ menu are both rendered from it.
  const actions = $derived(
    paragraphActions(
      { onnew, onmove, onindent, onhide, onpull, ondelete, onzoom, oncopylink, oncopyagent, onrename: () => (editingTitle = true) },
      { label: shortLabel, hidden, inherited },
    ),
  );
</script>

<article class="block" class:is-off={hidden || inherited} data-block-id={id}>
  <div class="block__gutter">
    <button
      type="button"
      class="block__handle"
      aria-roledescription="drag handle"
      aria-label={`Move ${shortLabel}. Alt plus arrow keys reorder and change level; F2 renames.`}
      data-focus-key={`handle:${id}`}
      onkeydown={handleKeydown}
      {...handle}
    >⋮⋮</button>
    <div class="block__tools">
      {#each actions.filter((a) => HOVER_TOOLS.includes(a.id)) as a (a.id)}
        {#if a.id === 'hide'}
          <EyeToggle {hidden} {inherited} label={shortLabel} onclick={a.run} />
        {:else if a.tool}
          <button type="button" class="block__action" aria-label={a.tool.aria} title={a.tool.title} onclick={a.run}>{a.icon}</button>
        {/if}
      {/each}
    </div>
    <ActionMenu class="block__menu" {actions} label={shortLabel} focusKey={`menu:${id}`} />
  </div>
  <div class="block__main">
    <div class="block__head" class:is-collapsed={!title && !editingTitle}>
      <span class="block__title">
        <InlineText value={title} placeholder="Add title" label="Paragraph title" oncommit={ontitle} bind:editing={editingTitle} />
      </span>
    </div>
    {#if hidden || inherited}
      <p class="block__closed">{inherited && !hidden ? 'Hidden by parent' : 'Hidden paragraph'}</p>
    {:else}
      <MarkdownText
        value={body}
        base="block"
        label={`Paragraph text: ${shortLabel}`}
        focusKey={`body:${id}`}
        oncommit={onbody}
        onkeydown={bodyKeydown}
      />
    {/if}
  </div>
  {#if margin}<div class="block__margin">{@render margin()}</div>{/if}
</article>
