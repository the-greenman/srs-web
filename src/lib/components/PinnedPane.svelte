<!--
  PinnedPane — pinned attachments stacked in a Panel, readable while writing. Presentation
  only: the host owns which ids are pinned (and persists them). Open renders the text with the core renderMarkdown; Copy writes it to the clipboard. Wraps Panel + .pinned (attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import AttachmentPreview from './AttachmentPreview.svelte';
  import Button from './Button.svelte';
  import IconButton from './IconButton.svelte';
  import Panel from './Panel.svelte';
  import { NARROW } from '$lib/breakpoints';
  import MarkdownView from './MarkdownView.svelte';

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
          <IconButton class="pinned__close" size="sm" icon={X} label={`Unpin ${it.title}`} onclick={() => onunpin(it.id)} />
          {#if open.has(it.id) && it.text}
            <AttachmentPreview kind={it.kind} title={it.title} relation={it.relation} />
            <MarkdownView class="pinned__full" value={it.text} />
          {:else}
            <AttachmentPreview kind={it.kind} title={it.title} relation={it.relation} text={it.text} clamp />
          {/if}
          {#if it.text || onremove}
            <div class="pinned__actions" data-part="actions">
              {#if it.text}
                <Button size="sm" variant="ghost" aria-expanded={open.has(it.id)} onclick={() => toggle(it.id)}>{open.has(it.id) ? 'Close' : 'Open'}</Button>
                <Button size="sm" variant="ghost" onclick={() => copy(it.id, it.text)}>{copied === it.id ? 'Copied' : 'Copy'}</Button>
              {/if}
              {#if onremove}<Button size="sm" variant="ghost" onclick={() => onremove(it.id)}>Remove link</Button>{/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Panel>
