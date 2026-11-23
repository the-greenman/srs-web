<!--
  VisualEditor — the one Tiptap instance, for the focused paragraph only, destroyed on blur
  (srs-web#749, decision eb9b4530). Off unless MarkdownText is given mode="visual". The editor
  library is a lazy chunk (dynamic import): reading an essay never loads it. All judgement is
  in the headless `visual-markdown.ts`; the core's renderMarkdown decides every round trip.
  Opens: if the core renders the round trip differently, `onfallback` hands the paragraph to
  the source editor with a note, text intact. Saves: commits after a 400 ms pause and on blur,
  only after a real document change (opening and leaving writes nothing); if the save check
  fails the text is still saved, then `onfallback` flips the paragraph to source with a note.
  Keys (srs-web#750): every key goes to `onkeydown` before the editor (a prevented key stops
  there), with split, edge and start answered from the document. `data-pristine` until the first
  change, so the essay history owns Ctrl-Z until then and the editor's own undo after.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Editor } from '@tiptap/core';
  import { renderMarkdown } from '$lib/srs-client.js';
  import type { KeyApi } from './MarkdownText.svelte';

  let {
    value = '',
    base,
    label,
    placeholder = 'Write…',
    focusKey,
    oncommit,
    onfallback,
    onblur,
    onkeydown,
    caret = 'end',
  }: {
    value?: string;
    base: string;
    label: string;
    placeholder?: string;
    focusKey?: string;
    oncommit: (value: string) => void;
    /** The paragraph cannot be edited visually: show it as source, with this one-line note. */
    onfallback: (note: string) => void;
    onblur: () => void;
    /** Every key reaches this first (Block's paragraph shortcuts); a prevented key never reaches the editor. */
    onkeydown?: (e: KeyboardEvent, api: KeyApi) => void;
    /** Where the caret opens: a start or end, or the viewport point the writer clicked. */
    caret?: 'start' | 'end' | { x: number; y: number };
  } = $props();

  let host = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let editor: Editor | undefined;
  let checker: Editor | undefined;
  let lib: typeof import('$lib/visual-markdown.js') | undefined;
  let committed = '';
  let dirty = false;
  let gone = false;

  /** Show `v` and take it as already committed: the caller writes it (a split's first half). */
  function replace(v: string) {
    clearTimeout(timer);
    dirty = false;
    committed = v;
    editor?.commands.setContent(v, { contentType: 'markdown', emitUpdate: false });
  }

  function flush() {
    clearTimeout(timer);
    if (!editor || !lib || !dirty) return;
    dirty = false;
    const md = lib.toMarkdown(editor);
    if (md === committed) return;
    committed = md;
    oncommit(md);
    checker ??= lib.makeEditor('');
    if (!lib.savesFaithfully(editor, md, checker, renderMarkdown)) {
      onfallback('This text needs the markdown source to be exact. It is saved; edit it here.');
    }
  }

  onMount(() => {
    committed = value;
    (async () => {
      const l = await import('$lib/visual-markdown.js');
      if (gone || !host) return;
      lib = l;
      if (!l.opensVisually(value, renderMarkdown)) {
        onfallback('Shown as markdown source: it holds something the visual editor does not edit.');
        return;
      }
      editor = l.makeEditor(value, host, () => {
        // Typed: the editor's own undo owns Ctrl-Z from here, not the essay history.
        editor?.view.dom.removeAttribute('data-pristine');
        dirty = true;
        clearTimeout(timer);
        timer = setTimeout(flush, 400);
      });
      editor.view.dom.setAttribute('aria-label', label);
      editor.view.dom.setAttribute('aria-multiline', 'true');
      editor.view.dom.setAttribute('data-placeholder', placeholder);
      editor.view.dom.setAttribute('data-pristine', '');
      if (focusKey) editor.view.dom.setAttribute('data-focus-key', focusKey);
      const ed = editor;
      const api: KeyApi = {
        flush,
        replace,
        rendered: false,
        value: () => l.toMarkdown(ed),
        split: () => l.splitAt(ed, ed.state.selection.from),
        atEdge: (up) => l.atEdge(ed, up),
        atStart: () => l.atStart(ed),
      };
      ed.setOptions({
        editorProps: {
          handleKeyDown: (_view, e) => {
            onkeydown?.(e, api);
            return e.defaultPrevented;
          },
        },
      });
      // Take focus only if nothing else has it: the writer may have moved on while the chunk loaded.
      const active = document.activeElement;
      const at = typeof caret === 'object' ? ed.view.posAtCoords({ left: caret.x, top: caret.y })?.pos : caret;
      if (!active || active === document.body) ed.commands.focus(at ?? 'end');
      editor.on('blur', () => {
        flush();
        onblur();
      });
    })();
    return () => {
      gone = true;
      flush();
      editor?.destroy();
      checker?.destroy();
    };
  });
</script>

<div bind:this={host} class={`${base}__body ${base}__body--visual`}></div>
