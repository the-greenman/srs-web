<!--
  Context — pane 3: what links to the selected thing. A header with "Tell apart by": Link type (one
  ContextGroup per relation type and direction present at the record, labelled by the engine, then "In"
  containers and "Shown in" compositions), Nothing (one flat list, each link with an in/out arrow), or
  Inside or outside the set (links whose other end is in the set vs links that leave it). Groups arrive
  built (lens-data.ts groupEdges, lens-distinctions.ts splitByBoundary). Empty groups are hidden.
  "Shown in" lists only the compositions it is given. Presentation only. Wraps .lens-context (lens.css).
  Parts: head, by, in, shown.
-->
<script lang="ts">
  import type { ContextBy } from "$lib/address.js";
  import Panel from "$lib/components/Panel.svelte";
  import Select from "$lib/components/Select.svelte";
  import ContextGroup from "./ContextGroup.svelte";
  import type { ContextGroupData, ContextItem, Shown } from "./lens-data.js";

  let {
    groups,
    containers = [],
    shown = [],
    by = "link-type",
    onBy,
    onPick,
    onShow,
  }: {
    groups: ContextGroupData[];
    containers?: { containerId: string; title: string }[];
    shown?: Shown[];
    by?: ContextBy;
    onBy?: (by: ContextBy) => void;
    onPick: (item: ContextItem) => void;
    onShow?: (s: Shown) => void;
  } = $props();

  const visible = $derived(groups.filter((g) => g.total > 0));
  const options: { value: ContextBy; label: string }[] = [
    { value: "link-type", label: "Link type" },
    { value: "none", label: "Nothing" },
    { value: "boundary", label: "Inside or outside the set" },
  ];
</script>

<div class="lens-context" data-testid="lens-context" data-by={by}>
  {#if onBy}
    <div class="lens-pane-head" data-part="head">
      <label class="lens-by" data-part="by">
        <span>Tell apart by</span>
        <Select
          value={by}
          {options}
          data-testid="lens-ctx-by"
          onchange={(e) => onBy((e.currentTarget as HTMLSelectElement).value as ContextBy)}
        />
      </label>
    </div>
  {/if}
  {#if visible.length === 0 && (by !== "link-type" || containers.length === 0)}
    <p class="lens-empty">No links.</p>
  {/if}
  {#each visible as g (`${g.def.relationType}:${g.def.direction}:${g.def.label}`)}
    <ContextGroup label={g.def.label} total={g.total} items={g.items} {onPick} />
  {/each}
  {#if by === "link-type" && containers.length > 0}
    <Panel title="In" aside={containers.length} class="lens-context-group">
      <ul class="lens-context-list" data-part="in" data-testid="lens-in">
        {#each containers as c (c.containerId)}<li><span class="lens-context-item">{c.title}</span></li>{/each}
      </ul>
    </Panel>
  {/if}
  {#if by === "link-type" && shown.length > 0}
    <Panel title="Shown in" aside={shown.length} class="lens-context-group">
      <ul class="lens-context-list" data-part="shown">
        {#each shown as s (`${s.compositionId}:${s.containerId}`)}
          <li>
            <button type="button" class="lens-context-item" data-testid="lens-shown-in" onclick={() => onShow?.(s)}>{s.label}</button>
          </li>
        {/each}
      </ul>
    </Panel>
  {/if}
</div>
