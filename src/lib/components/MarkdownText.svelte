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
    onkeydown?: (e: KeyboardEvent, api: { flush: () => void; el?: HTMLElement; rendered: boolean }) => void;
  } = $props();

  let el = $state<HTMLElement>();
  let editing = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let committed = '';
  const html = $derived(value ? renderMarkdown(value) : '');

  // Entering edit: show the source, keep focus, caret at the end.
  $effect(() => {
    if (!el) return;
    el.textContent = untrack(() => value);
    el.focus();
    getSelection()?.selectAllChildren(el);
    getSelection()?.collapseToEnd();
  });

  // Show external changes (agent writes) unless the writer is mid-edit here.
  $effect(() => {
    const v = value;
    committed = v;
    if (el && document.activeElement !== el && el.innerText !== v) el.textContent = v;
  });

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
    } else onkeydown?.(e, { flush, el, rendered: true });
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
    oninput={() => {
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    }}
    onblur={() => {
      flush();
      editing = false;
    }}
    onkeydown={(e) => onkeydown?.(e, { flush, el, rendered: false })}
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
    onclick={renderClick}
    onkeydown={renderKeydown}
  >{@html html}</div>
{/if}
