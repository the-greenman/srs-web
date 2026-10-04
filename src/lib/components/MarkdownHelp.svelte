<!--
  MarkdownHelp — the markdown cheat-sheet popover. The host owns `open` and the trigger (header
  `?` button or the narrow overflow menu); this closes itself on its close button, Escape or a tap
  outside it (a `[data-md-help-trigger]` is outside but toggles itself). Pointer wording: the
  link row says Ctrl/Cmd+click with a mouse and long-press on touch (CSS `pointer: coarse`).
  The syntax is rendered by the core (renderMarkdown); this only lists what to type.
  Wraps .md-help (src/styles/components/md-help.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import IconButton from './IconButton.svelte';
  let { open = false, onclose }: { open?: boolean; onclose: () => void } = $props();

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

<svelte:window
  onkeydown={(e) => open && e.key === 'Escape' && onclose()}
  onpointerdown={(e) => open && !(e.target as Element).closest?.('.md-help__pop, [data-md-help-trigger]') && onclose()}
/>

{#if open}
  <div class="md-help__pop" role="region" aria-label="Markdown cheat-sheet">
    <IconButton class="md-help__close" icon={X} label="Close Markdown help" onclick={onclose} />
    <p class="md-help__lead">Paragraphs are markdown. Click a paragraph to edit its source.</p>
    <dl class="md-help__list">
      {#each rows as [syntax, what]}
        <dt><code>{syntax}</code></dt>
        <dd>
          {#if what}{what}{:else}link<span class="md-help__mouse"> (Ctrl/Cmd+click opens)</span><span class="md-help__touch"> (long-press to open)</span>{/if}
        </dd>
      {/each}
    </dl>
  </div>
{/if}
