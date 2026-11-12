<!--
  VisualEditor — the one Tiptap instance, for the focused paragraph only, destroyed on blur
  (srs-web#749, decision eb9b4530). Off unless MarkdownText is given mode="visual". The editor
  library is a lazy chunk (dynamic import): reading an essay never loads it. All judgement is
  in the headless `visual-markdown.ts`; the core's renderMarkdown decides every round trip.
  Opens: if the core renders the round trip differently, `onfallback` hands the paragraph to
  the source editor with a note, text intact. Saves: commits after a 400 ms pause and on blur,
  only after a real document change (opening and leaving writes nothing); if the save check
  fails the text is still saved, then `onfallback` flips the paragraph to source with a note.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Editor } from '@tiptap/core';
  import { renderMarkdown } from '$lib/srs-client.js';

  let {
    value = '',
    base,
    label,
    placeholder = 'Write…',
    focusKey,
    oncommit,
    onfallback,
    onblur,
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
  } = $props();

  let host = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let editor: Editor | undefined;
  let checker: Editor | undefined;
  let lib: typeof import('$lib/visual-markdown.js') | undefined;
  let committed = '';
  let dirty = false;
  let gone = false;

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
        dirty = true;
        clearTimeout(timer);
        timer = setTimeout(flush, 400);
      });
      editor.view.dom.setAttribute('aria-label', label);
      editor.view.dom.setAttribute('aria-multiline', 'true');
      editor.view.dom.setAttribute('data-placeholder', placeholder);
      if (focusKey) editor.view.dom.setAttribute('data-focus-key', focusKey);
      // Take focus only if nothing else has it: the writer may have moved on while the chunk loaded.
      const active = document.activeElement;
      if (!active || active === document.body) editor.commands.focus('end');
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
