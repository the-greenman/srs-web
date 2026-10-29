<!--
  Landing — the idle page: LandingFrame with the two numbered sections, "01 Open" (SourceChooser) and
  "02 Start new" (CreateRepositoryPanel), side by side and stacking below the form breakpoint.
  Above them, when `recent` is non-empty, "Favourites and recent" lists the repositories opened lately,
  starred first (srs-web#661). Presentation only (ADR-001): the caller owns opening and creating. `notices` is the slot above the
  sections for restore, link and error Notices. Extra attributes go to the frame root.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ComponentProps } from 'svelte';
  import Star from '@lucide/svelte/icons/star';
  import X from '@lucide/svelte/icons/x';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import IconButton from './IconButton.svelte';
  import Notice from './Notice.svelte';
  import SourceRow from './SourceRow.svelte';
  import type { RecentRepo } from '$lib/recent-repos.js';
  import CreateRepositoryPanel from './CreateRepositoryPanel.svelte';
  import LandingFrame from './LandingFrame.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import SourceChooser from './SourceChooser.svelte';

  let {
    providers,
    onOpen,
    onOpenArchive,
    onOpenUrl,
    onCreate,
    notices,
    recent = [],
    onOpenRecent,
    onToggleStar,
    onRemoveRecent,
    recentError = null,
    ...rest
  }: {
    notices?: Snippet;
    recent?: RecentRepo[];
    onOpenRecent?: (entry: RecentRepo) => void;
    onToggleStar?: (key: string) => void;
    onRemoveRecent?: (key: string) => void;
    recentError?: string | null;
    onCreate: ComponentProps<typeof CreateRepositoryPanel>['onCreate'];
  } & ComponentProps<typeof SourceChooser> &
    Omit<ComponentProps<typeof LandingFrame>, 'title' | 'standfirst' | 'eyebrow' | 'children' | 'notices'> = $props();
</script>

<LandingFrame
  title="Open a repository, or start one."
  standfirst="Read and edit .srs and .srsj documents, their records and structure."
  {notices}
  {...rest}
>
  <div class="landing__body" data-part="body">
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
                hint={entry.source.where.split(':').slice(1).join(':')}
                onclick={() => onOpenRecent?.(entry)}
              />
              <IconButton
                size="sm"
                icon={Star}
                label={entry.starred ? 'Remove from favourites' : 'Add to favourites'}
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
    <section class="landing__section">
      <SectionHeader number="01" label="Open" />
      <SourceChooser {providers} {onOpen} {onOpenArchive} {onOpenUrl} />
    </section>
    <section class="landing__section">
      <SectionHeader number="02" label="Start new" />
      <CreateRepositoryPanel {onCreate} />
    </section>
  </div>
</LandingFrame>

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
