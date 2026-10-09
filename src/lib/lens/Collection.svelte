<!--
  Collection — pane 1: the set you move through. A header with "Tell the set apart by" (Nothing = label
  only, flat; Type, Nesting, Container, State, Created by = group headings with counts; Created by
  headings are ActorChips) and a Select toggle that turns rows into checkboxes (shift-click for a range)
  for drawing a set by hand. The set bar: "Show as a set (N)" the first time, "Replace My set with these
  (N)" once My set exists (only while the checks differ from it), "Clear selection" (drops the checks)
  and, on My set, "Remove My set" (deletes it). Two shapes: a list (on the dark nav
  rail or a light surface; depth indents only under Nesting; a nested container expands one level) and
  a table (the ADR-010 list pane for Lenses: columns are the given ColumnSpec / fixed columns, and a
  column no row has a value in is dropped). The set bar sits in flow above the rows and sticks to the top
  of the pane's scroller while it scrolls.
  Presentation only: "Tell apart by" is grouping over loaded items (ADR-025, D7); items arrive loaded
  and grouped (lens-data.ts, lens-distinctions.ts). Wraps .lens-collection (lens.css).
  Parts: head, by, set-bar, group, row, toggle.
-->
<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type { CollectionBy } from "$lib/address.js";
  import ActorChip from "$lib/components/ActorChip.svelte";
  import Button from "$lib/components/Button.svelte";
  import Checkbox from "$lib/components/Checkbox.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import LogTable from "$lib/components/LogTable.svelte";
  import Select from "$lib/components/Select.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import type { Status } from "$lib/types";
  import type { CollectionData, Column, Item } from "./lens-data.js";
  import { type ByOption, NOT_SET } from "./lens-distinctions.js";

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
    checkedCount = 0,
    canShow = false,
    setShown = false,
    onPicking,
    onCheck,
    onShowSet,
    onClearChecks,
    onRemoveSet,
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
    by?: CollectionBy;
    byOptions?: ByOption[];
    onBy?: (by: CollectionBy) => void;
    /** Rows show checkboxes for drawing a set by hand. */
    picking?: boolean;
    checked?: Set<string>;
    /** Records checked (here or added from Context). */
    checkedCount?: number;
    /** The checks differ from My set: the bar offers to show them. */
    canShow?: boolean;
    /** "My set" exists: the show button reads "Replace My set with these (N)". */
    setShown?: boolean;
    onPicking?: () => void;
    onCheck?: (ids: string[], on: boolean) => void;
    onShowSet?: () => void;
    /** "Clear selection": drop the checks. */
    onClearChecks?: () => void;
    /** "Remove My set": given only on the My set lens. */
    onRemoveSet?: () => void;
    onSelect: (item: Item) => void;
    onExpand?: (item: Item) => void;
    onMore?: () => void;
  } = $props();

  const plain = $derived(by === "none");
  /** Lifecycle tags only when they tell rows apart. */
  const states = $derived(new Set(data.items.map((i) => i.lifecycle).filter(Boolean)).size > 1);
  const counts = $derived(
    data.items.reduce(
      (m, i) => m.set(i.group, (m.get(i.group) ?? 0) + 1),
      new Map<string | undefined, number>()
    )
  );
  const text = (v: unknown): string => {
    if (v == null || v === "") return "";
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? "…" : String(x))).join(", ");
    return typeof v === "object" ? "…" : String(v);
  };
  const cell = (item: Item, c: Column): string =>
    c.kind === "field"
      ? text(item.record?.fieldValues[c.fieldName])
      : c.kind === "type"
        ? (item.typeName ?? "")
        : c.kind === "state"
          ? (item.lifecycle ?? "")
          : item.label;
  const header = (c: Column): string =>
    c.kind === "field" ? c.label : c.kind === "type" ? "Type" : c.kind === "state" ? "Status" : "";
  /** Table columns: the label first, then the given ones some row fills (none under Nothing, never the grouped one). */
  const cols = $derived<Column[]>([
    { kind: "label" },
    ...data.columns.filter(
      (c) =>
        c.kind !== "label" &&
        !(plain && c.kind !== "field") &&
        !(c.kind === "type" && by === "type") &&
        !(c.kind === "state" && by === "state") &&
        data.items.some((i) => cell(i, c) !== "")
    ),
  ]);
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

