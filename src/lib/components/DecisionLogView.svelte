<!--
  DecisionLogView — Decision Log section view wrapping LogTable with DecisionSummaryCard rows.
  B12 decision log / summary card: https://github.com/the-greenman/srs-web/issues/56
-->
<script lang="ts">
  import type { SrsRecord } from "$lib/srs-client.js";
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
</script>

<div data-testid="decision-log-view">
  {#if records.length === 0}
    <p class="empty-state">No decisions in this repository.</p>
  {:else}
    <LogTable columns={["Decision", "Status", "Date"]}>
      {#each records as record (record.instanceId)}
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
</style>
