<!--
  ViewPicker — select among available DocumentView options for a blueprint editor.

  Renders nothing when zero or one view is available (auto-selection is handled
  by the parent). When multiple views are available it shows a labelled select
  so the user can switch rendering strategy without leaving the editor.

  ADR-003: Document Views drive rendered output; this is a render-surface concern.
  ADR-004: Views are discovered via the string-convention join; the IDs come from
           discovery.ts, not hardcoded literals.
-->
<script lang="ts">
  import type { DocumentViewSummary } from "$lib/srs-client.js";

  let {
    views,
    selectedViewId,
    onSelect,
  }: {
    /** Available views, as returned by documentViewsForBlueprint(). */
    views: DocumentViewSummary[];
    /** Currently selected view ID, or null when none is discovered yet. */
    selectedViewId: string | null;
    /** Called when the user picks a different view. */
    onSelect: (id: string) => void;
  } = $props();
</script>

{#if views.length > 1}
  <div class="view-picker" data-testid="view-picker">
    <label class="view-picker__label" for="view-picker-select">View</label>
    <select
      id="view-picker-select"
      class="view-picker__select"
      data-testid="view-picker-select"
      value={selectedViewId ?? ""}
      onchange={(e) => {
        const id = (e.target as HTMLSelectElement).value;
        if (id) onSelect(id);
      }}
    >
      {#each views as view (view.id)}
        <option value={view.id}>{view.name}</option>
      {/each}
    </select>
  </div>
{/if}

<style>
  .view-picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }

  .view-picker__label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted, #888);
    white-space: nowrap;
  }

  .view-picker__select {
    flex: 1;
    font-size: 0.8rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    background: var(--color-surface, #fff);
    color: var(--color-text, #111);
    cursor: pointer;
  }

  .view-picker__select:focus {
    outline: 2px solid var(--color-accent, #3b82f6);
    outline-offset: 1px;
  }
</style>
