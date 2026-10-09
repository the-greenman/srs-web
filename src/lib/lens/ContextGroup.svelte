<!--
  ContextGroup — one group of pane 3: a label, the count, and the linked records (bounded, "show more"
  pages). Clicking one selects it; the lens stays. In flat and inside/outside lists each record shows
  an in/out arrow and the link's name. "+" adds the record to the working set. A Panel (collapsible,
  count aside). Presentation only. Wraps .lens-context-group (lens.css).
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
    onAdd,
    open = true,
  }: {
    label: string;
    total: number;
    items: ContextItem[];
    onPick: (item: ContextItem) => void;
    onMore?: () => void;
    onAdd?: (item: ContextItem) => void;
    open?: boolean;
  } = $props();
</script>

<Panel title={label} aside={total} {open} class="lens-context-group">
  <ul class="lens-context-list" data-testid="lens-context-group" data-label={label}>
    {#each items as item, i (`${i}:${item.id}`)}
      <li class="lens-context-row">
        <button type="button" class="lens-context-item" onclick={() => onPick(item)}>
          <span>
            {#if item.direction}<span class="lens-context-item__dir" title={item.direction === "in" ? "links here" : "links out"}>{item.direction === "in" ? "←" : "→"}</span>{/if}
            {item.label}
          </span>
          {#if item.relation || item.typeName}<small>{[item.relation, item.typeName].filter(Boolean).join(" · ")}</small>{/if}
        </button>
        {#if onAdd}
          <button type="button" class="lens-context-add" data-testid="lens-ctx-add" aria-label={`Add ${item.label} to the set`} title="Add to the set" onclick={() => onAdd(item)}>+</button>
        {/if}
      </li>
    {/each}
  </ul>
  {#if onMore && total > items.length}
    <Button size="sm" onclick={onMore}>{total - items.length} more</Button>
  {/if}
</Panel>
