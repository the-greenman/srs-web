<!--
  RecordView — full record field list. Uses fieldMeta to label each value.
  Renders all non-empty fieldValues (RFC-039 name-keyed object) in the order
  they appear on the record. Falls back to the raw field name as label.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4

  Card title priority: title prop → record.displayLabel → instanceId prefix.
  record.displayLabel is populated for records from listRecords() and getRecord()
  (both normalize the WASM RecordSummary shape, srs-web#182). The instanceId prefix
  remains the honest degradation when no core label is available.
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import type { Status } from '$lib/types.js';
  import { getFieldMetaContext } from '$lib/governance/field-meta.js';
  import { Card, CardField } from '$lib/components/index.js';
  import FieldValueView from './FieldValueView.svelte';

  let { record, title }: { record: SrsRecord; title?: string } = $props();

  const _fieldMetaCtx = getFieldMetaContext();
  const fieldMeta = $derived(_fieldMetaCtx.meta);

  /** Cast lifecycle to Status — lifecycle values are a subset of Status. */
  function toStatus(lifecycle: string | undefined): Status | undefined {
    if (!lifecycle) return undefined;
    // Status has been extended to cover the full governance lifecycle vocabulary
    // (draft, proposed, ratified, closed, superseded, abandoned, etc.) — see types.ts.
    return lifecycle as Status;
  }

  function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }
</script>

<Card
  title={title ?? record.displayLabel ?? record.instanceId.slice(0, 8)}
  status={toStatus(record.lifecycle)}
>
  {#each Object.entries(record.fieldValues) as [name, value] (name)}
    {#if !isEmpty(value)}
      {@const def = fieldMeta.get(name)}
      <CardField
        label={def?.label ?? name}
        description={def?.description}
        instructions={def?.instructions}
        id={name}
      >
        <FieldValueView {value} valueType={def?.valueType} />
      </CardField>
    {/if}
  {/each}
</Card>
