<!--
  Block — one paragraph: a narrow gutter (drag handle and one ellipsis action menu, both always visible; the menu is the only tool on touch), a hover strip of shortcut tools (hide, zoom, copy link: the `primary` paragraph actions) inside the title row, a right margin slot (`margin`),
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
  import { tick, type Snippet } from 'svelte';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import ActionMenu from './ActionMenu.svelte';
  import EyeToggle from './EyeToggle.svelte';
  import IconButton from './IconButton.svelte';
  import InlineText from './InlineText.svelte';
  import MarkdownText from './MarkdownText.svelte';
  import AttachDrop from './AttachDrop.svelte';
  import type { AttachFile } from './attach-check.js';
  import Popover from './Popover.svelte';
  import { keyMove } from './dnd';
  import type { KeyMove } from './dnd';
  import { paragraphActions } from '../essay/paragraph-actions.js';

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
    onattach,
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
    /** Attach files to this paragraph (paste or picker, from the menu's "Attach file…"); absent = no such action. */
    onattach?: (files: AttachFile[]) => void | Promise<void>;
    /** The one right-margin slot: comment badge, attachment glyphs. */
    margin?: Snippet;
  } = $props();

  let editingTitle = $state(false);
  let attachOpen = $state(false);
  let article = $state<HTMLElement>();
  async function attach(files: AttachFile[]) {
    attachOpen = false;
    await onattach?.(files);
  }
  // Paste only works while the zone has focus: move it there when the popover opens.
  $effect(() => {
    if (attachOpen) void tick().then(() => article?.querySelector<HTMLElement>('.popover .file-drop')?.focus());
  });

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
  // The one action list: the hover strip (its `primary` entries) and the ellipsis menu are both rendered from it.
  const actions = $derived(
    paragraphActions(
      { onnew, onmove, onindent, onhide, onpull, ondelete, onzoom, oncopylink, oncopyagent, onrename: () => (editingTitle = true), onattach: onattach && (() => (attachOpen = true)) },
      { label: shortLabel, hidden, inherited },
    ),
  );
</script>

<article class="block" class:is-off={hidden || inherited} data-block-id={id} bind:this={article}>
  <div class="block__gutter" data-part="gutter">
    <IconButton
      class="block__handle"
      icon={GripVertical}
      data-part="handle"
      aria-roledescription="drag handle"
      label={`Move ${shortLabel}. Alt plus arrow keys reorder and change level; F2 renames.`}
      data-focus-key={`handle:${id}`}
      onkeydown={handleKeydown}
      {...handle}
    />
    <ActionMenu class="block__menu" data-part="menu" {actions} label={shortLabel} focusKey={`menu:${id}`} />
    {#if onattach}
      <Popover bind:open={attachOpen} label={`Attach files to ${shortLabel}`} anchor={article} placement="bottom-start">
        {#if attachOpen}<AttachDrop compact label="Attach text files" onfiles={attach} data-testid="attach-drop" />{/if}
      </Popover>
    {/if}
  </div>
  <div class="block__main" data-part="main">
    <div class="block__head" data-part="head" class:is-collapsed={!title && !editingTitle}>
      <span class="block__title" data-part="title">
        <InlineText value={title} placeholder="Add title" label="Paragraph title" oncommit={ontitle} bind:editing={editingTitle} />
      </span>
      <div class="block__strip" data-part="strip" data-testid="block-strip" role="group" aria-label={`Tools for ${shortLabel}`}>
        {#each actions.filter((a) => a.primary) as a (a.id)}
          {#if a.id === 'hide'}
            <EyeToggle {hidden} {inherited} label={shortLabel} onclick={a.run} />
          {:else if a.tool}
            <IconButton data-part="action" icon={a.icon} label={a.tool.aria} title={a.tool.title} onclick={a.run} />
          {/if}
        {/each}
      </div>
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
  {#if margin && !(hidden || inherited)}<div class="block__margin" data-part="margin">{@render margin()}</div>{/if}
</article>
