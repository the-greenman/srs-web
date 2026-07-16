<!--
  DecisionSummaryCard — <tr> row component for the Decision Log table.
  B12 decision log / summary card: https://github.com/the-greenman/srs-web/issues/56
  Tag chips added in srs-web#105.
-->
<script lang="ts">
  import type { SrsRecord, SrsRepository } from "$lib/srs-client.js";
  import type { Status } from "$lib/types.js";
  import Tag from "./Tag.svelte";
  import TagChip from "./TagChip.svelte";

  let {
    record,
    repo,
    selected = false,
    onclick,
  }: {
    record: SrsRecord;
    repo: SrsRepository;
    selected?: boolean;
    onclick: () => void;
  } = $props();

  const title = $derived(record.displayLabel ?? "Untitled");
  const rawStatement = $derived(
    repo.get_field_value_by_name(record.instanceId, "decision_statement") as
      | string
      | null
      | undefined
  );
  const statement = $derived(
    rawStatement != null
      ? rawStatement.length > 120
        ? rawStatement.substring(0, 120) + "…"
        : rawStatement
      : undefined
  );
  const status = $derived(
    repo.get_field_value_by_name(record.instanceId, "status") as Status | null | undefined ??
      undefined
  );
  const date = $derived(record.createdAt?.slice(0, 10) ?? "—");
  const tags = $derived(record.tags ?? []);
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
    {#if tags.length > 0}
      <div class="dscard__tags">
        {#each tags as tag (tag)}
          <TagChip label={tag} />
        {/each}
      </div>
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

  .dscard__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .log-table__row--selected td {
    background: var(--grey-1);
  }
</style>
