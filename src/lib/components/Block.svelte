<!--
  Block — one paragraph: a narrow gutter (⋮⋮ drag handle; eye + move-to-draft on hover/focus),
  a small mono title above the body (InlineText) and a plain-text body
  (`contenteditable="plaintext-only"`, no rich-text dependency). Hidden = collapsed in place.
  Presentation + events only; the shell commits through the engine.
    Ctrl/Cmd+Enter  new block after this one     Alt+Arrows  move / change level
    Tab at start    indent (Shift+Tab outdent)   F2 on the handle / click title  rename
  Wraps .block (src/styles/components/block.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import EyeToggle from './EyeToggle.svelte';
  import InlineText from './InlineText.svelte';
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
    glyphs,
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
    /** Marks for things attached to this paragraph (AttachmentGlyph). */
    glyphs?: Snippet;
  } = $props();

  let el = $state<HTMLElement>();
  let editingTitle = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let committed = '';

  // Show external changes (agent writes) unless the writer is mid-edit in this block.
  $effect(() => {
    const v = body;
    committed = v;
    if (el && document.activeElement !== el && el.innerText !== v) el.textContent = v;
  });

  function flush() {
    clearTimeout(timer);
    const v = el?.innerText ?? '';
    if (v !== committed) {
      committed = v;
      onbody(v);
    }
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
    </div>
  </div>
  <div class="block__main">
    <div class="block__head" class:is-collapsed={!title && !glyphs && !editingTitle}>
      <span class="block__title">
        <InlineText value={title} placeholder="Add title" label="Paragraph title" oncommit={ontitle} bind:editing={editingTitle} />
      </span>
      {#if glyphs}<span class="block__glyphs">{@render glyphs()}</span>{/if}
    </div>
    {#if hidden || inherited}
      <p class="block__closed">{inherited && !hidden ? 'Hidden by parent' : 'Hidden paragraph'}</p>
    {:else}
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
        onblur={flush}
        onkeydown={bodyKeydown}
      ></div>
    {/if}
  </div>
</article>
