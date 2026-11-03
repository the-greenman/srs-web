<!--
  UnsavedStatus — the "Unsaved changes" status every shell shows while the document is dirty. With
  the engine's change list it becomes a button that opens the ChangesPanel; without one (a host
  that did not provide the state) it stays the plain status word. `data-testid="document-dirty-status"`
  stays on the status so existing checks keep finding it. srs-web#587
-->
<script lang="ts">
  import { getDocumentChanges } from '../document-changes.svelte.js';
  import type { ChangeItem } from '../document-changes.js';
  import ChangesPanel from './ChangesPanel.svelte';

  let { onOpen }: { onOpen?: (item: ChangeItem) => void } = $props();
  const dc = getDocumentChanges();
  let open = $state(false);
  const id = $props.id();
  const count = $derived(dc?.view.total ?? 0);
</script>

<span class="unsaved" data-part="unsaved">
  <span data-testid="document-dirty-status" role="status">
    {#if dc}
      <button
        type="button"
        class="unsaved__button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-testid="changes-toggle"
        onclick={() => (open = !open)}
      >Unsaved changes{#if count > 0}<span class="unsaved__count" data-testid="changes-count"> ({count})</span>{/if}</button>
    {:else}Unsaved changes{/if}
  </span>
  {#if dc && open}
    <div {id} class="unsaved__popover" data-part="popover">
      <ChangesPanel changes={dc.view} onOpen={(item) => { open = false; onOpen?.(item); }} />
    </div>
  {/if}
</span>
