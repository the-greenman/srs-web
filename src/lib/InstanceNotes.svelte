<!--
  InstanceNotes — the annotation margin and comment thread for ONE selected instance, for the shells
  that are not the essay editor (Generic, Governance, Guides; srs-web#422). The engine supplies the
  relations (loadInstanceNotes); comments appear only where the comment type is installed (D4), and
  the composer is hidden entirely otherwise (no disabled UI). Marks the container
  `data-srs-instance`. `revision` is the shell's documentRevision, so an external (agent) write
  refreshes it.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { currentActor, onActorChange, saveLocalName } from '$lib/actor.js';
  import { addComment } from '$lib/comments.js';
  import { loadInstanceNotes } from '$lib/instance-notes.js';
  import type { InstanceNotes } from '$lib/instance-notes.js';
  import type { SrsRepository } from '$lib/srs-client.js';
  import AnnotationMargin from '$lib/components/AnnotationMargin.svelte';
  import CommentThread from '$lib/components/CommentThread.svelte';

  let { repo, instanceId, revision = 0 }: { repo: SrsRepository; instanceId: string; revision?: number } = $props();

  let written = $state(0);
  let error = $state<string | null>(null);
  let hasActor = $state(currentActor() !== null);
  onDestroy(onActorChange(() => (hasActor = currentActor() !== null)));

  const empty: InstanceNotes = { available: false, comments: [], annotations: [] };
  const notes = $derived.by(() => {
    void revision;
    void written;
    try {
      return loadInstanceNotes(repo, instanceId);
    } catch {
      return empty;
    }
  });

  function comment(text: string, name?: string) {
    if (name && !saveLocalName(name)) {
      error = 'Could not remember your name in this browser.';
      return;
    }
    try {
      addComment(repo, instanceId, text);
      error = null;
      written += 1;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<section class="instance-notes" data-srs-instance={instanceId} data-testid="instance-notes">
  {#if notes.annotations.length}
    <AnnotationMargin annotations={notes.annotations} variant="expanded" max={8} />
  {/if}
  {#if notes.available}
    <CommentThread comments={notes.comments} needsName={!hasActor} onadd={comment} />
    {#if error}<p class="instance-notes__error" role="alert">{error}</p>{/if}
  {/if}
</section>
