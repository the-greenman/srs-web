<!--
  RecordView — full record field list. Uses fieldMeta to label each value.
  Renders all non-empty fieldValues in the order they appear on the record.
  Falls back gracefully for unknown field IDs (shows short UUID prefix as label).
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import type { Status } from '$lib/types.js';
  import { getFieldMeta } from '$lib/governance/field-meta.js';
  import { Card, CardField } from '$lib/components/index.js';
  import FieldValueView from './FieldValueView.svelte';

  let { record, title }: { record: SrsRecord; title?: string } = $props();

  const fieldMeta = $derived(getFieldMeta());

  /** Cast lifecycle to Status — lifecycle values are a subset of Status. */
  function toStatus(lifecycle: string | undefined): Status | undefined {
    if (!lifecycle) return undefined;
    // Status includes draft, active, archived which matches LifecycleState
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
  {#each record.fieldValues as fv}
    {#if !isEmpty(fv.value)}
      <CardField label={fieldMeta.get(fv.fieldId)?.label ?? fv.fieldId.slice(0, 8)}>
        <FieldValueView {fv} />
      </CardField>
    {/if}
  {/each}
</Card>
