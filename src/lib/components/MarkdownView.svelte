<!--
  MarkdownView — read-only rendered markdown: the ONE `{@html renderMarkdown(...)}` site for
  display (CommentThread, PinnedPane). The core renderMarkdown output is already sanitized, so
  nothing here escapes or filters. MarkdownText keeps its own render on its contenteditable element
  (a documented exception: it is an editor, and moving it would change Block's DOM).
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { renderMarkdown } from '$lib/srs-client.js';

  let {
    value,
    mark = '',
    class: klass = '',
    ...rest
  }: { value: string; mark?: string; class?: string } & HTMLAttributes<HTMLDivElement> = $props();
  let root = $state<HTMLElement>();

  /** Highlight `words` in the rendered text: each text-node piece of the first match gets a <mark> (srs-web#525). */
  $effect(() => {
    void value;
    const el = root;
    const needle = mark.replace(/\s+/g, ' ').trim();
    if (!el || !needle || el.querySelector('mark')) return;
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    // One whitespace-collapsed string, each character remembering its text node and offset.
    let flat = '';
    const at: { node: Text; i: number }[] = [];
    for (const node of nodes)
      [...node.data].forEach((ch, i) => {
        if (/\s/.test(ch) && (flat === '' || flat.endsWith(' '))) return;
        flat += /\s/.test(ch) ? ' ' : ch;
        at.push({ node, i });
      });
    const from = flat.indexOf(needle);
    if (from < 0) return;
    const hits = at.slice(from, from + needle.length);
    const spans = new Map<Text, [number, number]>();
    for (const h of hits) {
      const r = spans.get(h.node);
      spans.set(h.node, r ? [r[0], h.i + 1] : [h.i, h.i + 1]);
    }
    for (const [node, [a, b]] of spans) {
      const range = document.createRange();
      range.setStart(node, a);
      range.setEnd(node, b);
      range.surroundContents(document.createElement('mark'));
    }
    el.querySelector('mark')?.scrollIntoView?.({ block: 'nearest' });
  });
</script>

<div bind:this={root} class={`md-view ${klass}`} {...rest}>{@html renderMarkdown(value)}</div>
