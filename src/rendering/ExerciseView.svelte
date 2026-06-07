<!--
  ExerciseView — profile-ordered view for governance exercise records (§10.2).
  Fields: thinking_reached, tensions, unresolved_questions, blocking, next_action.
  Exercise type is not present in the gallery fixture — this view renders any
  exercise record if the type is added to the package in a future iteration.
  Falls back to RecordView if no exercise-specific fields are found.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import type { Status } from '$lib/types.js';
  import { Card, CardField } from '$lib/components/index.js';
  import FieldValueView from './FieldValueView.svelte';
  import RecordView from './RecordView.svelte';
  import { getFieldValueByName, isPresent } from './field-helpers.js';
  import { fieldDef } from '../governance/package.js';

  let { record }: { record: SrsRecord } = $props();

  const EXERCISE_FIELDS = [
    { name: 'thinking_reached',     label: 'Thinking Reached' },
    { name: 'tensions',             label: 'Tensions' },
    { name: 'unresolved_questions', label: 'Unresolved Questions' },
    { name: 'blocking',             label: 'Blocking' },
    { name: 'next_action',          label: 'Next Action' },
  ] as const;

  /**
   * Determine whether any exercise-specific fields are present.
   * If none are known (exercise type not yet in governance package), fall back
   * to the generic RecordView.
   */
  const hasExerciseFields = $derived(
    EXERCISE_FIELDS.some((f) => {
      const fv = getFieldValueByName(record, f.name);
      return fv !== undefined && isPresent(fv.value);
    }),
  );

  const displayTitle = $derived(() => {
    const ttl = getFieldValueByName(record, 'title')?.value;
    return ttl ? String(ttl) : record.instanceId.slice(0, 8);
  });

  const status = $derived(record.lifecycle as Status | undefined);
</script>

{#if hasExerciseFields}
  <Card title={displayTitle()} {status}>
    {#each EXERCISE_FIELDS as field}
      {@const fv = getFieldValueByName(record, field.name)}
      {#if fv && isPresent(fv.value)}
        <CardField label={field.label}>
          <FieldValueView {fv} def={fieldDef(fv.fieldId)} />
        </CardField>
      {/if}
    {/each}
  </Card>
{:else}
  <RecordView {record} />
{/if}
