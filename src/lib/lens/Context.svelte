<!--
  Context — pane 3: what links to the selected thing. A header with "Tell apart by": Link type (one
  ContextGroup per lens context entry or the repository defaults, then "In" containers and "Shown in"
  compositions), Nothing (one flat list, each with an in/out arrow), or Inside or outside the set (links
  whose other end is in the Collection vs links that leave it). "+" on a linked record adds it to the
  working set; "Add everything" adds every record the checked records (else this one) link to, one hop
  out, skipping hubs (more than 50 links), which are listed on one line with a "+" each. Empty groups are
  hidden. Presentation only. Wraps .lens-context (lens.css).
-->
<script lang="ts">
  import Panel from "$lib/components/Panel.svelte";
  import type { ContextGroupData, ContextItem, Shown } from "./lens-data.js";
  import type { CtxBy } from "./lens-distinctions.js";
  import ContextGroup from "./ContextGroup.svelte";

  let {
    groups,
    containers = [],
    shown = [],
    by = "link",
    onBy,
    onPick,
    onShow,
    onMore,
    onAdd,
    onAddAll,
    checkedCount = 0,
    skipped = [],
    onAddSkipped,
  }: {
    groups: ContextGroupData[];
    containers?: { containerId: string; title: string }[];
    shown?: Shown[];
    by?: CtxBy;
    onBy?: (by: CtxBy) => void;
    onPick: (item: ContextItem) => void;
    onShow?: (s: Shown) => void;
    onMore?: (index: number) => void;
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
  const options: { value: CtxBy; label: string }[] = [
    { value: "link", label: "Link type" },
    { value: "nothing", label: "Nothing" },
    { value: "boundary", label: "Inside or outside the set" },
  ];
</script>

<div class="lens-context" data-testid="lens-context" data-by={by}>
  {#if onBy || onAddAll}
    <div class="lens-pane-head">
      {#if onBy}
        <label class="lens-by">
          <span>Tell apart by</span>
          <select value={by} data-testid="lens-ctx-by" onchange={(e) => onBy((e.currentTarget as HTMLSelectElement).value as CtxBy)}>
            {#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
          </select>
        </label>
      {/if}
      {#if onAddAll && (visible.length > 0 || checkedCount > 0)}
        <button type="button" class="lens-toggle" data-testid="lens-add-all" onclick={onAddAll}>{checkedCount > 0 ? `Add everything the ${checkedCount} checked link to` : "Add everything this links to"}</button>
      {/if}
    </div>
  {/if}
  {#if skipped.length > 0}
    <p class="lens-empty lens-skipped" data-testid="lens-skipped">
      Skipped {skipped.length} {skipped.length === 1 ? "record" : "records"} with many links:
      {#each skipped as m (m.id)}
        <span class="lens-skipped__item">{m.label}<button type="button" class="lens-context-add" data-testid="lens-skipped-add" aria-label={`Add ${m.label} to the set`} title="Add to the set" onclick={() => onAddSkipped?.(m)}>+</button></span>
      {/each}
    </p>
  {/if}
  {#if visible.length === 0 && (by !== "link" || containers.length === 0)}
    <p class="lens-empty">No links.</p>
  {/if}
  {#each groups as g, i (`${g.def.relationType}:${g.def.direction}:${g.def.label}`)}
    {#if g.total > 0}
      <ContextGroup label={g.def.label} total={g.total} items={g.items} {onPick} {onAdd} onMore={onMore ? () => onMore(i) : undefined} />
    {/if}
  {/each}
  {#if by === "link" && containers.length > 0}
    <Panel title="In" aside={containers.length} class="lens-context-group">
      <ul class="lens-context-list">
        {#each containers as c (c.containerId)}<li><span class="lens-context-item">{c.title}</span></li>{/each}
      </ul>
    </Panel>
  {/if}
  {#if by === "link" && shown.length > 0}
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
