<!--
  Collection — pane 1: the things you move through. One component, two shapes: a list (outline with
  depth, sections or type groups as headings; on the dark nav rail or a light surface) and a table
  (board layout; columns come resolved from the engine or the lens). Shows displayLabel, type, lifecycle
  and createdBy. Nested anchored containers expand one level on demand (the shell loads them).
  Presentation only: items arrive loaded (lens-data.ts). Wraps .lens-collection (lens.css).
-->
<script lang="ts">
  import ActorChip from "$lib/components/ActorChip.svelte";
  import Button from "$lib/components/Button.svelte";
  import LogTable from "$lib/components/LogTable.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import type { Status } from "$lib/types";
  import type { CollectionData, Item } from "./lens-data.js";

  let {
    data,
    mode = "list",
    selectedId = null,
    expanded = new Set<string>(),
    onDark = false,
    note,
    onSelect,
    onExpand,
    onMore,
  }: {
    data: CollectionData;
    mode?: "list" | "table";
    selectedId?: string | null;
    /** Items whose nested container is shown. */
    expanded?: Set<string>;
    /** On the dark nav rail. */
    onDark?: boolean;
    /** One line above the items, e.g. when the selection is outside this set. */
    note?: string;
    onSelect: (item: Item) => void;
    onExpand?: (item: Item) => void;
    onMore?: () => void;
  } = $props();

  const cell = (item: Item, name: string): string => {
    const v = item.record?.fieldValues[name];
    if (v == null || v === "") return "";
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? "…" : String(x))).join(", ");
    return typeof v === "object" ? "…" : String(v);
  };
  // A heading each time the group changes; items of one group are contiguous (loader order).
  const heading = (i: number): string | undefined =>
    data.items[i].group !== undefined && (i === 0 || data.items[i - 1].group !== data.items[i].group)
      ? data.items[i].group
      : undefined;
</script>

<div class="lens-collection" class:lens-collection--dark={onDark} data-testid="lens-collection" data-mode={mode}>
  {#if note}<p class="lens-empty lens-collection__note" data-testid="lens-collection-note">{note}</p>{/if}
  {#if data.items.length === 0}
    <p class="lens-empty">Nothing here.</p>
  {:else if mode === "table"}
    <LogTable columns={["", ...data.columns.map((c) => c.label), "Type", "Status"]}>
      {#each data.items as item, i}
        {@const h = heading(i)}
        {#if h !== undefined}
          <tr class="lens-table__group"><td colspan={data.columns.length + 3}>{h || "Untitled"}</td></tr>
        {/if}
        <tr
          class="lens-table__row"
          class:lens-table__row--selected={item.id === selectedId}
          aria-selected={item.id === selectedId}
          data-testid="lens-item"
          onclick={() => onSelect(item)}
        >
          <td class="log-table__decision">
            {item.label}
            {#if item.createdBy}<ActorChip actor={item.createdBy} />{/if}
          </td>
          {#each data.columns as c (c.name)}<td>{cell(item, c.name)}</td>{/each}
          <td class="log-table__nowrap">{item.typeName ?? ""}</td>
          <td>{#if item.lifecycle}<Tag status={item.lifecycle as Status} />{/if}</td>
        </tr>
      {/each}
    </LogTable>
  {:else}
    <ul class="lens-list" role="listbox" aria-label="Collection">
      {#each data.items as item, i}
        {@const h = heading(i)}
        {#if h !== undefined}
          <li class="lens-list__group" role="presentation">{h || "Untitled"}</li>
        {/if}
        <li
          class="lens-list__row"
          class:lens-list__row--selected={item.id === selectedId}
          role="option"
          aria-selected={item.id === selectedId}
          style:--lens-depth={item.depth}
        >
          <button type="button" class="lens-list__item" data-testid="lens-item" onclick={() => onSelect(item)}>
            <span class="lens-list__label">{item.label}</span>
            <span class="lens-list__meta">
              {#if item.typeName}<small class="lens-list__type">{item.typeName}</small>{/if}
              {#if item.lifecycle}<Tag status={item.lifecycle as Status} {onDark} />{/if}
              {#if item.createdBy}<ActorChip actor={item.createdBy} />{/if}
            </span>
          </button>
          {#if item.sectionContainerId && onExpand}
            <button
              type="button"
              class="lens-list__toggle"
              aria-expanded={expanded.has(item.id)}
              aria-label={`${expanded.has(item.id) ? "Collapse" : "Expand"} ${item.label}`}
              onclick={() => onExpand(item)}
            >{expanded.has(item.id) ? "−" : "+"}</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if onMore && data.total > data.items.length}
    <div class="lens-more">
      <Button size="sm" {onDark} onclick={onMore}>{data.total - data.items.length} more</Button>
    </div>
  {/if}
</div>
