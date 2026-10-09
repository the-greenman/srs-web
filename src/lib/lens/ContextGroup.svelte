<!--
  ContextGroup — one group of pane 3: a label, the count, and the neighbours (bounded, "show more"
  pages). Clicking a neighbour selects it; the lens stays. A Panel (collapsible, count aside).
  Presentation only. Wraps .lens-context-group (lens.css).
-->
<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import type { ContextItem } from "./lens-data.js";

  let {
    label,
    total,
    items,
    onPick,
    onMore,
    open = true,
  }: {
    label: string;
    total: number;
    items: ContextItem[];
    onPick: (item: ContextItem) => void;
    onMore?: () => void;
    open?: boolean;
  } = $props();
</script>

<Panel title={label} aside={total} {open} class="lens-context-group">
  <ul class="lens-context-list" data-testid="lens-context-group">
    {#each items as item (item.id)}
      <li>
        <button type="button" class="lens-context-item" onclick={() => onPick(item)}>
          <span>{item.label}</span>
          {#if item.typeName}<small>{item.typeName}</small>{/if}
        </button>
      </li>
    {/each}
  </ul>
  {#if onMore && total > items.length}
    <Button size="sm" onclick={onMore}>{total - items.length} more</Button>
  {/if}
</Panel>
