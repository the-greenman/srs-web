<!--
  ProblemCard — one method problem on the board: id and title in the Card header, its status, the
  statement, and chips for kind, persona, trade-off side, source count, comment count and who suggested it (the
  record's own engine-stamped createdBy, through ActorChip). The whole card is one button (a
  stretched invoker), so it opens the detail. Presentation only. Wraps Card + .problem-card (method.css).
  Issue: https://github.com/the-greenman/srs-web/issues/526
-->
<script lang="ts">
  import type { MethodProblem, ProblemStatus } from '$lib/method/method-document.js';
  import { STATUS_LABEL } from '$lib/method/method-document.js';
  import MessageSquareQuote from '@lucide/svelte/icons/message-square-quote';
  import type { Status } from '../types';
  import ActorChip from './ActorChip.svelte';
  import Card from './Card.svelte';
  import Tag from './Tag.svelte';
  import TagChip from './TagChip.svelte';

  let {
    problem,
    selected = false,
    onopen,
  }: { problem: MethodProblem; selected?: boolean; onopen?: (id: string) => void } = $props();

  const TAG: Record<ProblemStatus, Status> = { suggested: 'proposed', affirmed: 'ratified', 'set-aside': 'deferred' };
  const words = (s: string) => s.replaceAll('-', ' ');
  const sources = $derived(problem.sources.length);
</script>

<div class="problem-card" class:problem-card--selected={selected} data-testid="problem-card" data-status={problem.status ?? 'none'}>
  <Card id={problem.problemId || undefined} title={problem.title}>
    <div class="problem-card__body">
      {#if problem.status}<span class="problem-card__status" data-testid="problem-status"><Tag status={TAG[problem.status]}>{STATUS_LABEL[problem.status]}</Tag></span>{/if}
      {#if problem.statement}<p class="problem-card__statement">{problem.statement}</p>{/if}
      <div class="problem-card__chips">
        {#if problem.kind}<TagChip label={words(problem.kind)} />{/if}
        {#each problem.personas as p (p.id)}<TagChip label={p.label} />{/each}
        {#if problem.side}<TagChip label={problem.imbalance ? `${problem.side.label}: ${words(problem.imbalance)}` : problem.side.label} />{/if}
        {#if sources}<TagChip label={sources === 1 ? '1 source' : `${sources} sources`} />{/if}
        {#if problem.commentCount > 0}<span class="tag-chip" role="img" aria-label={`${problem.commentCount} ${problem.commentCount === 1 ? 'comment' : 'comments'}`} data-testid="problem-comments"><MessageSquareQuote size={12} aria-hidden="true" />{problem.commentCount}</span>{/if}
        <ActorChip actor={problem.createdBy} />
      </div>
    </div>
  </Card>
  {#if onopen}<button type="button" class="problem-card__open" aria-label={`Open ${problem.title}`} aria-pressed={selected} onclick={() => onopen(problem.id)}></button>{/if}
</div>
