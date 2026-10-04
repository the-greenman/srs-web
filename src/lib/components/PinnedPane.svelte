<!--
  PinnedPane — pinned attachments stacked in a Panel, readable while writing. Presentation
  only: the host owns which ids are pinned (and persists them). Open renders the text with the core renderMarkdown; Copy writes it to the clipboard. Wraps Panel + .pinned (attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  import Panel from './Panel.svelte';
  import { NARROW } from './narrow.js';
  import { renderMarkdown } from '$lib/srs-client.js';

  let open = $state<Set<string>>(new Set());
  let copied = $state<string | null>(null);
  const toggle = (id: string) => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    open = next;
  };
  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = id;
      setTimeout(() => copied === id && (copied = null), 1200);
    } catch {
      /* clipboard unavailable or denied: no feedback */
    }
  }

  let {
    items,
    onunpin,
    onremove,
  }: {
    items: { id: string; kind: string; relation?: string; title: string; text: string }[];
    onunpin: (id: string) => void;
    onremove?: (id: string) => void;
  } = $props();
</script>

<Panel title="Pinned" aside={items.length} persistKey="essay.pinned" collapseWhen={NARROW}>
  {#if items.length === 0}
    <p class="t-muted">Pin an attachment glyph to read it here.</p>
  {:else}
    <ul class="pinned">
      {#each items as it (it.id)}
        <li class="pinned__item">
          <span class="hover-card__kind">{it.relation ? `${it.kind} · ${it.relation}` : it.kind}</span>
          <strong class="hover-card__title">{it.title}</strong>
          <button type="button" class="pinned__close" aria-label={`Unpin ${it.title}`} onclick={() => onunpin(it.id)}>×</button>
          {#if it.text}
            {#if open.has(it.id)}
              <div class="pinned__full">{@html renderMarkdown(it.text)}</div>
            {:else}
              <p class="hover-card__text pinned__clamp">{it.text}</p>
            {/if}
            <div class="pinned__actions">
              <button type="button" class="pinned__action" aria-expanded={open.has(it.id)} onclick={() => toggle(it.id)}>{open.has(it.id) ? 'Close' : 'Open'}</button>
              <button type="button" class="pinned__action" onclick={() => copy(it.id, it.text)}>{copied === it.id ? 'Copied' : 'Copy'}</button>
            </div>
          {/if}
          {#if onremove}
            <div class="pinned__actions"><button type="button" class="pinned__action" onclick={() => onremove(it.id)}>Remove link</button></div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Panel>
