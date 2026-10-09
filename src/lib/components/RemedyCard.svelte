<!--
  RemedyCard — a remedy listed under a problem it answers: the title (opens the remedy), its status, the move
  and what it does not fix, the falsifier and when to return to it. The same record is listed under every
  problem it answers; nothing is copied. Presentation only. Wraps .remedy-card (method.css).
  Issue: https://github.com/the-greenman/srs-web/issues/541
-->
<script lang="ts">
  import type { MethodRemedy } from '$lib/method/method-document.js';
  import ActorChip from './ActorChip.svelte';
  import LinkedRecord from './LinkedRecord.svelte';

  let { remedy, selected = false, onopen }: { remedy: MethodRemedy; selected?: boolean; onopen?: (id: string) => void } = $props();
  const rows: [string, string][] = $derived([
    ['Does not fix', remedy.doesNotFix],
    ['Falsifier', remedy.falsifier],
    ['Return when', remedy.returnWhen],
  ]);
</script>

<div class="remedy-card" data-testid="remedy-card">
  <div class="remedy-card__head">
    <LinkedRecord id={remedy.id} label={remedy.title} status={remedy.status} {selected} {onopen} />
    <ActorChip actor={remedy.createdBy} />
  </div>
  {#if remedy.move}<p class="remedy-card__move" data-part="move">{remedy.move}</p>{/if}
  <dl class="remedy-card__rows">
    {#each rows as [k, v] (k)}{#if v}<dt>{k}</dt><dd>{v}</dd>{/if}{/each}
  </dl>
</div>
