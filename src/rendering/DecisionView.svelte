<!--
  DecisionView — profile-ordered view for governance decision records (§10.1).
  Field order: decision_statement, decision_question, context, friction,
    key_requirements, rationale, alternatives_considered, revisit_when,
    next_steps, status.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import type { Status } from '$lib/types.js';
  import { Card, CardField } from '$lib/components/index.js';
  import FieldValueView from './FieldValueView.svelte';
  import { getFieldValueByName, isPresent } from './field-helpers.js';
  import { getFieldMetaContext } from '$lib/governance/field-meta.js';

  let { record }: { record: SrsRecord } = $props();

  const _fieldMetaCtx = getFieldMetaContext();
  const fieldMeta = $derived(_fieldMetaCtx.meta);

  /** Profile-ordered field names for decision (§10.1). */
  const DECISION_FIELDS = [
    { name: 'title',                   label: 'Title' },
    { name: 'decision_statement',      label: 'Decision Statement' },
    { name: 'decision_question',       label: 'Decision Question' },
    { name: 'context',                 label: 'Context' },
    { name: 'friction',                label: 'Friction' },
    { name: 'key_requirements',        label: 'Key Requirements' },
    { name: 'rationale',               label: 'Rationale' },
    { name: 'alternatives_considered', label: 'Alternatives Considered' },
    { name: 'revisit_when',            label: 'Revisit When' },
    { name: 'next_steps',              label: 'Next Steps' },
    { name: 'owner',                   label: 'Owner' },
    { name: 'status',                  label: 'Status' },
  ] as const;

  const displayTitle = $derived(() => {
    const ttl = getFieldValueByName(record, 'title', fieldMeta)?.value;
    return ttl ? String(ttl) : record.instanceId.slice(0, 8);
  });

  const status = $derived(record.lifecycle as Status | undefined);
</script>

<Card title={displayTitle()} {status}>
  {#each DECISION_FIELDS as field}
    {@const fv = getFieldValueByName(record, field.name, fieldMeta)}
    {#if fv && isPresent(fv.value)}
      <CardField label={field.label}>
        <FieldValueView {fv} />
      </CardField>
    {/if}
  {/each}
</Card>
