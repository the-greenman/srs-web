<!--
  RecentRepos — the "Favourites and recent" section of a landing page: the repositories opened lately,
  starred first (srs-web#661). Renders nothing when `recent` is empty. Presentation only (ADR-001): the
  caller owns the list and opening.
-->
<script lang="ts">
  import Star from '@lucide/svelte/icons/star';
  import X from '@lucide/svelte/icons/x';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import IconButton from './IconButton.svelte';
  import Notice from './Notice.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import SourceRow from './SourceRow.svelte';
  import type { RecentRepo } from '$lib/recent-repos.js';

  let {
    recent = [],
    onOpenRecent,
    onToggleStar,
    onRemoveRecent,
    recentError = null,
    recentBusyKey = null,
  }: {
    recent?: RecentRepo[];
    onOpenRecent?: (entry: RecentRepo) => void;
    onToggleStar?: (key: string) => void;
    onRemoveRecent?: (key: string) => void;
    recentError?: string | null;
    /** Key of the entry being reopened, if any. */
    recentBusyKey?: string | null;
  } = $props();

  /** "main" or "main · sub/dir" from a GitHub `owner/repo:branch:dir`. */
  function recentHint(entry: RecentRepo): string {
    const [, branch = '', ...dir] = entry.source.where.split(':');
    const sub = dir.join(':');
    return sub ? `${branch} · ${sub}` : branch;
  }
</script>

{#if recent.length > 0}
  <section class="landing__section landing__recent" data-testid="recent-repos">
    <SectionHeader number="00" label="Favourites and recent" />
    {#if recentError}<Notice kind="error" testid="recent-error">{recentError}</Notice>{/if}
    <ul class="landing__recent-list">
      {#each recent as entry (entry.key)}
        <li class="landing__recent-item" data-testid="recent-item">
          <SourceRow
            icon={GitBranch}
            label={entry.label}
            hint={recentHint(entry)}
            busy={recentBusyKey === entry.key}
            disabled={recentBusyKey !== null}
            onclick={() => onOpenRecent?.(entry)}
          />
          <IconButton
            size="sm"
            icon={Star}
            label="Favourite"
            pressed={entry.starred}
            data-testid="recent-star"
            onclick={() => onToggleStar?.(entry.key)}
          />
          <IconButton
            size="sm"
            icon={X}
            label="Remove from this list"
            data-testid="recent-remove"
            onclick={() => onRemoveRecent?.(entry.key)}
          />
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .landing__recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .landing__recent-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .landing__recent-item :global(.source-row) {
    flex: 1;
    min-width: 0;
  }
</style>
