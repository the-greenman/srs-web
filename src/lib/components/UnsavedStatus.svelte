<!--
  UnsavedStatus — the "Unsaved changes" status every shell shows while the document is dirty. With
  the engine's change list it becomes a button that opens the ChangesPanel in a Popover; without one
  (a host that did not provide the state) it stays the plain status word.
  `data-testid="document-dirty-status"` stays on the status so existing checks keep finding it. A
  shell passes `onOpen` and `canOpen` to make entries it can show into links; without them entries
  are plain text. srs-web#587, #726
-->
<script lang="ts">
  import { getDocumentChanges } from '../document-changes.svelte.js';
  import ChangesPanel from './ChangesPanel.svelte';
  import Popover from './Popover.svelte';

  let {
    onOpen,
    canOpen,
  }: { onOpen?: (id: string) => void; canOpen?: (id: string) => boolean } = $props();
  const dc = getDocumentChanges();
  let open = $state(false);
  const count = $derived(dc?.view.total ?? 0);
</script>

<span class="unsaved" data-part="unsaved">
  {#if dc}
    <Popover bind:open placement="bottom-end" role="region" label="Unsaved changes" class="unsaved__popover">
      {#snippet trigger({ props })}
        <span data-testid="document-dirty-status" role="status">
          <button type="button" class="unsaved__button" data-testid="changes-toggle" {...props}>Unsaved changes</button>
        </span>
      {/snippet}
      {#if open}
        <ChangesPanel
          changes={dc.view}
          {canOpen}
          onOpen={onOpen && ((id) => { open = false; onOpen(id); })}
        />
      {/if}
    </Popover>
  {:else}
    <span data-testid="document-dirty-status" role="status">Unsaved changes</span>
  {/if}
  {#if dc && count > 0}<span class="unsaved__count" data-testid="changes-count">({count})</span>{/if}
</span>
