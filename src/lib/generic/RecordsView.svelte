<!--
  RecordsView — the Records explorer, presentation only (RecordsExplorer owns the engine calls).
  Without search or type filter and above one page of records, records are grouped by type: collapsed, a
  count each, rows paged inside the group. Otherwise one flat, paged list. A search shows "N results".
-->
<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type { Snippet } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import type { DiscoveryHit } from "$lib/srs-client.js";
  import { plainLabel } from "./labels.js";
  import type { TypeGroup } from "./records-model.js";

  export interface GroupView extends TypeGroup {
    open: boolean;
    hits: DiscoveryHit[];
  }

  let {
    search = $bindable(""),
    typeId = $bindable(""),
    typeOptions,
    searching,
    total,
    groups = null,
    hits = [],
    onOpen,
    onToggle,
    onMore,
    onSearchAll,
    notices,
  }: {
    search?: string;
    typeId?: string;
    typeOptions: TypeGroup[];
    /** There is search text: the count reads "N results" and rows show their snippet. */
    searching: boolean;
    total: number;
    /** Set: grouped view. Null: the flat list in `hits`. */
    groups?: GroupView[] | null;
    hits?: DiscoveryHit[];
    onOpen: (instanceId: string) => void;
    /** Open or close a group (the explorer loads its first page). */
    onToggle?: (key: string) => void;
    /** Show more rows: a group's key, or null for the flat list. */
    onMore?: (key: string | null) => void;
    onSearchAll?: () => void;
    notices?: Snippet;
  } = $props();

  const subline = (hit: DiscoveryHit, withType: boolean): string => {
    const type = hit.typeName ? `${hit.typeNamespace}/${hit.typeName}` : "Note";
    return [withType ? type : null, hit.lifecycleState].filter(Boolean).join(" · ");
  };
  const snippet = (hit: DiscoveryHit): string =>
    searching && hit.snippet && plainLabel(hit.snippet) !== plainLabel(hit.label) ? plainLabel(hit.snippet) : "";
</script>

{#snippet row(hit: DiscoveryHit, withType: boolean)}
  <button class="generic-record-row" data-testid="record-row" onclick={() => onOpen(hit.instanceId)}>
    <strong>{plainLabel(hit.label, hit.instanceId.slice(0, 8))}</strong>
    <span>{subline(hit, withType)}</span>
    {#if snippet(hit)}<em class="generic-record-snippet">{snippet(hit)}</em>{/if}
  </button>
{/snippet}

<div class="generic-controls">
  <input aria-label="Search records" bind:value={search} placeholder="Search repository" />
  <select aria-label="Filter records by type" bind:value={typeId}>
    <option value="">All types</option>
    {#each typeOptions as type (type.key)}
      <option value={type.key}>{type.namespace ? `${type.namespace}/${type.name}` : type.name} ({type.count})</option>
    {/each}
  </select>
  {#if onSearchAll}<button onclick={onSearchAll}>Search all records</button>{/if}
</div>
{@render notices?.()}
<p class="generic-muted" data-testid="records-count" aria-live="polite">
  {total} {searching ? (total === 1 ? "result" : "results") : total === 1 ? "record" : "records"}
</p>
{#if groups}
  <div class="generic-groups" data-testid="record-groups">
    {#each groups as group (group.key)}
      <section class="generic-group" data-testid="record-group" data-key={group.key}>
        <Button size="sm" variant="ghost" class="generic-group__head" aria-expanded={group.open} onclick={() => onToggle?.(group.key)}>
          {#if group.open}<ChevronDown size={14} aria-hidden="true" />{:else}<ChevronRight size={14} aria-hidden="true" />{/if}
          <strong>{group.name}</strong>
          {#if group.namespace}<small class="generic-group__ns">{group.namespace}</small>{/if}
          <span class="generic-group__count">{group.count}</span>
        </Button>
        {#if group.open}
          <div class="generic-records">
            {#each group.hits as hit (hit.instanceId)}{@render row(hit, false)}{/each}
            {#if group.hits.length < group.count}
              <div class="generic-more">
                <Button size="sm" data-testid="group-more" onclick={() => onMore?.(group.key)}>
                  Show more ({group.count - group.hits.length} left)
                </Button>
              </div>
            {/if}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{:else}
  <div class="generic-records">
    {#each hits as hit (hit.instanceId)}{@render row(hit, true)}{/each}
    {#if hits.length < total}
      <div class="generic-more">
        <Button size="sm" data-testid="flat-more" onclick={() => onMore?.(null)}>Show more ({total - hits.length} left)</Button>
      </div>
    {/if}
  </div>
{/if}
