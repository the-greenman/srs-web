<!--
  ContextGroup — one group of pane 3: a label (the engine's relation label, or "Inside this set" /
  "Leaving this set" / "Links"), the count, and the linked records. The edges are already loaded
  (one neighbours read, lens-data.ts loadEdges); "Show more" reveals the next NEIGHBOUR_PAGE of them,
  with no second read. Each record shows an in/out arrow (Lucide, aria-hidden; "links here" / "links
  out" is its accessible name) and its type. Clicking one selects it; the lens stays. "+" (IconButton)
  adds the record to the working set. A Panel (collapsible, count aside). Presentation only.
  Wraps .lens-context-group (lens.css). Parts: list, row, item, add.
-->
<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Plus from "@lucide/svelte/icons/plus";
  import Button from "$lib/components/Button.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import { type ContextItem, NEIGHBOUR_PAGE } from "./lens-data.js";

  let {
    label,
    total,
    items,
    onPick,
    onAdd,
    open = true,
  }: {
    label: string;
    total: number;
    items: ContextItem[];
    onPick: (item: ContextItem) => void;
    onAdd?: (item: ContextItem) => void;
    open?: boolean;
  } = $props();

  let limit = $state(NEIGHBOUR_PAGE);
  const visible = $derived(items.slice(0, limit));
  const rest = $derived(items.length - visible.length);
</script>

<Panel title={label} aside={total} {open} class="lens-context-group">
  <ul class="lens-context-list" data-part="list" data-testid="lens-context-group" data-label={label}>
    {#each visible as item, i (`${i}:${item.id}`)}
      <li class="lens-context-row" data-part="row" data-direction={item.direction}>
        <button type="button" class="lens-context-item" data-part="item" data-testid="lens-context-item" onclick={() => onPick(item)}>
          <span>
            <span class="lens-context-item__dir">
              {#if item.direction === "in"}<ArrowLeft size={12} aria-hidden="true" />{:else}<ArrowRight size={12} aria-hidden="true" />{/if}
              <span class="sr-only">{item.direction === "in" ? "links here" : "links out"}</span>
            </span>
            {item.label}
          </span>
          {#if item.typeName}<small>{item.typeName}</small>{/if}
        </button>
        {#if onAdd}
          <IconButton icon={Plus} size="sm" label={`Add ${item.label} to the set`} class="lens-context-add" data-part="add" data-testid="lens-ctx-add" onclick={() => onAdd(item)} />
        {/if}
      </li>
    {/each}
  </ul>
  {#if rest > 0}
    <Button size="sm" data-testid="lens-context-more" onclick={() => (limit += NEIGHBOUR_PAGE)}>Show {Math.min(rest, NEIGHBOUR_PAGE)} more</Button>
  {/if}
</Panel>
