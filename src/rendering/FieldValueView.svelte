<!--
  FieldValueView — renders a single FieldValue.
  URL values (http/https) render as clickable anchors; all others as plain text.
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

  function isUrl(v: unknown): boolean {
    if (typeof v !== 'string') return false;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }
</script>

{#if isArray && values.length === 0}
  <span class="t-muted">—</span>
{:else if isArray}
  <ul class="repeat__list">
    {#each values as v}
      <li class="repeat__item">
        {#if isUrl(v)}
          <a href={String(v)} class="field-value-url" target="_blank" rel="noopener noreferrer">{formatValue(v)}</a>
        {:else}
          {formatValue(v)}
        {/if}
      </li>
    {/each}
  </ul>
{:else if isUrl(fv.value)}
  <a href={String(fv.value)} class="field-value-url" target="_blank" rel="noopener noreferrer">{formatValue(fv.value)}</a>
{:else}
  <span>{formatValue(fv.value)}</span>
{/if}
