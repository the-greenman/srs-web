<!--
  RecordReading — schema-driven record reading view for the governance centre canvas.

  Renders a record's field values with human-readable labels derived from a TypeFormDef.
  The TypeFormDef is used only as a label registry (presentation metadata); this component
  never constructs or validates records — ADR-001 is respected.

  Usage: show when a record is selected and formMode is null; clicking back clears selection.
-->
<script lang="ts">
  import type { SrsRecord } from "$lib/srs-client.js";
  import type { TypeFormDef } from "$lib/governance/form-schema.js";
  import CardField from "$lib/components/CardField.svelte";

  let {
    schema,
    record,
    sectionLabel,
    onBack,
  }: {
    schema: TypeFormDef;
    record: SrsRecord;
    sectionLabel: string;
    onBack: () => void;
  } = $props();

  /** Build a fieldId → label map from the schema for O(1) lookup. */
  const labelMap = $derived(
    new Map(schema.fields.map((f) => [f.fieldId, f.label]))
  );
</script>

<div data-testid="record-reading" class="reading">
  <button class="reading__back" data-testid="record-reading-back" onclick={onBack}>
    ← {sectionLabel}
  </button>

  <div class="reading__card">
    {#each record.fieldValues as fv (fv.fieldId)}
      {@const label = labelMap.get(fv.fieldId)}
      {@const value = typeof fv.value === "string" ? fv.value : null}
      {#if label && value}
        <CardField {label}>
          <span class="reading__text">{value}</span>
        </CardField>
      {/if}
    {/each}
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

  .reading__text {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
