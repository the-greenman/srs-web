<!--
  MarkdownHelp — a `?` button that opens a markdown cheat-sheet (native <details>, no deps).
  The syntax is rendered by the core (renderMarkdown); this only lists what to type.
  Wraps .md-help (src/styles/components/md-help.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  const rows: [string, string][] = [
    ['# Heading', 'also ## and ###'],
    ['**bold**  *italic*  ~~struck~~', 'emphasis'],
    ['- item  /  1. item', 'lists'],
    ['[text](https://example.com)', 'link (Ctrl/Cmd+click opens)'],
    ['> quote', 'quotation'],
    ['`code`  /  ``` fenced ```', 'code'],
    ['| a | b |  then  |---|---|', 'table'],
  ];
</script>

<details class="md-help">
  <summary class="md-help__btn" aria-label="Markdown help" title="Markdown help">?</summary>
  <div class="md-help__pop" role="region" aria-label="Markdown cheat-sheet">
    <p class="md-help__lead">Paragraphs are markdown. Click a paragraph to edit its source.</p>
    <dl class="md-help__list">
      {#each rows as [syntax, what]}
        <dt><code>{syntax}</code></dt>
        <dd>{what}</dd>
      {/each}
    </dl>
  </div>
</details>
