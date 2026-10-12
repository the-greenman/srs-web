<!--
  LinkedRecord — a persona, cluster, remedy or problem named inside another record: one button that opens it
  in the inspector, with its decision status (Suggested / Affirmed / Set aside) when it has one. Presentation
  only; the host owns the selection. Wraps .linked-record (method.css).
  Issue: https://github.com/the-greenman/srs-web/issues/541
-->
<script lang="ts">
  import type { ProblemStatus } from '$lib/method/method-document.js';
  import { STATUS_LABEL } from '$lib/method/method-document.js';
  import type { Status } from '../types';
  import Tag from './Tag.svelte';

  let {
    id,
    label,
    status = null,
    selected = false,
    onopen,
  }: { id: string; label: string; status?: ProblemStatus | null; selected?: boolean; onopen?: (id: string) => void } = $props();

  const TAG: Record<ProblemStatus, Status> = { suggested: 'proposed', affirmed: 'ratified', 'set-aside': 'deferred' };
</script>

{#if onopen}
  <button type="button" class="linked-record" class:linked-record--selected={selected} aria-pressed={selected} data-testid="linked-record" data-status={status ?? 'none'} onclick={() => onopen(id)}>
    <span data-part="label">{label}</span>
    {#if status}<Tag status={TAG[status]}>{STATUS_LABEL[status]}</Tag>{/if}
  </button>
{:else}
  <span class="linked-record" data-testid="linked-record" data-status={status ?? 'none'}>
    <span data-part="label">{label}</span>
    {#if status}<Tag status={TAG[status]}>{STATUS_LABEL[status]}</Tag>{/if}
  </span>
{/if}
