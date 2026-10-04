<!--
  ActorStack — overlapping ActorMarks ("who is here"), at most `max` then a "+N" Button opening a
  Popover list of the rest. The aria-label summarises the kinds ("3 agents and 1 person"); undefined
  entries are unattributed. Wraps .actor-stack (comments.css). Story: srs-web#422
-->
<script lang="ts">
  import type { Actor } from '$lib/srs-client.js';
  import ActorChip from './ActorChip.svelte';
  import ActorMark from './ActorMark.svelte';
  import Button from './Button.svelte';
  import Popover from './Popover.svelte';

  let { actors, max = 3 }: { actors: (Actor | undefined)[]; max?: number } = $props();

  const shown = $derived(actors.slice(0, max));
  const rest = $derived(actors.slice(max));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const summary = $derived.by(() => {
    const agents = actors.filter((a) => a?.kind === 'ai').length;
    const people = actors.length - agents;
    return [agents && plural(agents, 'agent', 'agents'), people && plural(people, 'person', 'people')]
      .filter(Boolean)
      .join(' and ') || 'No one';
  });
  let more = $state(false);
</script>

<span class="actor-stack" role="group" aria-label={summary} data-testid="actor-stack">
  {#each shown as a}<ActorMark actor={a} size="sm" />{/each}
  {#if rest.length}
    <Popover bind:open={more} placement="bottom-end" role="region" label="More participants" class="actor-stack__list">
      {#snippet trigger({ props })}
        <Button size="sm" variant="ghost" class="actor-stack__more" data-part="more" aria-label={`${rest.length} more`} {...props}>+{rest.length}</Button>
      {/snippet}
      {#if more}
        <ul class="actor-stack__items">
          {#each rest as a}<li><ActorChip actor={a} /></li>{/each}
        </ul>
      {/if}
    </Popover>
  {/if}
</span>
