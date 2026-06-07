<!--
  ArticleView — profile-ordered view for governance article records (§10.3).
  Field order: article_number, title, article_text, amendment_rule, protected_status.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import type { Status } from '$lib/types.js';
  import { Card, CardField } from '$lib/components/index.js';
  import FieldValueView from './FieldValueView.svelte';
  import { getFieldValueByName, isPresent } from './field-helpers.js';
  import { fieldDef } from '../governance/package.js';

  let { record }: { record: SrsRecord } = $props();

  /** Profile-ordered field names for article (§10.3). */
  const ARTICLE_FIELDS = [
    { name: 'article_number', label: 'Article Number' },
    { name: 'title',          label: 'Title' },
    { name: 'article_text',   label: 'Article Text' },
    { name: 'rationale',      label: 'Rationale' },
    { name: 'amendment_rule', label: 'Amendment Rule' },
    { name: 'protected_status', label: 'Protected Status' },
    { name: 'status',         label: 'Status' },
  ] as const;

  /** Build a display title from article_number + title, or fall back to instanceId. */
  const displayTitle = $derived(() => {
    const num = getFieldValueByName(record, 'article_number')?.value;
    const ttl = getFieldValueByName(record, 'title')?.value;
    if (num && ttl) return `${String(num)} — ${String(ttl)}`;
    if (ttl) return String(ttl);
    return record.instanceId.slice(0, 8);
  });

  const status = $derived(record.lifecycle as Status | undefined);
</script>

<Card title={displayTitle()} {status}>
  {#each ARTICLE_FIELDS as field}
    {@const fv = getFieldValueByName(record, field.name)}
    {#if fv && isPresent(fv.value)}
      <CardField label={field.label}>
        <FieldValueView {fv} def={fieldDef(fv.fieldId)} />
      </CardField>
    {/if}
  {/each}
</Card>
