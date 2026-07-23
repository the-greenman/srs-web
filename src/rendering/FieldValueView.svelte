<!--
  FieldValueView — renders a single FieldValue.
  Pass valueType="url" to render url values as clickable anchors.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { FieldValue } from '$lib/srs-client.js';

  let { fv, valueType }: { fv: FieldValue; valueType?: string } = $props();

  const isArray = $derived(Array.isArray(fv.value));
  const values = $derived(isArray ? (fv.value as unknown[]) : [fv.value]);
  const isUrl = $derived(valueType === 'url');

  function formatValue(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  function isSafeUrl(v: unknown): boolean {
    if (typeof v !== 'string') return false;
    return v.startsWith('https://') || v.startsWith('http://');
  }
</script>

{#if isArray && values.length === 0}
  <span class="t-muted">—</span>
{:else if isArray}
  <ul class="repeat__list">
    {#each values as v}
      <li class="repeat__item">
        {#if isUrl && isSafeUrl(v)}
          <a href={formatValue(v)} target="_blank" rel="noopener noreferrer">{formatValue(v)}</a>
        {:else}
          {formatValue(v)}
        {/if}
      </li>
    {/each}
  </ul>
{:else if isUrl && isSafeUrl(fv.value)}
  <a href={formatValue(fv.value)} target="_blank" rel="noopener noreferrer">{formatValue(fv.value)}</a>
{:else}
  <span>{formatValue(fv.value)}</span>
{/if}
