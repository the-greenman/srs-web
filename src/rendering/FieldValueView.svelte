<!--
  FieldValueView — renders a single FieldValue given its definition.
  Handles repeatable arrays and adapts display to valueType.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { FieldValue } from '$lib/srs-client.js';
  import type { FieldDef } from '../governance/package.js';

  let { fv, def }: { fv: FieldValue; def?: FieldDef } = $props();

  const valueType = $derived(def?.valueType ?? 'string');

  const isArray = $derived(Array.isArray(fv.value));
  const values = $derived(isArray ? (fv.value as unknown[]) : [fv.value]);

  function formatValue(v: unknown, vt: string): string {
    if (v === null || v === undefined) return '';
    if (vt === 'boolean') return v ? 'Yes' : 'No';
    if (vt === 'date') {
      if (typeof v === 'string') {
        // Normalise to YYYY-MM-DD if already in that form, otherwise pass through
        const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : String(v);
      }
      return String(v);
    }
    // url, string, text, select, multiselect, number — all render as plain text here
    return String(v);
  }
</script>

{#if isArray && values.length === 0}
  <span class="t-muted">—</span>
{:else if isArray}
  <ul class="repeat__list">
    {#each values as v}
      <li class="repeat__item">{formatValue(v, valueType)}</li>
    {/each}
  </ul>
{:else}
  <span>{formatValue(fv.value, valueType)}</span>
{/if}
