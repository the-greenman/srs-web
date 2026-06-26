<!--
  RoleView — profile-ordered view for governance role records.
  Field order: title, role_holder, authority, boundary, source_of_authority,
    revisit_when, status.
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

  const ROLE_FIELDS = [
    { name: 'title',              label: 'Title' },
    { name: 'role_holder',        label: 'Role Holder' },
    { name: 'authority',          label: 'Authority' },
    { name: 'boundary',           label: 'Boundary' },
    { name: 'source_of_authority', label: 'Source of Authority' },
    { name: 'revisit_when',       label: 'Revisit When' },
    { name: 'status',             label: 'Status' },
  ] as const;

  const displayTitle = $derived(() => {
    const ttl = getFieldValueByName(record, 'title', fieldMeta)?.value;
    return ttl ? String(ttl) : record.instanceId.slice(0, 8);
  });

  const status = $derived(record.lifecycle as Status | undefined);
</script>

<Card title={displayTitle()} {status}>
  {#each ROLE_FIELDS as field}
    {@const fv = getFieldValueByName(record, field.name, fieldMeta)}
    {#if fv && isPresent(fv.value)}
      <CardField label={field.label}>
        <FieldValueView {fv} />
      </CardField>
    {/if}
  {/each}
</Card>
