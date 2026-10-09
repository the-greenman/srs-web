<!--
  Context — pane 3: what links to the selected thing. A header with "Tell links apart by": Link type (one
  ContextGroup per relation type and direction present at the record, labelled by the engine, then "In"
  containers and "Shown in" compositions), Nothing (one flat list, each link with an in/out arrow), or
  Inside or outside the set (links whose other end is in the set vs links that leave it). Groups arrive
  built (lens-data.ts groupEdges, lens-distinctions.ts splitByBoundary). "+" on a linked record adds it
  to the working set; "Add everything" adds every record the checked records (else this one) link to,
  skipping hubs, which are listed on one line with a "+" each. Empty groups are hidden. "Shown in" lists
  only the compositions it is given. Presentation only. Wraps .lens-context (lens.css).
  Parts: head, by, skipped, in, shown.
-->
<script lang="ts">
  import Plus from "@lucide/svelte/icons/plus";
  import type { ContextBy } from "$lib/address.js";
  import Button from "$lib/components/Button.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
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
    onAdd,
    onAddAll,
    checkedCount = 0,
    skipped = [],
    onAddSkipped,
  }: {
    groups: ContextGroupData[];
    containers?: { containerId: string; title: string }[];
    shown?: Shown[];
    by?: ContextBy;
    onBy?: (by: ContextBy) => void;
    onPick: (item: ContextItem) => void;
    onShow?: (s: Shown) => void;
    /** Add one linked record to the working set. */
    onAdd?: (item: ContextItem) => void;
    /** Add every linked record to the working set. */
    onAddAll?: () => void;
    /** Records checked into the set; "Add everything" then works from them. */
    checkedCount?: number;
    /** Hubs the last "Add everything" left out. */
    skipped?: { id: string; label: string }[];
    onAddSkipped?: (m: { id: string; label: string }) => void;
  } = $props();

  const visible = $derived(groups.filter((g) => g.total > 0));
  const options: { value: ContextBy; label: string }[] = [
    { value: "link-type", label: "Link type" },
    { value: "none", label: "Nothing" },
    { value: "boundary", label: "Inside or outside the set" },
  ];
</script>

<div class="lens-context" data-testid="lens-context" data-by={by}>
  {#if onBy || onAddAll}
    <div class="lens-pane-head" data-part="head">
      {#if onBy}
        <label class="lens-by" data-part="by">
          <span>Tell links apart by</span>
          <Select
            value={by}
            {options}
            data-testid="lens-ctx-by"
            onchange={(e) => onBy((e.currentTarget as HTMLSelectElement).value as ContextBy)}
          />
        </label>
      {/if}
      {#if onAddAll && (visible.length > 0 || checkedCount > 0)}
        <Button size="sm" variant="mono" data-testid="lens-add-all" onclick={onAddAll}>{checkedCount > 0 ? `Add everything the ${checkedCount} checked link to` : "Add everything this links to"}</Button>
      {/if}
    </div>
  {/if}
  {#if skipped.length > 0}
    <p class="lens-empty lens-skipped" data-part="skipped" data-testid="lens-skipped">
      Skipped {skipped.length} {skipped.length === 1 ? "record" : "records"} with many links:
      {#each skipped as m (m.id)}
        <span class="lens-skipped__item">{m.label}<IconButton icon={Plus} size="sm" label={`Add ${m.label} to the set`} class="lens-context-add" data-testid="lens-skipped-add" onclick={() => onAddSkipped?.(m)} /></span>
      {/each}
    </p>
  {/if}
  {#if visible.length === 0 && (by !== "link-type" || containers.length === 0)}
    <p class="lens-empty">No links.</p>
  {/if}
  {#each visible as g (`${g.def.relationType}:${g.def.direction}:${g.def.label}`)}
    <ContextGroup label={g.def.label} total={g.total} items={g.items} {onPick} {onAdd} />
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
