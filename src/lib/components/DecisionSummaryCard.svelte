<!--
  DecisionSummaryCard — <tr> row component for the Decision Log table.
  B12 decision log / summary card: https://github.com/the-greenman/srs-web/issues/56
-->
<script lang="ts">
  import type { SrsRecord } from "$lib/srs-client.js";
  import type { Status } from "$lib/types.js";
  import { getStringField } from "$lib/governance/field-utils.js";
  import { getFieldMeta } from "$lib/governance/field-meta.js";
  import Tag from "./Tag.svelte";

  let {
    record,
    selected = false,
    onclick,
  }: {
    record: SrsRecord;
    selected?: boolean;
    onclick: () => void;
  } = $props();

  const fieldMeta = $derived(getFieldMeta());

  const title = $derived(getStringField(record, "title", fieldMeta) ?? "Untitled");
  const rawStatement = $derived(getStringField(record, "decision_statement", fieldMeta));
  const statement = $derived(
    rawStatement !== undefined
      ? rawStatement.length > 120
        ? rawStatement.substring(0, 120) + "…"
        : rawStatement
      : undefined
  );
  const status = $derived(getStringField(record, "status", fieldMeta) as Status | undefined);
  const date = $derived(record.createdAt?.slice(0, 10) ?? "—");
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<tr
  data-testid="decision-summary-card"
  class:log-table__row--selected={selected}
  aria-selected={selected}
  {onclick}
>
  <td class="log-table__decision">
    <span class="dscard__title">{title}</span>
    {#if statement !== undefined}
      <span class="dscard__statement">{statement}</span>
    {/if}
  </td>
  <td class="log-table__nowrap">
    {#if status !== undefined}
      <Tag {status} />
    {/if}
  </td>
  <td class="log-table__nowrap">{date}</td>
</tr>

<style>
  .dscard__title {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ink);
  }

  .dscard__statement {
    display: block;
    font-size: 0.8125rem;
    opacity: 0.7;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .log-table__row--selected td {
    background: var(--grey-1);
  }
</style>
