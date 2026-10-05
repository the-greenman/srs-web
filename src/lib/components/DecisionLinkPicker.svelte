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
  import Notice from './Notice.svelte';
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';
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

<Modal title="Link to another decision" {onCancel}>
  <p>From: {sourceLabel}</p>

  <div class="field">
    <label class="field__label" for="dlp-relation-type">Relation type</label>
    {#if relationTypes.length === 0}
      <p data-testid="link-no-relation-types">No relation types installed in this package.</p>
    {:else}
      <select
        id="dlp-relation-type"
        class="select"
        data-testid="link-relation-type"
        bind:value={selectedRelationType}
      >
        {#each relationTypes as rt (rt.value)}
          <option value={rt.value}>{rt.label}</option>
        {/each}
      </select>
    {/if}
  </div>

  <div class="field">
    <label class="field__label" for="dlp-search">Search decisions</label>
    <Input
      id="dlp-search"
      type="search"
      data-testid="link-search"
      placeholder="Filter by title…"
      bind:value={searchQuery}
    />
  </div>

  {#if filteredDecisions.length === 0}
    <p>No other decisions found.</p>
  {:else}
    <ul data-part="list" role="listbox" aria-label="Decisions">
      {#each filteredDecisions as record (record.instanceId)}
        <li>
          <button
            type="button"
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

  {#if linkError}
    <Notice kind="error" testid="link-error">{linkError}</Notice>
  {/if}

  {#snippet actions()}
    <Button size="sm" onclick={onCancel}>Cancel</Button>
    <Button
      size="sm"
      variant="primary"
      data-testid="link-confirm"
      disabled={selectedTargetId === null || relationTypes.length === 0}
      onclick={handleConfirm}
    >Add link</Button>
  {/snippet}
</Modal>
