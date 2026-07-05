<!--
  DecisionLogView — Decision Log section view wrapping LogTable with DecisionSummaryCard rows.
  B12 decision log / summary card: https://github.com/the-greenman/srs-web/issues/56
-->
<script lang="ts">
  import type { SrsRecord, SrsRepository } from "$lib/srs-client.js";
  import type { Status } from "$lib/types.js";
  import { getStringField } from "$lib/governance/field-utils.js";
  import { getFieldMeta } from "$lib/governance/field-meta.js";
  import { computeSearchHitIds, computeTagHitIds, sortByCreatedAt } from "./decision-log-utils.js";
  import LogTable from "./LogTable.svelte";
  import DecisionSummaryCard from "./DecisionSummaryCard.svelte";
  import TagChip from "./TagChip.svelte";

  let {
    records,
    repo = undefined,
    selectedId = null,
    onSelect,
  }: {
    records: SrsRecord[];
    repo?: SrsRepository;
    selectedId?: string | null;
    onSelect: (id: string | null) => void;
  } = $props();

  const fieldMeta = $derived(getFieldMeta());

  let sortOrder = $state<"newest" | "oldest">("newest");
  let topicFilter = $state<string>("all");
  let searchQuery = $state<string>("");
  let showAll = $state(false);

  const HIDDEN_STATUSES: ReadonlySet<Status> = new Set(["superseded", "abandoned"]);

  const availableTopics = $derived(
    [...new Set(records.flatMap((r) => r.tags ?? []))].sort((a, b) => a.localeCompare(b))
  );

  // Call WASM find once per query/filter change; null means "no active filter" (show all).
  const searchHitIds = $derived(computeSearchHitIds(repo, searchQuery));
  const tagHitIds = $derived(computeTagHitIds(repo, topicFilter));

  const displayedRecords = $derived(
    sortByCreatedAt(
      records
        .filter((r) => {
          // Search filter via WASM find (ADR-001 compliant — no field names in the query)
          if (searchHitIds !== null && !searchHitIds.has(r.instanceId)) return false;
          // Status filter (residual ADR-001 gap tracked in srs-web#118)
          if (!showAll) {
            const s = getStringField(r, "status", fieldMeta);
            if (s !== undefined && HIDDEN_STATUSES.has(s as Status)) return false;
          }
          if (tagHitIds !== null && !tagHitIds.has(r.instanceId)) return false;
          return true;
        }),
      sortOrder
    )
  );
</script>

<div data-testid="decision-log-view">
  {#if records.length === 0}
    <p class="empty-state">No decisions in this repository.</p>
  {:else}
    <div class="controls-bar">
      <input
        type="search"
        data-testid="search-input"
        class="controls-bar__search"
        placeholder="Search decisions…"
        aria-label="Search decisions"
        bind:value={searchQuery}
      />
      <button
        data-testid="sort-toggle"
        class="controls-bar__sort-btn"
        onclick={() => { sortOrder = sortOrder === "newest" ? "oldest" : "newest"; }}
      >
        {sortOrder === "newest" ? "Newest first" : "Oldest first"}
      </button>
      {#if availableTopics.length > 0}
        <div class="controls-bar__tag-filter" data-testid="topic-filter" role="group" aria-label="Filter by tag">
          <TagChip label="All" selected={topicFilter === "all"} onSelect={() => { topicFilter = "all"; }} />
          {#each availableTopics as topic (topic)}
            <TagChip label={topic} selected={topicFilter === topic} onSelect={() => { topicFilter = topic; }} />
          {/each}
        </div>
      {/if}
      <button
        data-testid="show-all-toggle"
        class="controls-bar__show-all-btn"
        class:controls-bar__show-all-btn--active={showAll}
        aria-pressed={showAll}
        onclick={() => { showAll = !showAll; }}
      >
        {showAll ? "Hide superseded/abandoned" : "Show superseded/abandoned"}
      </button>
    </div>
    <LogTable columns={["Decision", "Status", "Date"]}>
      {#each displayedRecords as record (record.instanceId)}
        <DecisionSummaryCard
          {record}
          selected={selectedId === record.instanceId}
          onclick={() => onSelect(selectedId === record.instanceId ? null : record.instanceId)}
        />
      {/each}
    </LogTable>
  {/if}
</div>

<style>
  .empty-state {
    padding: var(--space-md);
    color: var(--ink);
    opacity: 0.6;
    font-size: 0.875rem;
  }

  .controls-bar {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: center;
    padding: var(--space-sm) var(--space-md);
  }

  .controls-bar__tag-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .controls-bar__sort-btn {
    font-size: 0.8125rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--grey-3, #ccc);
    border-radius: 4px;
    background: var(--surface, #fff);
    color: var(--ink);
    cursor: pointer;
  }

  .controls-bar__sort-btn:hover {
    background: var(--grey-1, #f5f5f5);
  }

  .controls-bar__search {
    font-size: 0.8125rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--grey-3, #ccc);
    border-radius: 4px;
    background: var(--surface, #fff);
    color: var(--ink);
    min-width: 160px;
  }

  .controls-bar__search:focus {
    outline: 2px solid var(--accent, #0066cc);
    outline-offset: 1px;
  }

  .controls-bar__show-all-btn {
    font-size: 0.8125rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--grey-3, #ccc);
    border-radius: 4px;
    background: var(--surface, #fff);
    color: var(--ink);
    cursor: pointer;
  }

  .controls-bar__show-all-btn:hover {
    background: var(--grey-1, #f5f5f5);
  }

  .controls-bar__show-all-btn--active {
    background: var(--grey-2, #e8e8e8);
    border-color: var(--grey-4, #aaa);
  }
</style>
