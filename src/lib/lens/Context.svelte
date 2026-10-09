<!--
  Context — pane 3: what is around the selected thing. One ContextGroup per lens context entry (or the
  repository defaults), then "In" (the containers it belongs to) and "Shown in" (the compositions that
  render those containers; picking one switches Focus to that document). Empty groups are hidden.
  Presentation only. Wraps .lens-context (lens.css).
-->
<script lang="ts">
  import Panel from "$lib/components/Panel.svelte";
  import type { ContextGroupData, ContextItem, Shown } from "./lens-data.js";
  import ContextGroup from "./ContextGroup.svelte";

  let {
    groups,
    containers = [],
    shown = [],
    onPick,
    onShow,
    onMore,
  }: {
    groups: ContextGroupData[];
    containers?: { containerId: string; title: string }[];
    shown?: Shown[];
    onPick: (item: ContextItem) => void;
    onShow?: (s: Shown) => void;
    onMore?: (index: number) => void;
  } = $props();

  const visible = $derived(groups.filter((g) => g.total > 0));
</script>

<div class="lens-context" data-testid="lens-context">
  {#if visible.length === 0 && containers.length === 0}
    <p class="lens-empty">No relations.</p>
  {/if}
  {#each groups as g, i (`${g.def.relationType}:${g.def.direction}:${g.def.label}`)}
    {#if g.total > 0}
      <ContextGroup label={g.def.label} total={g.total} items={g.items} {onPick} onMore={onMore ? () => onMore(i) : undefined} />
    {/if}
  {/each}
  {#if containers.length > 0}
    <Panel title="In" aside={containers.length} class="lens-context-group">
      <ul class="lens-context-list">
        {#each containers as c (c.containerId)}<li><span class="lens-context-item">{c.title}</span></li>{/each}
      </ul>
    </Panel>
  {/if}
  {#if shown.length > 0}
    <Panel title="Shown in" aside={shown.length} class="lens-context-group">
      <ul class="lens-context-list">
        {#each shown as s (`${s.compositionId}:${s.containerId}`)}
          <li>
            <button type="button" class="lens-context-item" data-testid="lens-shown-in" onclick={() => onShow?.(s)}>{s.label}</button>
          </li>
        {/each}
      </ul>
    </Panel>
  {/if}
</div>
