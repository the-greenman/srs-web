<!--
  FieldValueView — renders a single FieldValue.
  All current governance field types (string, text, select) render as plain text.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { FieldValue } from '$lib/srs-client.js';

  let { fv }: { fv: FieldValue } = $props();

  const isArray = $derived(Array.isArray(fv.value));
  const values = $derived(isArray ? (fv.value as unknown[]) : [fv.value]);

  function formatValue(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v);
  }
</script>

{#if isArray && values.length === 0}
  <span class="t-muted">—</span>
{:else if isArray}
  <ul class="repeat__list">
    {#each values as v}
      <li class="repeat__item">{formatValue(v)}</li>
    {/each}
  </ul>
{:else}
  <span>{formatValue(fv.value)}</span>
{/if}
