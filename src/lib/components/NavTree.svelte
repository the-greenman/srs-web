<!--
  NavTree — collapsible, filterable navigation for a large repository (muDemocracy.org#282, phase 6).
  A WAI-ARIA tree over a flat node list (src/lib/nav-tree.ts decides the rows, the keys and what is remembered).
  - collapsed by default; the expanded set is a bindable Set and, with `storageKey`, is remembered
  - an optional filter box: matches show with their ancestors opened
  - the active row is scrolled into view (`block: "nearest"`)
  - arrow keys, Home, End, Enter; one row is in the tab order (roving tabindex)
  Wraps .nav-tree (src/styles/components/nav-tree.css); sits in the dark Nav rail.
  Parts: data-part="tree" "filter" "row" "toggle" "label" "detail" "count" "empty".
-->
<script lang="ts">
  import { tick } from 'svelte';
  import {
    keyNavigate,
    loadExpanded,
    saveExpanded,
    visibleRows,
    type NavKey,
    type NavTreeNode,
  } from '../nav-tree.js';

  let {
    nodes,
    activeId = null,
    expanded = $bindable(new Set<string>()),
    storageKey,
    filterable = false,
    label,
    onselect,
    testid,
  }: {
    nodes: NavTreeNode[];
    /** The node shown as current; scrolled into view when it changes. */
    activeId?: string | null;
    /** Ids of open nodes. Collapsed when empty. */
    expanded?: Set<string>;
    /** localStorage key to remember `expanded` under; absent = not remembered. */
    storageKey?: string;
    /** Show the filter box. */
    filterable?: boolean;
    /** Accessible name of the tree. */
    label: string;
    onselect?: (node: NavTreeNode) => void;
    testid?: string;
  } = $props();

  const uid = $props.id();
  let filter = $state('');
  let focusId = $state<string | null>(null);
  let root = $state<HTMLElement | undefined>();

  // Restore once, before the first render (the host loads lazy children for the restored ids).
  if (storageKey) {
    const restored = loadExpanded(storageKey, typeof localStorage === 'undefined' ? undefined : localStorage);
    if (restored.size > 0) expanded = restored;
  }

  const rows = $derived(visibleRows(nodes, expanded, filter));
  const tabId = $derived(
    rows.some((r) => r.node.id === focusId)
      ? focusId
      : rows.some((r) => r.node.id === activeId)
        ? activeId
        : (rows[0]?.node.id ?? null),
  );

  function setOpen(id: string, open: boolean): void {
    const next = new Set(expanded);
    if (open) next.add(id);
    else next.delete(id);
    expanded = next;
    if (storageKey) saveExpanded(storageKey, next, typeof localStorage === 'undefined' ? undefined : localStorage);
  }

  function rowEl(id: string): HTMLElement | null {
    return root?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`) ?? null;
  }

  async function focusRow(id: string): Promise<void> {
    focusId = id;
    await tick();
    rowEl(id)?.focus();
  }

  function onkeydown(event: KeyboardEvent, id: string): void {
    const key = event.key;
    if (key === 'Enter' || key === ' ') {
      const node = nodes.find((n) => n.id === id);
      if (node) {
        event.preventDefault();
        onselect?.(node);
      }
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const result = keyNavigate(rows, id, key as NavKey);
    if (result.toggle) setOpen(result.toggle.id, result.toggle.open);
    if (result.focus) void focusRow(result.focus);
  }

  // Keep the current item visible in a long list.
  $effect(() => {
    const id = activeId;
    if (!id) return;
    void rows;
    void tick().then(() => rowEl(id)?.scrollIntoView?.({ block: 'nearest' }));
  });
</script>

<div class="nav-tree" bind:this={root} data-part="tree" data-testid={testid}>
  {#if filterable}
    <input
      class="nav-tree__filter"
      data-part="filter"
      type="search"
      placeholder="Filter"
      aria-label="Filter {label}"
      aria-controls="tree-{uid}"
      bind:value={filter}
    />
  {/if}
  <ul class="nav-tree__list" role="tree" id="tree-{uid}" aria-label={label}>
    {#each rows as row (row.node.id)}
      {@const id = row.node.id}
      <li
        class="nav-tree__item"
        role="treeitem"
        aria-level={row.level + 1}
        aria-expanded={row.expandable ? row.expanded : undefined}
        aria-selected={id === activeId}
        data-part="row"
        data-kind={row.node.kind}
        style:--nav-tree-level={row.level}
      >
        <div class="nav-tree__row" class:nav-tree__row--active={id === activeId}>
          {#if row.expandable}
            <button
              type="button"
              class="nav-tree__toggle"
              data-part="toggle"
              tabindex="-1"
              aria-label="Toggle {row.node.label}"
              aria-expanded={row.expanded}
              onclick={() => setOpen(id, !row.expanded)}
            >{row.expanded ? '−' : '+'}</button>
          {:else}
            <span class="nav-tree__toggle nav-tree__toggle--leaf" aria-hidden="true"></span>
          {/if}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <span
            class="nav-tree__label"
            data-part="label"
            data-node={id}
            role="button"
            tabindex={id === tabId ? 0 : -1}
            onfocus={() => (focusId = id)}
            onclick={() => {
              focusId = id;
              onselect?.(row.node);
            }}
            onkeydown={(e) => onkeydown(e, id)}
          >
            <span class="nav-tree__text">{row.node.label}</span>
            {#if row.node.detail}<small class="nav-tree__detail" data-part="detail" data-testid={row.node.kind === 'note' ? 'member-note-mark' : undefined}>{row.node.detail}</small>{/if}
            {#if row.node.count != null}<small class="nav-tree__count" data-part="count">{row.node.count}</small>{/if}
          </span>
        </div>
      </li>
    {/each}
  </ul>
  {#if rows.length === 0}
    <p class="nav-tree__empty" data-part="empty">{filter.trim() ? 'No match' : 'Nothing here'}</p>
  {/if}
</div>
