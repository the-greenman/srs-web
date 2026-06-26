<!--
  RecordReading — record reading view for the governance centre canvas.

  Delegates content rendering to RecordDispatch, which routes to a type-specific view
  (ArticleView, DecisionView, RoleView) or falls back to RecordView for unknown types.
  ADR-006: typeId-keyed dispatch; srs-web#70.

  Usage: show when a record is selected and formMode is null; clicking back clears selection.
-->
<script lang="ts">
  import type { SrsRecord } from "$lib/srs-client.js";
  import RecordDispatch from "../../rendering/RecordDispatch.svelte";

  let {
    record,
    sectionLabel,
    onBack,
  }: {
    record: SrsRecord;
    sectionLabel: string;
    onBack: () => void;
  } = $props();
</script>

<div data-testid="record-reading" class="reading">
  <button class="reading__back" data-testid="record-reading-back" onclick={onBack}>
    ← {sectionLabel}
  </button>

  <div class="reading__card">
    <RecordDispatch {record} />
  </div>
</div>

<style>
  .reading {
    padding: 1.5rem;
    max-width: 52rem;
  }

  .reading__back {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-muted, #888);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-bottom: 1.25rem;
  }

  .reading__back:hover {
    color: var(--ink, #111);
  }

  .reading__card {
    display: flex;
    flex-direction: column;
    gap: 0;
  }


</style>
