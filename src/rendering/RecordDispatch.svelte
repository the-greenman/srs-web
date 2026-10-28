<!--
  RecordDispatch — resolves the view component for a record by typeId.
  TYPE_REGISTRY maps typeId → view component; falls back to RecordProse (ADR-024) for unknown types.
  To add a new known type: add one entry to src/lib/governance/type-registry.ts — no change here.
  ADR-006, ADR-007: srs-web/docs/adr/
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import { TYPE_REGISTRY } from '$lib/governance/type-registry.js';
  import { getFieldMetaContext } from '$lib/governance/field-meta.js';
  import RecordProse from './RecordProse.svelte';

  let { record }: { record: SrsRecord } = $props();

  const _fieldMetaCtx = getFieldMetaContext();
  /** The record's stored fields with the labels and value kinds the schema context knows; unknown names keep their own. */
  const fields = $derived(
    Object.keys(record.fieldValues).flatMap((name) => {
      const def = _fieldMetaCtx.meta.get(name);
      return def ? [def] : [{ name, label: name, valueType: 'string' as const, required: false }];
    })
  );

  let ViewComponent = $derived(TYPE_REGISTRY[record.typeId]?.view);
</script>

{#if ViewComponent}
  <ViewComponent {record} />
{:else}
  <RecordProse {record} {fields} composites={[]} />
{/if}
