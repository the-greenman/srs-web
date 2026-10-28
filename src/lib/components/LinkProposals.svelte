<!--
  LinkProposals — the links agents propose from one record, each answered in place with a tick or a
  deny (srs-web#617, remedy 2910ac1e: affirm in context). Shown beside the record's own text, so the
  owner judges a link where it starts, never on a separate screen. Pressing your current answer again
  clears it (a `withdrawn` response). Presentation + events only: the shell reads proposals through
  link-proposals.ts and writes through it; the link itself is never written here.
  Wraps .proposals (src/styles/components/proposals.css). Story: srs-web#617.
-->
<script lang="ts">
  import type { Answer, ProposalView } from '$lib/link-proposals.js';
  import ActorChip from './ActorChip.svelte';
  import Button from './Button.svelte';
  import MarkdownView from './MarkdownView.svelte';

  let {
    proposals = [],
    me,
    onanswer,
  }: {
    proposals?: ProposalView[];
    /** The session actor's id; without one the controls are hidden. */
    me?: string;
    onanswer: (proposalId: string, answer: Answer) => void;
  } = $props();

  const count = (p: ProposalView, a: 'agree' | 'disagree') =>
    Object.values(p.answers).filter((x) => x === a).length;
  const answer = (p: ProposalView, a: 'agree' | 'disagree') =>
    onanswer(p.id, me && p.answers[me] === a ? 'withdrawn' : a);
</script>

{#if proposals.length}
  <section class="proposals" aria-label="Proposed links" data-testid="link-proposals" data-part="proposals">
    {#each proposals as p (p.id)}
      {@const mine = me ? p.answers[me] : undefined}
      <article class="proposals__item" data-testid="link-proposal" data-part="item" data-answer={mine ?? 'none'}>
        <header class="proposals__meta" data-part="meta">
          <ActorChip actor={p.author} />
          <span class="proposals__link" data-part="link">
            <span class="proposals__relation">{p.relationLabel}</span>
            <span aria-hidden="true">→</span>
            <span class="proposals__target">{p.targetLabel}</span>
          </span>
        </header>
        {#if p.why}<MarkdownView class="proposals__why" data-part="why" value={p.why} />{/if}
        {#if me}
          <div class="proposals__answers" data-part="answers">
            <Button size="sm" variant="mono" active={mine === 'agree'} aria-pressed={mine === 'agree'}
              data-testid="proposal-agree" onclick={() => answer(p, 'agree')}>
              Tick{#if count(p, 'agree')}<span class="proposals__count"> {count(p, 'agree')}</span>{/if}
            </Button>
            <Button size="sm" variant="mono" active={mine === 'disagree'} aria-pressed={mine === 'disagree'}
              data-testid="proposal-disagree" onclick={() => answer(p, 'disagree')}>
              Deny{#if count(p, 'disagree')}<span class="proposals__count"> {count(p, 'disagree')}</span>{/if}
            </Button>
          </div>
        {/if}
      </article>
    {/each}
  </section>
{/if}
