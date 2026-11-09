<!--
  EssayHome — the essay editor's front page: LandingFrame with RecentRepos (srs-web#730) above five numbered sections, "01 Start",
  "02 Examples", "03 Open" (SourceChooser), "04 How it works" and "05 What makes it different": practical first, the meaning last. Presentation only (ADR-027): every
  help word comes from `items` (the essay-home help container, `helpFor("essay-home")`); the section
  labels, the eyebrow and "More" are literal chrome, as in Landing.svelte. The caller owns opening and starting. `notices` is the slot above the sections. Extra attributes go to the frame root.
-->
<script lang="ts">
  import type { Snippet, ComponentProps } from 'svelte';
  import type { HelpItem } from '$lib/help/help.js';
  import Button from './Button.svelte';
  import Disclosure from './Disclosure.svelte';
  import LandingFrame from './LandingFrame.svelte';
  import MarkdownView from './MarkdownView.svelte';
  import RecentRepos from './RecentRepos.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import SourceChooser from './SourceChooser.svelte';

  let {
    items,
    onNew,
    notices,
    recents = {},
    providers,
    onOpen,
    onOpenArchive,
    onOpenUrl,
    ...rest
  }: {
    items: HelpItem[];
    onNew: () => void;
    notices?: Snippet;
    recents?: ComponentProps<typeof RecentRepos>;
  } & ComponentProps<typeof SourceChooser> &
    Omit<ComponentProps<typeof LandingFrame>, 'title' | 'standfirst' | 'eyebrow' | 'children' | 'notices'> = $props();

  const byId = (id: string) => items.find((i) => i.featureId === id);
  const heading = $derived(byId('essay-home.human-in-charge'));
  const DIFFERENT = ['essay-home.ai-can', 'essay-home.ai-cannot', 'essay-home.ai-enforced', 'essay-home.owning-meaning'];
  const different = $derived(items.filter((i) => DIFFERENT.includes(i.featureId)));
  const concepts = $derived(
    items.filter(
      (i) =>
        i.placement === 'concept' &&
        i.featureId !== 'essay-home.human-in-charge' &&
        !DIFFERENT.includes(i.featureId)
    )
  );
  const start = $derived(byId('essay-home.start'));
  const examples = $derived(byId('essay-home.examples'));
  const connect = $derived(byId('shell.connect-ai'));
</script>

{#snippet concept(item: HelpItem)}
  <h3>{item.title}</h3>
  <MarkdownView value={item.summary} />
  {#if item.explanation}
    <Disclosure label="More"><MarkdownView value={item.explanation} /></Disclosure>
  {/if}
{/snippet}

<LandingFrame
  eyebrow="Essay editor"
  title={heading?.title}
  standfirst={heading?.summary}
  {notices}
  {...rest}
>
  <div class="landing__body" data-part="body">
    <RecentRepos {...recents} />
    {#if start}
      <section class="landing__section">
        <SectionHeader number="01" label="Start" />
        <Button variant="primary" data-feature="essay-home.start" onclick={onNew}>{start.title}</Button>
        <MarkdownView value={start.summary} />
      </section>
    {/if}
    {#if examples}
      <section class="landing__section" data-feature="essay-home.examples">
        <SectionHeader number="02" label="Examples" />
        <MarkdownView value={examples.summary} />
        {#if examples.explanation}<MarkdownView value={examples.explanation} />{/if}
      </section>
    {/if}
    <section class="landing__section">
      <SectionHeader number="03" label="Open" />
      <SourceChooser {providers} {onOpen} {onOpenArchive} {onOpenUrl} />
    </section>
    <section class="landing__section">
      <SectionHeader number="04" label="How it works" />
      {#each [...concepts, ...(connect ? [connect] : [])] as item (item.instanceId)}
        {@render concept(item)}
      {/each}
    </section>
    {#if different.length}
      <section class="landing__section landing__different" data-testid="essay-home-different">
        <SectionHeader number="05" label="What makes it different" />
        {#each different as item (item.instanceId)}
          <div class="landing__different-item">{@render concept(item)}</div>
        {/each}
      </section>
    {/if}
  </div>
</LandingFrame>
