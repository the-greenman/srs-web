<!--
  TagChip — free-form topic/content tag pill.
  Distinct from Tag.svelte (governance lifecycle status chips).
  onSelect and onRemove are mutually exclusive; onSelect wins (renders as a clickable button).
  srs-web#105: decision tag chips + tag filter UI.
-->
<script lang="ts">
  let {
    label,
    selected = false,
    onSelect,
    onRemove,
  }: {
    label: string;
    selected?: boolean;
    onSelect?: () => void;
    onRemove?: () => void;
  } = $props();
</script>

{#if onSelect}
  <button
    type="button"
    class="tag-chip tag-chip--filter"
    class:tag-chip--selected={selected}
    onclick={onSelect}
    aria-pressed={selected}
    data-testid="tag-chip-filter"
  >{label}</button>
{:else}
  <span class="tag-chip" data-testid="tag-chip">
    {label}
    {#if onRemove}
      <button
        type="button"
        class="tag-chip__remove"
        onclick={onRemove}
        aria-label="Remove tag {label}"
        data-testid="tag-chip-remove"
      >×</button>
    {/if}
  </span>
{/if}
