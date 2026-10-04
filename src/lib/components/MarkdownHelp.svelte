<!--
  MarkdownHelp — the markdown cheat-sheet, a Popover role="region". `open` is bindable and the host
  owns the trigger: a button with `popovertarget={id}` (the header help button) or any code that
  sets `open` (the narrow overflow menu). Escape, an outside tap and the close button close it.
  `anchor` is the element it is placed beside. Standalone: `<MarkdownHelp open {id} {anchor} />`. Pointer wording: the
  link row says Ctrl/Cmd+click with a mouse and long-press on touch (CSS `pointer: coarse`).
  The syntax is rendered by the core (renderMarkdown); this only lists what to type.
  Wraps .md-help (src/styles/components/md-help.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import IconButton from './IconButton.svelte';
  import Popover from './Popover.svelte';
  let {
    open = $bindable(false),
    onclose,
    id,
    anchor,
  }: { open?: boolean; onclose?: () => void; id?: string; anchor?: HTMLElement } = $props();

  const rows: [string, string][] = [
    ['# Heading', 'also ## and ###'],
    ['**bold**  *italic*  ~~struck~~', 'emphasis'],
    ['- item  /  1. item', 'lists'],
    ['[text](https://example.com)', ''],
    ['> quote', 'quotation'],
    ['`code`  /  ``` fenced ```', 'code'],
    ['| a | b |  then  |---|---|', 'table'],
  ];
</script>

<Popover bind:open {id} {anchor} {onclose} role="region" label="Markdown cheat-sheet" placement="bottom-end" class="md-help__pop">
  <IconButton class="md-help__close" icon={X} label="Close Markdown help" data-autofocus data-part="close" onclick={() => (open = false)} />
  <p class="md-help__lead">Paragraphs are markdown. Click a paragraph to edit its source.</p>
  <dl class="md-help__list">
    {#each rows as [syntax, what]}
      <dt><code>{syntax}</code></dt>
      <dd>
        {#if what}{what}{:else}link<span class="md-help__mouse"> (Ctrl/Cmd+click opens)</span><span class="md-help__touch"> (long-press to open)</span>{/if}
      </dd>
    {/each}
  </dl>
</Popover>
