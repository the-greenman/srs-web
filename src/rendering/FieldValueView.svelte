<!--
  FieldValueView — renders a single field value (RFC-039 carrier: scalar,
  array, or nested composite object). Pass valueType="url" to render url
  values as clickable anchors.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  let { value, valueType }: { value: unknown; valueType?: string } = $props();

  const isArray = $derived(Array.isArray(value));
  const values = $derived(isArray ? (value as unknown[]) : [value]);
  const isUrl = $derived(valueType === 'url');

  function formatValue(v: unknown): string {
    if (v === null || v === undefined) return '';
    // Composite entries / map objects: honest structural fallback until a
    // dedicated composite read view exists.
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  // XSS guard: only http/https schemes are safe to open as <a href> in a new tab
  function isRenderableAsAnchor(v: unknown): boolean {
    if (typeof v !== 'string') return false;
    return v.startsWith('https://') || v.startsWith('http://');
  }
</script>

{#if isArray && values.length === 0}
  <span class="t-muted">—</span>
{:else if isArray}
  <ul class="fv-list">
    {#each values as v}
      <li class="fv-item">
        {#if isUrl && isRenderableAsAnchor(v)}
          {@const href = formatValue(v)}
          <a {href} target="_blank" rel="noopener noreferrer">{href}</a>
        {:else}
          {formatValue(v)}
        {/if}
      </li>
    {/each}
  </ul>
{:else if isUrl && isRenderableAsAnchor(value)}
  {@const href = formatValue(value)}
  <a {href} target="_blank" rel="noopener noreferrer">{href}</a>
{:else}
  <span>{formatValue(value)}</span>
{/if}

<style>
  .fv-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
