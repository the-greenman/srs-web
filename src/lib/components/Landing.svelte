<!--
  Landing — the idle page: LandingFrame with the two numbered sections, "01 Open" (SourceChooser) and
  "02 Start new" (CreateRepositoryPanel), side by side and stacking below the form breakpoint.
  Presentation only (ADR-001): the caller owns opening and creating. `notices` is the slot above the
  sections for restore, link and error Notices. Extra attributes go to the frame root.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ComponentProps } from 'svelte';
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
    ...rest
  }: {
    notices?: Snippet;
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
