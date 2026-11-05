<script lang="ts">
  import UnsavedStatus from "../src/lib/components/UnsavedStatus.svelte";
  import { type DocumentChangesState, setDocumentChanges } from "../src/lib/document-changes.svelte.js";

  let {
    state,
    onOpen,
    canOpen,
  }: {
    state: DocumentChangesState;
    onOpen?: (id: string) => void;
    canOpen?: (id: string) => boolean;
  } = $props();
  setDocumentChanges(state);
</script>

<UnsavedStatus {onOpen} {canOpen} />
