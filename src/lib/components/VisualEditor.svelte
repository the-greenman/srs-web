<!--
  VisualEditor — the one Tiptap instance, for the focused paragraph only, destroyed on blur
  (srs-web#749, decision eb9b4530). Used only when MarkdownText is given mode="visual" (the essay's default). The editor
  library is a lazy chunk (dynamic import): reading an essay never loads it. All judgement is
  in the headless `visual-markdown.ts`; the core's renderMarkdown decides every round trip.
  Until the chunk is there the rendered text stays in place, focused, with the paragraph's rendered keys
  (nothing blanks, moves or loses focus on a slow connection); leaving it then ends the edit.
  Opens: if the core renders the round trip differently, `onfallback` hands the paragraph to
  the source editor with a note, text intact. Saves: commits after a 400 ms pause and on blur,
  only after a real document change (opening and leaving writes nothing); if the save check
  fails the text is still saved, then `onfallback` flips the paragraph to source with a note.
  Keys (srs-web#750): every key goes to `onkeydown` before the editor (a prevented key stops
  there), with split, edge and start answered from the document. `data-pristine` until the first
  change, so the essay history owns Ctrl-Z until then and the editor's own undo after.
  Toolbar (srs-web#751): the format buttons (heading is a menu) after the editor, each with its active state. A button
  takes no focus on mousedown, so a click keeps the edit and the caret; Tab reaches the buttons and
  the link field without ending the edit, which ends only when focus leaves the editor and toolbar.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Editor } from '@tiptap/core';
  import Bold from '@lucide/svelte/icons/bold';
  import Code from '@lucide/svelte/icons/code';
  import Heading from '@lucide/svelte/icons/heading';
  import Italic from '@lucide/svelte/icons/italic';
  import Link from '@lucide/svelte/icons/link';
  import List from '@lucide/svelte/icons/list';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import TextQuote from '@lucide/svelte/icons/text-quote';
  import { renderMarkdown } from '$lib/srs-client.js';
  import ActionMenu from './ActionMenu.svelte';
  import Button from './Button.svelte';
  import IconButton from './IconButton.svelte';
  import type { IconComponent } from './icon.js';
  import type { KeyApi } from './MarkdownText.svelte';
  import Popover from './Popover.svelte';

  const ICONS: Record<string, IconComponent> = {
    bold: Bold,
    italic: Italic,
    heading: Heading,
    bulletList: List,
    orderedList: ListOrdered,
    blockquote: TextQuote,
    code: Code,
  };

  let {
    value = '',
    base,
    label,
    placeholder = 'Write…',
    focusKey,
    images = true,
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
    /** As MarkdownText's, for the rendered text shown while the editor loads. */
    images?: boolean;
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
  let wrap = $state<HTMLElement>();
  /** The rendered text, in place until the editor has loaded. */
  let standIn = $state<HTMLElement>();
  let loading = $state(true);
  /** The editor once open, for the toolbar; `on` is each format's state at the last transaction. */
  let shown = $state.raw<Editor>();
  let on = $state<Record<string, boolean>>({});
  let linkOpen = $state(false);
  let href = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let editor: Editor | undefined;
  let checker: Editor | undefined;
  let lib = $state.raw<typeof import('$lib/visual-markdown.js')>();
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

  /**
   * Run `f` after the current event, unless the editor is gone by then. Svelte removing the focused
   * editor (a fallback to source) blurs it mid-flush, where writing state throws.
   */
  const later = (f: () => void) => queueMicrotask(() => gone || f());

  /** Focus moved to `to`: the edit ends unless it stayed in the editor or its toolbar. */
  function left(to: EventTarget | null) {
    if (to instanceof Node && wrap?.contains(to)) return;
    later(() => {
      flush();
      if (!gone) onblur();
    });
  }

  // The link field opens holding the link the caret is in, if any.
  $effect(() => {
    if (linkOpen) href = untrack(() => shown?.getAttributes('link').href ?? '');
  });

  function submitLink(e: SubmitEvent) {
    e.preventDefault();
    if (shown && lib) lib.setLink(shown, href);
    linkOpen = false;
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
    standIn?.focus({ preventScroll: true });
    (async () => {
      // Offline, or a tab left open across a deploy: the chunk cannot load, so edit the source instead.
      const l = await import('$lib/visual-markdown.js').catch(() => null);
      if (gone || !host) return;
      loading = false; // the stand-in goes away now: its blur ends nothing
      if (!l) {
        onfallback('Shown as markdown source: the visual editor could not be loaded.');
        return;
      }
      lib = l;
      if (!l.opensVisually(value, renderMarkdown)) {
        onfallback('Shown as markdown source: it holds something the visual editor does not edit.');
        return;
      }
      await tick(); // the host is laid out, so the click's point can be found in it
      if (gone || !host) return;
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
      editor.on('blur', ({ event }) => left(event.relatedTarget));
      const states = () => (on = Object.fromEntries([...l.FORMATS.flatMap((f) => ('menu' in f ? [f, ...f.menu] : [f])).map((f) => [f.name, f.active(ed)]), ['link', ed.isActive('link')]]));
      editor.on('transaction', () => later(states));
      states();
      shown = editor;
    })();
    return () => {
      gone = true;
      flush();
      editor?.destroy();
      checker?.destroy();
    };
  });
</script>

<div bind:this={wrap} class="visual-editor">
  {#if loading}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={standIn}
      class={`${base}__render`}
      role="group"
      tabindex="0"
      aria-label={label}
      aria-busy="true"
      data-placeholder={placeholder}
      data-focus-key={focusKey}
      onblur={() => later(() => loading && onblur())}
      onkeydown={(e) => onkeydown?.(e, { flush, replace, rendered: true })}
    >{@html value ? renderMarkdown(value, images) : ''}</div>
  {/if}
  <div bind:this={host} class={`${base}__body ${base}__body--visual`} hidden={loading}></div>
  {#if shown && lib}
    {@const ed = shown}
    <div
      class="visual-editor__toolbar"
      role="toolbar"
      aria-label="Formatting"
      data-feature="essay.format-toolbar"
      data-testid="format-toolbar"
      onfocusout={(e) => left(e.relatedTarget)}
    >
      {#each lib.FORMATS as f (f.name)}
        {#if 'menu' in f}
          <ActionMenu
            triggerIcon={ICONS[f.name]}
            title={f.label}
            label=""
            testid={`format-${f.name}`}
            pressed={!!on[f.name]}
            onmousedown={(e) => e.preventDefault()}
            actions={f.menu.map((m) => ({ id: m.name, label: m.label, enabled: true, checked: !!on[m.name], run: () => m.run(ed) }))}
          />
        {:else}
          <IconButton icon={ICONS[f.name]} label={f.label} pressed={!!on[f.name]} onmousedown={(e) => e.preventDefault()} onclick={() => f.run(ed)} />
        {/if}
      {/each}
      <Popover bind:open={linkOpen} label="Link" placement="bottom-start">
        {#snippet trigger({ props })}
          <IconButton icon={Link} label="Link" pressed={!!on.link} onmousedown={(e) => e.preventDefault()} {...props} />
        {/snippet}
        <form class="visual-editor__link" onsubmit={submitLink}>
          <input class="input" type="url" aria-label="Link address" placeholder="https://" bind:value={href} data-autofocus />
          <Button size="sm" type="submit">{href.trim() ? 'Apply' : 'Remove link'}</Button>
        </form>
      </Popover>
    </div>
  {/if}
</div>
