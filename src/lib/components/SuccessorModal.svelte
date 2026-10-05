<!--
  SuccessorModal.svelte — immutability guard modal.

  Shown when the user tries to edit a record in an immutable state (active,
  closed). Offers to create a new draft successor linked via a supersedes
  relation, or to cancel.

  B11 lifecycle & supersession: https://github.com/the-greenman/srs-web/issues/7
-->
<script lang="ts">
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";

  interface Props {
    currentState: string;
    onCreateSuccessor: () => void;
    onCancel: () => void;
  }

  const { currentState, onCreateSuccessor, onCancel }: Props = $props();
</script>

<Modal title={`Record is ${currentState}`} testid="successor-modal" {onCancel}>
  <p>
    This record is <strong>{currentState}</strong> and cannot be edited directly.
    Create a new draft successor with the same field values, linked via a
    <em>supersedes</em> relation?
  </p>
  {#snippet actions()}
    <Button size="sm" onclick={onCancel}>Cancel</Button>
    <Button size="sm" variant="primary" onclick={onCreateSuccessor}>Create Successor</Button>
  {/snippet}
</Modal>
