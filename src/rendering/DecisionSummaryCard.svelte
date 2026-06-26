<!--
  DecisionSummaryCard — compact 4-row summary for a decision record (§10.0).
  Shows: decision_statement, rationale, alternatives_considered, revisit_when.
  Intended for use in list/overview contexts; does not show all fields.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import type { Status } from '$lib/types.js';
  import { Card, CardField } from '$lib/components/index.js';
  import FieldValueView from './FieldValueView.svelte';
  import { getFieldValueByName, isPresent } from './field-helpers.js';
  import { getFieldMeta } from '$lib/governance/field-meta.js';

  let { record }: { record: SrsRecord } = $props();

  const fieldMeta = $derived(getFieldMeta());

  const SUMMARY_FIELDS = [
    { name: 'decision_statement',      label: 'Decision Statement' },
    { name: 'rationale',               label: 'Rationale' },
    { name: 'alternatives_considered', label: 'Alternatives Considered' },
    { name: 'revisit_when',            label: 'Revisit When' },
  ] as const;

  const displayTitle = $derived(() => {
    const ttl = getFieldValueByName(record, 'title', fieldMeta)?.value;
    return ttl ? String(ttl) : record.instanceId.slice(0, 8);
  });

  const status = $derived(record.lifecycle as Status | undefined);
</script>

<Card title={displayTitle()} {status} grid>
  {#each SUMMARY_FIELDS as field}
    {@const fv = getFieldValueByName(record, field.name, fieldMeta)}
    {#if fv && isPresent(fv.value)}
      <CardField label={field.label}>
        <FieldValueView {fv} />
      </CardField>
    {/if}
  {/each}
</Card>
