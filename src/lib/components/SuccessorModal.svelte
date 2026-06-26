<!--
  SuccessorModal.svelte — immutability guard modal.

  Shown when the user tries to edit a record in an immutable state (active,
  closed). Offers to create a new draft successor linked via a supersedes
  relation, or to cancel.

  B11 lifecycle & supersession: https://github.com/the-greenman/srs-web/issues/7
-->
<script lang="ts">
  import type { SrsRecord } from "$lib/srs-client.js";
  import { getStringField } from "$lib/governance/field-utils.js";
  import { getFieldMeta } from "$lib/governance/field-meta.js";

  interface Props {
    record: SrsRecord;
    onCreateSuccessor: () => void;
    onCancel: () => void;
  }

  const { record, onCreateSuccessor, onCancel }: Props = $props();

  const fieldMeta = $derived(getFieldMeta());
  const status = $derived(getStringField(record, "status", fieldMeta) ?? "immutable");
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal-dialog">
    <h2 class="modal-dialog__title" id="modal-title">Record is {status}</h2>
    <p class="modal-dialog__body">
      This record is <strong>{status}</strong> and cannot be edited directly.
      Create a new draft successor with the same field values, linked via a
      <em>supersedes</em> relation?
    </p>
    <div class="modal-dialog__actions">
      <button class="modal-btn modal-btn--cancel" onclick={onCancel}>Cancel</button>
      <button class="modal-btn modal-btn--primary" onclick={onCreateSuccessor}>
        Create Successor
      </button>
    </div>
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

  .modal-dialog__title {
    font-weight: 600;
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .modal-dialog__body {
    font-size: 0.875rem;
    margin: 0 0 1rem;
    opacity: 0.75;
    line-height: 1.5;
  }

  .modal-dialog__actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
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

  .modal-btn:hover {
    opacity: 1;
  }

  .modal-btn--primary {
    font-weight: 600;
  }

  .modal-btn--cancel {
    opacity: 0.5;
  }
</style>
