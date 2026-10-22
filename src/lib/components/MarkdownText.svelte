<!--
  MarkdownText — multi-line text that renders markdown (core renderMarkdown, already sanitized)
  until focused, then edits as plain-text source (`contenteditable="plaintext-only"`). Extracted
  from Block (srs-web#411) so a paragraph body and the essay purpose are ONE mechanism. Commits
  after a 400 ms typing pause and on blur; the caller writes the value. `onkeydown` sees every
  key (edit and rendered state) after Enter-to-edit; Block uses it for its paragraph shortcuts.
  Classes are `<base>__render` / `<base>__body` (block.css).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { renderMarkdown } from '$lib/srs-client.js';
  import { sourceOffset } from './source-offset.js';

  let {
    value = '',
    base,
    label,
    placeholder = 'Write…',
    focusKey,
    oncommit,
    onkeydown,
  }: {
    value?: string;
    base: string;
    /** Accessible name (the rendered state adds "press Enter to edit"). */
    label: string;
    placeholder?: string;
    focusKey?: string;
    oncommit: (value: string) => void;
    onkeydown?: (e: KeyboardEvent, api: { flush: () => void; replace: (v: string) => void; el?: HTMLElement; rendered: boolean }) => void;
  } = $props();

  let el = $state<HTMLElement>();
  let editing = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let committed = '';
  /** Nothing typed since editing began: the essay history, not the browser, owns Ctrl-Z here. */
  let typed = $state(false);
  const html = $derived(value ? renderMarkdown(value) : '');

  /** Source offset of the point the writer clicked, taken on pointerdown (focus enters edit before click fires). */
  let clickedAt: number | null = null;

  // Entering edit: show the source, keep focus; caret where the writer clicked, else at the end.
  $effect(() => {
    if (!el) return;
    typed = false;
    el.textContent = untrack(() => value);
    el.focus();
    const sel = getSelection();
    if (clickedAt !== null && el.firstChild) sel?.collapse(el.firstChild, Math.min(clickedAt, el.textContent.length));
    else {
      sel?.selectAllChildren(el);
      sel?.collapseToEnd();
    }
    clickedAt = null;
  });

  /** The caret position under a pointer: the standard API, or WebKit's older one. */
  function caretAtPoint(x: number, y: number): { node: Node; offset: number } | null {
    const p = document.caretPositionFromPoint?.(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
    const r = document.caretRangeFromPoint?.(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }

  function renderPointerdown(e: PointerEvent) {
    const root = e.currentTarget as HTMLElement;
    const at = e.button === 0 ? caretAtPoint(e.clientX, e.clientY) : null;
    if (!at || !root.contains(at.node)) return;
    const before = document.createRange();
    before.setStart(root, 0);
    before.setEnd(at.node, at.offset);
    clickedAt = sourceOffset(value, before.toString());
  }

  // Show external changes (agent writes) unless the writer is mid-edit here.
  $effect(() => {
    const v = value;
    committed = v;
    if (el && document.activeElement !== el && el.innerText !== v) el.textContent = v;
  });

  /** Show `v` and take it as already committed: the caller writes it (a split's first half). */
  function replace(v: string) {
    if (el) el.textContent = v;
    committed = v;
  }

  function flush() {
    clearTimeout(timer);
    if (!el) return;
    const v = el.innerText;
    if (v !== committed) {
      committed = v;
      oncommit(v);
    }
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
    editing = true;
  }

  function renderKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      editing = true;
    } else onkeydown?.(e, { flush, replace, el, rendered: true });
  }
</script>

{#if editing}
  <div
    bind:this={el}
    class={`${base}__body`}
    contenteditable="plaintext-only"
    role="textbox"
    tabindex="0"
    aria-multiline="true"
    aria-label={label}
    data-placeholder={placeholder}
    data-focus-key={focusKey}
    data-pristine={!typed || undefined}
    oninput={() => {
      typed = true;
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    }}
    onblur={() => {
      flush();
      editing = false;
    }}
    onkeydown={(e) => onkeydown?.(e, { flush, replace, el, rendered: false })}
  ></div>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class={`${base}__render`}
    role="group"
    tabindex="0"
    aria-label={`${label}, press Enter to edit`}
    data-placeholder={placeholder}
    data-focus-key={focusKey}
    onfocus={() => (editing = true)}
    onpointerdown={renderPointerdown}
    onpointercancel={() => (clickedAt = null)}
    onclick={renderClick}
    onkeydown={renderKeydown}
  >{@html html}</div>
{/if}
