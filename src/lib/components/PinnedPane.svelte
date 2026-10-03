<!--
  PinnedPane — pinned attachments stacked in a Panel, readable while writing. Presentation
  only: the host owns which ids are pinned. Wraps Panel + .pinned (attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  import Panel from './Panel.svelte';

  let {
    items,
    onunpin,
  }: { items: { id: string; kind: string; title: string; text: string }[]; onunpin: (id: string) => void } = $props();
</script>

<Panel title="Pinned" aside={items.length} persistKey="essay.pinned">
  {#if items.length === 0}
    <p class="t-muted">Pin an attachment glyph to read it here.</p>
  {:else}
    <ul class="pinned">
      {#each items as it (it.id)}
        <li class="pinned__item">
          <span class="hover-card__kind">{it.kind}</span>
          <strong class="hover-card__title">{it.title}</strong>
          <button type="button" class="pinned__close" aria-label={`Unpin ${it.title}`} onclick={() => onunpin(it.id)}>×</button>
          {#if it.text}<p class="hover-card__text">{it.text}</p>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</Panel>
