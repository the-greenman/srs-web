<!--
  NarrativeView — a conversation's vignettes in order, the owner's words verbatim, with every record
  derived from each vignette beside it (srs-web#622, remedy 2910ac1e). The owner affirms or sets aside
  a derived problem, remedy, cluster or persona here, in the flow of the conversation that produced it,
  never in chat (clerk#197 R2). Other derived records (tensions, findings, decisions) show their layer
  or lifecycle state and are decided elsewhere. Presentation + events only: narrative.ts reads, the
  Method editor's own acts write.
-->
<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  import MarkdownView from '$lib/components/MarkdownView.svelte';
  import Select from '$lib/components/Select.svelte';
  import Tag from '$lib/components/Tag.svelte';
  import TagChip from '$lib/components/TagChip.svelte';
  import { STATUS_LABEL, STATUS_TAG } from './method-document.js';
  import type { Entity, ProblemStatus } from './method-document.js';
  import type { Conversation, VignetteView } from './narrative.js';

  let {
    conversations,
    conversationId = $bindable(''),
    vignettes,
    canAct,
    onaffirm,
    onsetaside,
  }: {
    conversations: Conversation[];
    conversationId?: string;
    vignettes: VignetteView[];
    /** The repository has Affirmed and Set aside containers. */
    canAct: boolean;
    onaffirm: (id: string, entity: Entity) => void;
    onsetaside: (id: string) => void;
  } = $props();

  const isStatus = (l: string): l is ProblemStatus => l in STATUS_LABEL;
</script>

<section class="narrative" aria-label="Conversations" data-testid="narrative-view">
  {#if conversations.length}
    <Select aria-label="Conversation" data-testid="narrative-conversation" bind:value={conversationId}
      options={conversations.map((c) => ({ value: c.containerId, label: c.title }))} />
    {#each vignettes as v (v.id)}
      <article class="narrative__vignette" data-testid="narrative-vignette">
        {#if v.title}<h3 class="narrative__title">{v.title}</h3>{/if}
        <blockquote class="narrative__words" data-part="words"><MarkdownView value={v.words} /></blockquote>
        {#if v.derived.length}
          <ul class="narrative__derived" aria-label="Derived from this">
            {#each v.derived as d (d.id)}
              <li class="narrative__record" data-testid="narrative-record" data-layer={d.layer}>
                <TagChip label={d.typeName} />
                <span class="narrative__record-title">{d.title}</span>
                {#if isStatus(d.layer)}<Tag status={STATUS_TAG[d.layer]}>{STATUS_LABEL[d.layer]}</Tag>{:else}<TagChip label={d.layer} />{/if}
                {#if canAct && d.entity && d.layer === 'suggested'}
                  {@const entity = d.entity}
                  <span class="narrative__acts">
                    <Button size="sm" variant="mono" data-testid="narrative-affirm" onclick={() => onaffirm(d.id, entity)}>Tick</Button>
                    <Button size="sm" variant="mono" data-testid="narrative-set-aside" onclick={() => onsetaside(d.id)}>Deny</Button>
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </article>
    {:else}
      <p class="narrative__empty">This conversation has no vignettes.</p>
    {/each}
  {:else}
    <p class="narrative__empty" data-testid="narrative-empty">No conversations in this repository. A conversation is a container whose identity note is tagged <code>conversation</code>.</p>
  {/if}
</section>

<style>
  .narrative { display: grid; gap: var(--space-sm); }
  .narrative__vignette { display: grid; gap: var(--space-xs); padding-block: var(--space-sm); border-top: 1px solid var(--color-line); }
  .narrative__title { margin: 0; font-size: var(--size-sm); }
  .narrative__words { margin: 0; padding-inline-start: var(--space-sm); border-inline-start: 3px solid var(--color-line); }
  .narrative__derived { display: grid; gap: var(--space-xs); margin: 0; padding: 0; list-style: none; }
  .narrative__record { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs); }
  .narrative__record-title { font-weight: 600; }
  .narrative__acts { display: inline-flex; gap: var(--space-xs); margin-inline-start: auto; }
  .narrative__empty { color: var(--color-muted); }
</style>
