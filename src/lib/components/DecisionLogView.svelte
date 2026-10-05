<!--
  DecisionLogView — Decision Log section view wrapping LogTable with DecisionSummaryCard rows.
  B12 decision log / summary card: https://github.com/the-greenman/srs-web/issues/56
-->
<script lang="ts">
  import Notice from './Notice.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';
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
      <Input
        type="search"
        data-testid="search-input"
        class="controls-bar__search"
        placeholder="Search decisions…"
        aria-label="Search decisions"
        bind:value={searchQuery}
      />
      <Button
        size="sm"
        data-testid="sort-toggle"
        onclick={() => { sortOrder = sortOrder === "newest" ? "oldest" : "newest"; }}
      >
        {sortOrder === "newest" ? "Newest first" : "Oldest first"}
      </Button>
      {#if availableTopics.length > 0}
        <div class="controls-bar__tag-filter" data-testid="topic-filter" role="group" aria-label="Filter by tag">
          <TagChip label="All" selected={topicFilter === "all"} onSelect={() => { topicFilter = "all"; }} />
          {#each availableTopics as topic (topic)}
            <TagChip label={topic} selected={topicFilter === topic} onSelect={() => { topicFilter = topic; }} />
          {/each}
        </div>
      {/if}
      <Button
        size="sm"
        variant="mono"
        active={showAll}
        data-testid="show-all-toggle"
        aria-pressed={showAll}
        onclick={() => { showAll = !showAll; }}
      >
        {showAll ? "Hide superseded/abandoned" : "Show superseded/abandoned"}
      </Button>
      {#if deliberationViewId && records.length > 0}
        <div class="controls-bar__export" data-testid="log-export-group">
          <span class="controls-bar__export-label">Export log:</span>
          <Button
            size="sm"
            variant="mono"
            data-testid="log-export-md"
            onclick={() => handleExportLog("markdown")}
          >MD</Button>
          <Button
            size="sm"
            variant="mono"
            data-testid="log-export-html"
            onclick={() => handleExportLog("html")}
          >HTML</Button>
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

  .controls-bar :global(.controls-bar__search) {
    width: auto;
    min-width: 160px;
    padding: 4px 8px;
    font-size: var(--size-sm);
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
</style>