{#snippet groupLabel(item: Item, h: string)}
  {#if by === "created-by"}
    <ActorChip actor={h === NOT_SET ? undefined : item.createdBy} />
  {:else}
    {h || "Untitled"}
  {/if}
  <small>{counts.get(item.group)}</small>
{/snippet}

<div class="lens-collection" class:lens-collection--dark={onDark} data-testid="lens-collection" data-mode={mode}>
  {#if onBy || onPicking}
    <div class="lens-pane-head" data-part="head">
      {#if onBy && byOptions.length > 0}
        <label class="lens-by" data-part="by">
          <span>Tell the set apart by</span>
          <Select
            value={by}
            options={byOptions}
            data-testid="lens-by"
            onchange={(e) => onBy((e.currentTarget as HTMLSelectElement).value as CollectionBy)}
          />
        </label>
      {/if}
      {#if onPicking}
        <Button size="sm" variant="mono" {onDark} active={picking} aria-pressed={picking} data-testid="lens-select-toggle" onclick={onPicking}>Select</Button>
      {/if}
    </div>
  {/if}
  {#if canShow || (picking && checkedCount > 0) || onRemoveSet}
    <div class="lens-pane-head lens-set-bar" data-part="set-bar" data-testid="lens-set-bar">
      {#if canShow}
        <Button size="sm" variant="primary" {onDark} data-testid="lens-show-set" onclick={onShowSet}>{setShown ? "Replace My set with these" : "Show as a set"} ({checkedCount})</Button>
      {/if}
      {#if checkedCount > 0}
        <Button size="sm" variant="ghost" {onDark} data-testid="lens-clear-checks" onclick={onClearChecks}>Clear selection</Button>
      {/if}
      {#if onRemoveSet}
        <Button size="sm" variant="ghost" {onDark} data-testid="lens-remove-set" onclick={onRemoveSet}>Remove My set</Button>
      {/if}
    </div>
  {/if}
  {#if note}<p class="lens-empty lens-collection__note" data-testid="lens-collection-note">{note}</p>{/if}
  {#if data.items.length === 0}
    <p class="lens-empty">Nothing here.</p>
  {:else if mode === "table"}
    <LogTable columns={cols.map(header)}>
      {#each data.items as item, i (`${i}:${item.id}`)}
        {@const h = heading(i)}
        {#if h !== undefined}
          <tr class="lens-table__group" data-part="group" data-testid="lens-group"><td colspan={cols.length}>{@render groupLabel(item, h)}</td></tr>
        {/if}
        <tr
          class="lens-table__row"
          class:lens-table__row--selected={item.id === selectedId}
          aria-selected={item.id === selectedId}
          data-part="row"
          data-testid="lens-item"
          onclick={() => onSelect(item)}
        >
          {#each cols as c, ci (ci)}
            {#if c.kind === "label"}
              <td class="log-table__decision">
                {#if picking}
                  <Checkbox
                    checked={checked.has(item.id)}
                    aria-label={`Add ${item.label} to the set`}
                    data-testid="lens-check"
                    onclick={(e) => {
                      e.stopPropagation();
                      check(i, e.shiftKey);
                    }}
                  />
                {/if}
                {item.label}
                {#if item.createdBy && !plain && by !== "created-by"}<ActorChip actor={item.createdBy} />{/if}
              </td>
            {:else if c.kind === "state"}
              <td>{#if item.lifecycle}<Tag status={item.lifecycle as Status} />{/if}</td>
            {:else}
              <td class:log-table__nowrap={c.kind === "type"}>{cell(item, c)}</td>
            {/if}
          {/each}
        </tr>
      {/each}
    </LogTable>
  {:else}
    <ul class="lens-list" aria-label="Collection">
      {#each data.items as item, i (`${i}:${item.id}`)}
        {@const h = heading(i)}
        {#if h !== undefined}
          <li class="lens-list__group" data-part="group" data-testid="lens-group">{@render groupLabel(item, h)}</li>
        {/if}
        <li
          class="lens-list__row"
          class:lens-list__row--selected={item.id === selectedId}
          class:lens-list__row--picking={picking}
          aria-current={item.id === selectedId ? "true" : undefined}
          style:--lens-depth={by === "nesting" ? item.depth : 0}
          data-part="row"
        >
          {#if picking}
            <Checkbox
              checked={checked.has(item.id)}
              aria-label={`Add ${item.label} to the set`}
              data-testid="lens-check"
              onclick={(e) => check(i, e.shiftKey)}
            />
          {/if}
          <button type="button" class="lens-list__item" data-testid="lens-item" onclick={() => onSelect(item)}>
            <span class="lens-list__label">{item.label}</span>
            {#if !plain}
              <span class="lens-list__meta">
                {#if item.typeName && by !== "type"}<small class="lens-list__type" data-testid="lens-type-chip">{item.typeName}</small>{/if}
                {#if item.lifecycle && states && by !== "state"}<Tag status={item.lifecycle as Status} {onDark} />{/if}
                {#if item.createdBy && by !== "created-by"}<ActorChip actor={item.createdBy} />{/if}
              </span>
            {/if}
          </button>
          {#if item.sectionContainerId && onExpand && by === "nesting"}
            <IconButton
              icon={expanded.has(item.id) ? ChevronDown : ChevronRight}
              label={`${expanded.has(item.id) ? "Collapse" : "Expand"} ${item.label}`}
              size="sm"
              class="lens-list__toggle"
              aria-expanded={expanded.has(item.id)}
              data-part="toggle"
              data-testid="lens-expand"
              onclick={() => onExpand(item)}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if onMore && data.total > data.items.length}
    <div class="lens-more">
      <p class="lens-empty" data-testid="lens-paged">{data.items.length} of {data.total}</p>
      <Button size="sm" {onDark} onclick={onMore}>{data.total - data.items.length} more</Button>
    </div>
  {/if}
</div>
