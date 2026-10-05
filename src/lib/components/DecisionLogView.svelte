<!--
  DecisionLogView — Decision Log section view wrapping LogTable with DecisionSummaryCard rows.
  B12 decision log / summary card: https://github.com/the-greenman/srs-web/issues/56
-->
<script lang="ts">
  import Notice from './Notice.svelte';
  import type { SrsRecord, SrsRepository } from "$lib/srs-client.js";
  import { listDocumentViews, renderDocumentView } from "$lib/srs-client.js";
  import { downloadText, wrapLogHtml } from "$lib/governance/decision-export-utils.js";
  import { computeSearchHitIds, computeTagHitIds, computeLifecycleVisibleIds, sortByCreatedAt } from "./decision-log-utils.js";
  import LogTable from "./LogTable.svelte";
  import DecisionSummaryCard from "./DecisionSummaryCard.svelte";
  import TagChip from "./TagChip.svelte";

  let {
    records,
    repo,
    selectedId = null,
    onSelect,
  }: {
    records: SrsRecord[];
    repo: SrsRepository;
    selectedId?: string | null;
    onSelect: (id: string | null) => void;
  } = $props();

  let sortOrder = $state<"newest" | "oldest">("newest");
  let topicFilter = $state<string>("all");
  let searchQuery = $state<string>("");
  let showAll = $state(false);
  let exportError = $state<string | null>(null);

  // Discover the decision-deliberation document view ID at runtime.
  // The view has the decision container baked into its own definition.
  const deliberationViewId = $derived(
    repo
      ? (listDocumentViews(repo, { namespace: "governance", name: "decision-deliberation" })
          .find((v) => v.name === "decision-deliberation")?.id ?? null)
      : null
  );

  function handleExportLog(format: "markdown" | "html") {
    exportError = null;
    if (!repo || !deliberationViewId) {
      exportError = "No decision document view found — export unavailable.";
      return;
    }
    try {
      const result = renderDocumentView(repo, deliberationViewId, format);
      if (!result.rendered) {
        exportError = "Export produced no content.";
        return;
      }
      const mimeType = format === "html" ? "text/html" : "text/markdown";
      const ext = format === "html" ? "html" : "md";
      const content =
        format === "html" ? wrapLogHtml(result.rendered, "Decision Log") : result.rendered;
      downloadText(content, mimeType, `decision-log.${ext}`);
    } catch (e) {
      exportError = `Export failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const availableTopics = $derived(
    [...new Set(records.flatMap((r) => r.tags ?? []))].sort((a, b) => a.localeCompare(b))
  );

  // Call WASM find once per query/filter change; null means "no active filter" (show all).
  const searchHitIds = $derived(computeSearchHitIds(repo, searchQuery));
  const tagHitIds = $derived(computeTagHitIds(repo, topicFilter));
  const lifecycleVisibleIds = $derived(
    !showAll ? computeLifecycleVisibleIds(repo, ["superseded", "abandoned"]) : null
  );

  const displayedRecords = $derived(
    sortByCreatedAt(
      records
        .filter((r) => {
          // Search filter via WASM find (ADR-001 compliant — no field names in the query)
          if (searchHitIds !== null && !searchHitIds.has(r.instanceId)) return false;
          // Lifecycle filter via WASM find (ADR-001 compliant — no field names; ADR-022)
          if (lifecycleVisibleIds !== null && !lifecycleVisibleIds.has(r.instanceId)) return false;
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
      {#if deliberationViewId && records.length > 0}
        <div class="controls-bar__export" data-testid="log-export-group">
          <span class="controls-bar__export-label">Export log:</span>
          <button
            data-testid="log-export-md"
            class="controls-bar__export-btn"
            onclick={() => handleExportLog("markdown")}
          >MD</button>
          <button
            data-testid="log-export-html"
            class="controls-bar__export-btn"
            onclick={() => handleExportLog("html")}
          >HTML</button>
        </div>
      {/if}
      {#if exportError}
        <Notice kind="error" testid="log-export-error">{exportError}</Notice>
      {/if}
    </div>
    <LogTable columns={["Decision", "Status", "Date"]}>
      {#each displayedRecords as record (record.instanceId)}
        <DecisionSummaryCard
          {record}
          {repo}
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
    color: var(--color-text);
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
    border: 1px solid var(--color-muted);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }

  .controls-bar__sort-btn:hover {
    background: var(--color-line-soft);
  }

  .controls-bar__search {
    font-size: 0.8125rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-muted);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text);
    min-width: 160px;
  }

  .controls-bar__search:focus {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  .controls-bar__show-all-btn {
    font-size: 0.8125rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-muted);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }

  .controls-bar__show-all-btn:hover {
    background: var(--color-line-soft);
  }

  .controls-bar__show-all-btn--active {
    background: var(--color-line);
    border-color: var(--color-muted-strong);
  }

  .controls-bar__export {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .controls-bar__export-label {
    font-size: 0.75rem;
    color: var(--color-text);
    opacity: 0.7;
  }

  .controls-bar__export-btn {
    font-size: 0.75rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--color-muted);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }

  .controls-bar__export-btn:hover {
    background: var(--color-line-soft);
  }

</style>
