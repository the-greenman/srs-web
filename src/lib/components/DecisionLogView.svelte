<!--
  DecisionLogView — Decision Log section view wrapping LogTable with DecisionSummaryCard rows.
  B12 decision log / summary card: https://github.com/the-greenman/srs-web/issues/56
-->
<script lang="ts">
  import type { SrsRecord } from "$lib/srs-client.js";
  import type { Status } from "$lib/types.js";
  import { getStringField } from "$lib/governance/field-utils.js";
  import { getFieldMeta } from "$lib/governance/field-meta.js";
  import LogTable from "./LogTable.svelte";
  import DecisionSummaryCard from "./DecisionSummaryCard.svelte";

  let {
    records,
    selectedId = null,
    onSelect,
  }: {
    records: SrsRecord[];
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

  const displayedRecords = $derived(
    [...records
      .filter((r) => {
        if (!showAll) {
          const s = getStringField(r, "status", fieldMeta);
          if (s !== undefined && HIDDEN_STATUSES.has(s as Status)) return false;
        }
        return true;
      })
      .filter((r) => {
        if (topicFilter !== "all" && !(r.tags ?? []).includes(topicFilter)) return false;
        const q = searchQuery.trim().toLowerCase();
        if (q === "") return true;
        const title = (getStringField(r, "title", fieldMeta) ?? "").toLowerCase();
        const statement = (getStringField(r, "decision_statement", fieldMeta) ?? "").toLowerCase();
        return title.includes(q) || statement.includes(q);
      })]
      .sort((a, b) => {
        // ISO 8601 strings are lexicographically ordered; use < / > to avoid locale-sensitive collation
        const dateA = a.createdAt ?? "";
        const dateB = b.createdAt ?? "";
        if (sortOrder === "newest") return dateB < dateA ? -1 : dateB > dateA ? 1 : 0;
        return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
      })
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
        <select
          data-testid="topic-filter"
          value={topicFilter}
          onchange={(e) => { topicFilter = (e.target as HTMLSelectElement).value; }}
        >
          <option value="all">All topics</option>
          {#each availableTopics as topic}
            <option value={topic}>{topic}</option>
          {/each}
        </select>
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
    gap: var(--space-sm);
    align-items: center;
    padding: var(--space-sm) var(--space-md);
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
