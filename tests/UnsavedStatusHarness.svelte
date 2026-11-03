<script lang="ts">
  import UnsavedStatus from "../src/lib/components/UnsavedStatus.svelte";
  import { type DocumentChangesState, setDocumentChanges } from "../src/lib/document-changes.svelte.js";

  let { state }: { state: DocumentChangesState } = $props();
  setDocumentChanges(state);
</script>

<UnsavedStatus />
