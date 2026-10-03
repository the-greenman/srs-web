<!--
  Block — one paragraph: a narrow gutter (⋮⋮ drag handle; eye + move-to-draft + zoom on hover/focus), a right margin slot (`margin`),
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
  import { untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import EyeToggle from './EyeToggle.svelte';
  import InlineText from './InlineText.svelte';
  import { renderMarkdown } from '$lib/srs-client.js';
  import { keyMove } from './dnd';
  import type { KeyMove } from './dnd';

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
    onpull,
    onzoom,
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
    onpull?: () => void;
    onzoom?: () => void;
    /** The one right-margin slot: comment badge, attachment glyphs. */
    margin?: Snippet;
  } = $props();

  let el = $state<HTMLElement>();
  let editingTitle = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let editing = $state(false);
  let committed = '';
  const html = $derived(body ? renderMarkdown(body) : '');

  // Entering edit: show the source, keep focus, caret at the end.
  $effect(() => {
    if (!el) return;
    el.textContent = untrack(() => body);
    el.focus();
    getSelection()?.selectAllChildren(el);
    getSelection()?.collapseToEnd();
  });

  // Show external changes (agent writes) unless the writer is mid-edit in this block.
  $effect(() => {
    const v = body;
    committed = v;
    if (el && document.activeElement !== el && el.innerText !== v) el.textContent = v;
  });

  function flush() {
    clearTimeout(timer);
    if (!el) return;
    const v = el.innerText;
    if (v !== committed) {
      committed = v;
      onbody(v);
    }
  }

  function edit() {
    editing = true;
  }

  // Plain click edits; Ctrl/Cmd+click on a rendered link opens it instead.
  function renderClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a');
    if (a && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.open(a.href, '_blank', 'noopener');
      return;
    }
    e.preventDefault();
    edit();
  }

  function renderKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      edit();
    } else bodyKeydown(e);
  }

  function applyMove(m: KeyMove) {
    if (m === 'up' || m === 'down') onmove(m);
    else onindent(m === 'in' ? 1 : -1);
  }

  function bodyKeydown(e: KeyboardEvent) {
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
      <EyeToggle {hidden} {inherited} label={shortLabel} onclick={() => onhide(!hidden)} />
      {#if onpull}
        <button type="button" class="block__action" aria-label={`Move ${shortLabel} to draft`} title="Move to draft" onclick={onpull}>↧</button>
      {/if}
      {#if onzoom}
        <button type="button" class="block__action" aria-label={`Zoom to ${shortLabel}`} title="Zoom to this paragraph" onclick={onzoom}>⤢</button>
      {/if}
    </div>
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
      {#if editing}
      <div
        bind:this={el}
        class="block__body"
        contenteditable="plaintext-only"
        role="textbox"
        tabindex="0"
        aria-multiline="true"
        aria-label={`Paragraph text: ${shortLabel}`}
        data-placeholder="Write…"
        data-focus-key={`body:${id}`}
        oninput={() => {
          clearTimeout(timer);
          timer = setTimeout(flush, 400);
        }}
        onblur={() => {
          flush();
          editing = false;
        }}
        onkeydown={bodyKeydown}
      ></div>
      {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="block__render"
        role="group"
        tabindex="0"
        aria-label={`Paragraph text: ${shortLabel}, press Enter to edit`}
        data-placeholder="Write…"
        data-focus-key={`body:${id}`}
        onfocus={edit}
        onclick={renderClick}
        onkeydown={renderKeydown}
      >{@html html}</div>
      {/if}
    {/if}
  </div>
  {#if margin}<div class="block__margin">{@render margin()}</div>{/if}
</article>
