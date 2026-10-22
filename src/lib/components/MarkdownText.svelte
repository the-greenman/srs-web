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
  /** Set by a click just before `editing` flips true; consumed once by the entering-edit effect. */
  let clickPoint: { x: number; y: number } | null = null;
  const html = $derived(value ? renderMarkdown(value) : '');

  /** Collapse the selection to the document position under (x, y), if one exists inside `target`. */
  function placeCaretAtPoint(target: HTMLElement, x: number, y: number): boolean {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let range: Range | null = null;
    if (doc.caretRangeFromPoint) {
      range = doc.caretRangeFromPoint(x, y);
    } else if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range || !target.contains(range.startContainer)) return false;
    const sel = getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  // Entering edit: show the source, keep focus. A click carries the point it landed on — put
  // the caret there instead of forcing it to the end (srs-web#595); Enter/focus has no point,
  // so the end remains the right default there.
  $effect(() => {
    if (!el) return;
    typed = false;
    el.textContent = untrack(() => value);
    el.focus();
    const point = clickPoint;
    clickPoint = null;
    if (!point || !placeCaretAtPoint(el, point.x, point.y)) {
      getSelection()?.selectAllChildren(el);
      getSelection()?.collapseToEnd();
    }
  });

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

  // mousedown precedes the browser's own focus shift (which flips `editing` via onfocus,
  // below) — capture the point here so it's already set by the time the entering-edit effect
  // reads it. A plain click handler is too late: focus (and the effect it triggers) has
  // already run by then.
  function renderMouseDown(e: MouseEvent) {
    clickPoint = { x: e.clientX, y: e.clientY };
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
    onmousedown={renderMouseDown}
    onclick={renderClick}
    onkeydown={renderKeydown}
  >{@html html}</div>
{/if}
