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
  import { mapRenderedOffsetToSource, renderedOffsetAtPoint } from './markdown-caret.js';

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
  /**
   * A source offset to land the caret on when edit mode opens, set by a click on the
   * rendered view (srs-web#595); `null` means keyboard entry, which keeps the caret at the
   * end. Captured on `mousedown` (`renderMouseDown`), not `click` — focus flips `editing` to
   * true as soon as the browser focuses this element on mousedown, which swaps the rendered
   * div out of the DOM before a `click` would fire on it.
   */
  let pendingCaret = $state<number | null>(null);
  const html = $derived(value ? renderMarkdown(value) : '');

  // Entering edit: show the source, keep focus, caret at the click point (or the end for
  // keyboard entry / when the click couldn't be resolved to a source offset).
  $effect(() => {
    if (!el) return;
    typed = false;
    const v = untrack(() => value);
    el.textContent = v;
    el.focus();
    const offset = untrack(() => pendingCaret);
    const atText = el.firstChild;
    if (offset !== null && atText) {
      const range = document.createRange();
      range.setStart(atText, Math.max(0, Math.min(offset, v.length)));
      range.collapse(true);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      getSelection()?.selectAllChildren(el);
      getSelection()?.collapseToEnd();
    }
    pendingCaret = null;
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

  /**
   * Plain click edits; Ctrl/Cmd+click on a rendered link opens it instead. The actual work
   * happens on `mousedown` (see `renderMouseDown`) — by the time `click` fires, this
   * element's default mousedown-triggered focus has already flipped `editing` to true and
   * swapped it out of the DOM. This handler still runs for a Ctrl/Cmd+click on a link, since
   * `renderMouseDown` deliberately prevents the default (focusing) action for that case so
   * the element stays in place long enough for `click` to open the link.
   */
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

  /**
   * Runs before the browser's default mousedown action focuses this element (which flips
   * `editing` to true via `onfocus`, swapping the rendered div out of the DOM). A Ctrl/Cmd
   * click on a link prevents that default so focus never happens and `click` can open the
   * link (see `renderClick`); otherwise this resolves the click point to a source offset,
   * for the entry `$effect` to place the caret on once edit mode opens.
   */
  function renderMouseDown(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a');
    if (a && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      return;
    }
    const container = e.currentTarget as HTMLElement;
    const renderedOffset = renderedOffsetAtPoint(container, e.clientX, e.clientY);
    pendingCaret = renderedOffset === null ? null : mapRenderedOffsetToSource(value, renderedOffset);
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
