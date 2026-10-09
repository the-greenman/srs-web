<!--
  Collection — pane 1: the set you move through. A header with "Tell apart by" (the distinction: Nothing
  = label only, flat; Type, Nesting, Container, State, Created by, a select field = group headings with
  counts) and a Select toggle that turns rows into checkboxes (shift-click for a range) for drawing a set
  by hand; "Show as a set (N)" opens it as a lens. Two shapes: a list (on the dark nav rail or a light
  surface; depth indents only under Nesting) and a table (board layout; Nothing drops the Type/Status
  columns). Presentation only: items arrive loaded and grouped (lens-data.ts, lens-distinctions.ts).
  Wraps .lens-collection (lens.css).
-->
<script lang="ts">
  import ActorChip from "$lib/components/ActorChip.svelte";
  import Button from "$lib/components/Button.svelte";
  import LogTable from "$lib/components/LogTable.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import type { Status } from "$lib/types";
  import type { CollectionData, Item } from "./lens-data.js";
  import type { ByOption } from "./lens-distinctions.js";

  let {
    data,
    mode = "list",
    selectedId = null,
    expanded = new Set<string>(),
    onDark = false,
    note,
    by = "nesting",
    byOptions = [],
    onBy,
    picking = false,
    checked = new Set<string>(),
    setSize = 0,
    onPicking,
    onCheck,
    onShowSet,
    onClearSet,
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
    /** The current distinction (lens-distinctions.ts). */
    by?: string;
    byOptions?: ByOption[];
    onBy?: (by: string) => void;
    /** Rows show checkboxes for drawing a set by hand. */
    picking?: boolean;
    checked?: Set<string>;
    /** Records in the working set (checked here or added from Context). */
    setSize?: number;
    onPicking?: () => void;
    onCheck?: (ids: string[], on: boolean) => void;
    onShowSet?: () => void;
    onClearSet?: () => void;
    onSelect: (item: Item) => void;
    onExpand?: (item: Item) => void;
    onMore?: () => void;
  } = $props();

  const plain = $derived(by === "nothing");
  /** Lifecycle tags only when they tell rows apart. */
  const states = $derived(new Set(data.items.map((i) => i.lifecycle).filter(Boolean)).size > 1);
  const counts = $derived(
    data.items.reduce((m, i) => m.set(i.group, (m.get(i.group) ?? 0) + 1), new Map<string | undefined, number>())
  );
  const cell = (item: Item, name: string): string => {
    const v = item.record?.fieldValues[name];
    if (v == null || v === "") return "";
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? "…" : String(x))).join(", ");
    return typeof v === "object" ? "…" : String(v);
  };
  // A heading each time the group changes; items of one group are contiguous.
  const heading = (i: number): string | undefined =>
    data.items[i].group !== undefined && (i === 0 || data.items[i - 1].group !== data.items[i].group)
      ? data.items[i].group
      : undefined;

  let last: number | null = null;
  function check(i: number, shift: boolean): void {
    const on = !checked.has(data.items[i].id);
    const [a, b] = shift && last !== null ? [Math.min(last, i), Math.max(last, i)] : [i, i];
    last = i;
    onCheck?.(data.items.slice(a, b + 1).map((x) => x.id), on);
  }
</script>

<div class="lens-collection" class:lens-collection--dark={onDark} data-testid="lens-collection" data-mode={mode}>
  {#if onBy || onPicking}
    <div class="lens-pane-head">
      {#if onBy && byOptions.length > 0}
        <label class="lens-by">
          <span>Tell apart by</span>
          <select value={by} data-testid="lens-by" onchange={(e) => onBy((e.currentTarget as HTMLSelectElement).value)}>
            {#each byOptions as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
          </select>
        </label>
      {/if}
      {#if onPicking}
        <button type="button" class="lens-toggle" aria-pressed={picking} data-testid="lens-select-toggle" onclick={onPicking}>Select</button>
      {/if}
    </div>
  {/if}
  {#if setSize > 0}
    <div class="lens-pane-head lens-set-bar">
      <Button size="sm" variant="primary" {onDark} data-testid="lens-show-set" onclick={onShowSet}>Show as a set ({setSize})</Button>
      <button type="button" class="lens-toggle" data-testid="lens-clear-set" onclick={onClearSet}>Clear</button>
    </div>
  {/if}
  {#if note}<p class="lens-empty lens-collection__note" data-testid="lens-collection-note">{note}</p>{/if}
  {#if data.items.length === 0}
    <p class="lens-empty">Nothing here.</p>
  {:else if mode === "table"}
    <LogTable columns={["", ...data.columns.map((c) => c.label), ...(plain ? [] : ["Type", "Status"])]}>
      {#each data.items as item, i (`${i}:${item.id}`)}
        {@const h = heading(i)}
        {#if h !== undefined}
          <tr class="lens-table__group" data-testid="lens-group"><td colspan={data.columns.length + 3}>{h || "Untitled"} <small>{counts.get(item.group)}</small></td></tr>
        {/if}
        <tr
          class="lens-table__row"
          class:lens-table__row--selected={item.id === selectedId}
          aria-selected={item.id === selectedId}
          data-testid="lens-item"
          onclick={() => onSelect(item)}
        >
          <td class="log-table__decision">
            {#if picking}<input type="checkbox" checked={checked.has(item.id)} aria-label={`Add ${item.label} to the set`} onclick={(e) => { e.stopPropagation(); check(i, e.shiftKey); }} />{/if}
            {item.label}
            {#if item.createdBy && !plain && by !== "createdBy"}<ActorChip actor={item.createdBy} />{/if}
          </td>
          {#each data.columns as c (c.name)}<td>{cell(item, c.name)}</td>{/each}
          {#if !plain}
            <td class="log-table__nowrap">{by === "type" ? "" : (item.typeName ?? "")}</td>
            <td>{#if item.lifecycle && by !== "state"}<Tag status={item.lifecycle as Status} />{/if}</td>
          {/if}
        </tr>
      {/each}
    </LogTable>
  {:else}
    <ul class="lens-list" aria-label="Collection">
      {#each data.items as item, i (`${i}:${item.id}`)}
        {@const h = heading(i)}
        {#if h !== undefined}
          <li class="lens-list__group" data-testid="lens-group">{h || "Untitled"} <small>{counts.get(item.group)}</small></li>
        {/if}
        <li
          class="lens-list__row"
          class:lens-list__row--selected={item.id === selectedId}
          class:lens-list__row--picking={picking}
          aria-current={item.id === selectedId ? "true" : undefined}
          style:--lens-depth={by === "nesting" ? item.depth : 0}
        >
          {#if picking}
            <input type="checkbox" class="lens-list__check" data-testid="lens-check" checked={checked.has(item.id)} aria-label={`Add ${item.label} to the set`} onclick={(e) => check(i, e.shiftKey)} />
          {/if}
          <button type="button" class="lens-list__item" data-testid="lens-item" onclick={() => onSelect(item)}>
            <span class="lens-list__label">{item.label}</span>
            {#if !plain}
              <span class="lens-list__meta">
                {#if item.typeName && by !== "type"}<small class="lens-list__type" data-testid="lens-type-chip">{item.typeName}</small>{/if}
                {#if item.lifecycle && states && by !== "state"}<Tag status={item.lifecycle as Status} {onDark} />{/if}
                {#if item.createdBy && by !== "createdBy"}<ActorChip actor={item.createdBy} />{/if}
              </span>
            {/if}
          </button>
          {#if item.sectionContainerId && onExpand && by === "nesting"}
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
