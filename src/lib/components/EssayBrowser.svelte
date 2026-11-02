<!--
  EssayBrowser — the essays of a repository grouped by domain (a narrower domain indented beneath its
  parent), newest first, each with how it is related: the essays it was copied from or copied to, and the
  paragraphs it shares with them (the strongest link). Essays that name no domain come last, so the writer
  can see what still needs one. Presentation only: the groups come from essay-browse.ts. Shares the tray
  stylesheet (draft-tray.css).
  Issue: https://github.com/the-greenman/srs-web/issues/623
-->
<script lang="ts">
  import type { DomainGroup, FamilyLink } from '$lib/essay/essay-browse.js';
  import Button from './Button.svelte';
  import TrayRow from './TrayRow.svelte';

  let {
    groups,
    currentId = null,
    onopen,
  }: {
    groups: DomainGroup[];
    /** The essay open now; its row has no Open button. */
    currentId?: string | null;
    onopen: (essayId: string) => void;
  } = $props();

  const KIND = { parent: 'copied from', child: 'copied to', sibling: 'shares with' } as const;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const link = (l: FamilyLink) =>
    `${KIND[l.kind]} ${l.title}${l.shared ? ` (${plural(l.shared, 'shared paragraph')})` : ''}`;
</script>

<div class="tray" data-testid="essay-browser">
  {#if groups.length === 0}
    <p class="tray__empty">There are no essays yet.</p>
  {/if}
  {#each groups as g (g.boundaryId ?? 'none')}
    <h4 class="tray__subhead" style:padding-inline-start={`${g.depth}rem`} data-testid="browse-domain">
      {g.label} ({g.essays.length})
    </h4>
    {#each g.essays as e (e.id)}
      <TrayRow label={e.title} data-testid="browse-essay">
        {#snippet actions()}
          {#if e.sharedParagraphs}<span data-testid="browse-shared">{plural(e.sharedParagraphs, 'shared paragraph')}</span>{/if}
          {#if e.id !== currentId}
            <Button size="sm" variant="mono" onclick={() => onopen(e.id)} aria-label={`Open ${e.title}`}>Open</Button>
          {/if}
        {/snippet}
      </TrayRow>
      {#each e.family as l (l.essayId)}
        <p class="tray__empty" data-testid="browse-family">{link(l)}</p>
      {/each}
    {/each}
  {/each}
</div>
