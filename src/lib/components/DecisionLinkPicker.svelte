<!--
  DecisionLinkPicker.svelte — modal for linking two decisions via a typed relation.

  The user picks a relation type from the package-installed set (derived at runtime by
  GovernanceShell and passed as `relationTypes`) and selects a target decision from a
  searchable list. On confirm, onLink() is called with the chosen relation type and
  target instanceId; the parent is responsible for calling createRelation() via WASM
  (ADR-001). Errors from createRelation() are surfaced via the `linkError` prop.

  srs-web#106: https://github.com/the-greenman/srs-web/issues/106
  srs-web#160: https://github.com/the-greenman/srs-web/issues/160
-->
<script lang="ts">
  import type { SrsRecord } from "$lib/srs-client.js";
  import type { RelationTypeOption } from "$lib/types.js";

  interface Props {
    sourceInstanceId: string;
    sourceLabel: string;
    decisions: SrsRecord[];
    /** Relation types installed in the loaded package, derived by GovernanceShell. */
    relationTypes: RelationTypeOption[];
    onLink: (relationType: string, targetInstanceId: string) => void;
    onCancel: () => void;
    /**
     * Error message from the last createRelation() attempt, or null when none.
     * Set by GovernanceShell.handleAddRelation on failure; cleared on success or
     * when the picker is re-opened.
     */
    linkError?: string | null;
  }

  const {
    sourceInstanceId: _sourceInstanceId,
    sourceLabel,
    decisions,
    relationTypes,
    onLink,
    onCancel,
    linkError = null,
  }: Props = $props();

  // Default to the first installed relation type so the select is never empty.
  // Initialized to "" and set reactively via $effect so the $state initializer
  // does not capture a stale prop snapshot (Svelte 5 rune constraint).
  let selectedRelationType = $state<string>("");
  $effect(() => {
    if (selectedRelationType === "" && relationTypes.length > 0) {
      selectedRelationType = relationTypes[0].value;
    }
  });

  let searchQuery = $state<string>("");
  let selectedTargetId = $state<string | null>(null);

  const filteredDecisions = $derived(
    searchQuery.trim() === ""
      ? decisions
      : decisions.filter((r) => {
          const label = (r.displayLabel ?? r.instanceId).toLowerCase();
          return label.includes(searchQuery.trim().toLowerCase());
        })
  );

  function handleConfirm() {
    if (selectedTargetId !== null && selectedRelationType !== "") {
      onLink(selectedRelationType, selectedTargetId);
    }
  }
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlp-title">
  <div class="modal-dialog modal-dialog--picker">
    <h2 class="modal-dialog__title" id="dlp-title">Link to another decision</h2>
    <p class="modal-dialog__subtitle">From: {sourceLabel}</p>

    <div class="dlp-field">
      <label class="dlp-label" for="dlp-relation-type">Relation type</label>
      {#if relationTypes.length === 0}
        <p class="dlp-empty-types" data-testid="link-no-relation-types">
          No relation types installed in this package.
        </p>
      {:else}
        <select
          id="dlp-relation-type"
          class="dlp-select"
          data-testid="link-relation-type"
          bind:value={selectedRelationType}
        >
          {#each relationTypes as rt (rt.value)}
            <option value={rt.value}>{rt.label}</option>
          {/each}
        </select>
      {/if}
    </div>

    <div class="dlp-field">
      <label class="dlp-label" for="dlp-search">Search decisions</label>
      <input
        id="dlp-search"
        type="search"
        class="dlp-search"
        data-testid="link-search"
        placeholder="Filter by title…"
        bind:value={searchQuery}
      />
    </div>

    <div class="dlp-list-wrap">
      {#if filteredDecisions.length === 0}
        <p class="dlp-empty">No other decisions found.</p>
      {:else}
        <ul class="dlp-list" role="listbox" aria-label="Decisions">
          {#each filteredDecisions as record (record.instanceId)}
            <li class="dlp-item">
              <button
                type="button"
                class="dlp-item__btn"
                class:dlp-item__btn--selected={selectedTargetId === record.instanceId}
                data-testid="link-decision-item"
                role="option"
                aria-selected={selectedTargetId === record.instanceId}
                onclick={() => { selectedTargetId = record.instanceId; }}
              >
                {record.displayLabel ?? record.instanceId}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="modal-dialog__actions">
      <button class="modal-btn modal-btn--cancel" onclick={onCancel}>Cancel</button>
      <button
        class="modal-btn modal-btn--primary"
        data-testid="link-confirm"
        disabled={selectedTargetId === null || relationTypes.length === 0}
        onclick={handleConfirm}
      >
        Add link
      </button>
    </div>

    {#if linkError}
      <p class="dlp-error" role="alert" data-testid="link-error">{linkError}</p>
    {/if}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-dialog {
    background: var(--color-surface, #fff);
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 1.5rem;
    max-width: 28rem;
    width: 90vw;
  }

  .modal-dialog--picker {
    max-width: 34rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .modal-dialog__title {
    font-weight: 600;
    margin: 0;
    font-size: 1rem;
  }

  .modal-dialog__subtitle {
    font-size: 0.8125rem;
    margin: 0;
    opacity: 0.6;
  }

  .modal-dialog__actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding-top: 0.25rem;
  }

  .dlp-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .dlp-label {
    font-size: 0.75rem;
    opacity: 0.65;
    font-weight: 500;
  }

  .dlp-select,
  .dlp-search {
    font-size: 0.875rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid currentColor;
    border-radius: 2px;
    background: var(--color-surface, #fff);
    color: inherit;
    width: 100%;
    box-sizing: border-box;
    opacity: 0.9;
  }

  .dlp-list-wrap {
    border: 1px solid currentColor;
    border-radius: 2px;
    max-height: 14rem;
    overflow-y: auto;
    opacity: 0.9;
  }

  .dlp-empty {
    font-size: 0.8125rem;
    padding: 0.75rem;
    margin: 0;
    opacity: 0.55;
    text-align: center;
  }

  .dlp-empty-types {
    font-size: 0.8125rem;
    padding: 0.3rem 0;
    margin: 0;
    opacity: 0.55;
  }

  .dlp-error {
    font-size: 0.8125rem;
    margin: 0;
    padding: 0.4rem 0.5rem;
    color: var(--color-error, #c00);
    background: var(--color-error-subtle, rgba(204, 0, 0, 0.06));
    border: 1px solid var(--color-error, #c00);
    border-radius: 2px;
  }

  .dlp-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .dlp-item {
    border-bottom: 1px solid currentColor;
    opacity: 0.7;
  }

  .dlp-item:last-child {
    border-bottom: none;
  }

  .dlp-item__btn {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.45rem 0.65rem;
    font-size: 0.8125rem;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
  }

  .dlp-item__btn:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.06));
    opacity: 1;
  }

  .dlp-item__btn--selected {
    font-weight: 600;
    background: var(--color-accent-subtle, rgba(0, 90, 200, 0.08));
    opacity: 1;
  }

  .modal-btn {
    font-size: 0.75rem;
    background: none;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0.3rem 0.65rem;
    cursor: pointer;
    opacity: 0.75;
  }

  .modal-btn:hover:not(:disabled) {
    opacity: 1;
  }

  .modal-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .modal-btn--primary {
    font-weight: 600;
  }

  .modal-btn--cancel {
    opacity: 0.5;
  }
</style>
