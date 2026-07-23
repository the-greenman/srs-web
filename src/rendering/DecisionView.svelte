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
  import { isPresent } from './field-helpers.js';
  import { getFieldMetaContext } from '$lib/governance/field-meta.js';
  import { getRepoContext } from '$lib/governance/repo-context.js';

  let { record }: { record: SrsRecord } = $props();

  const _fieldMetaCtx = getFieldMetaContext();
  const fieldMeta = $derived(_fieldMetaCtx.meta);
  const _repoCtx = getRepoContext();
  const repo = $derived(_repoCtx.repo);
  // display-only: reshapes WASM-sourced schema metadata by field name for description/instructions
  const metaByName = $derived(
    new Map([...fieldMeta.entries()].map(([_, def]) => [def.name, def]))
  );

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
    { name: 'external_links',          label: 'External Links' },
  ] as const;

  const displayTitle = $derived(record.displayLabel ?? record.instanceId.slice(0, 8));

  const status = $derived(record.lifecycle as Status | undefined);
</script>

<Card title={displayTitle} {status}>
  {#each DECISION_FIELDS as field}
    {@const value = repo.get_field_value_by_name(record.instanceId, field.name)}
    {#if isPresent(value)}
      {@const def = metaByName.get(field.name)}
      <CardField label={field.label} description={def?.description} instructions={def?.instructions} id={field.name}>
        <!-- synthetic: FieldValueView reads only .value; fieldId is not semantically a UUID here -->
        <FieldValueView fv={{ fieldId: field.name, value }} valueType={def?.valueType} />
      </CardField>
    {/if}
  {/each}
</Card>
