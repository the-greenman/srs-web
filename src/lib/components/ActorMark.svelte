<!--
  ActorMark — the compact actor identity: a focusable mark in the actor's hue (--actor-hue from the
  one actorHue function) carrying the initial. Shape tells kind, not colour (ADR-020): human = circle,
  agent = rounded square with a corner notch. No actor (or no id) is the explicit unattributed state:
  a neutral, hue-less circle. Hover or focus shows a HoverCard (name, kind, id) on the shared hover
  bridge; the aria-label carries the name, so the tooltip is never the only way to read it.
  Wraps .actor-mark (comments.css). Story: srs-web#422
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { actorHue } from '$lib/actor-hue.js';
  import type { Actor } from '$lib/srs-client.js';
  import HoverCard from './HoverCard.svelte';
  import { hoverBridge } from './hover-bridge.js';

  let { actor, size = 'md' }: { actor?: Actor; size?: 'sm' | 'md' } = $props();

  const known = $derived(!!actor?.id);
  const name = $derived(known ? actor!.name || actor!.id : 'Unattributed');
  const agent = $derived(actor?.kind === 'ai');
  const label = $derived(known ? `${name} (${agent ? 'agent' : 'human'})` : 'Unattributed');

  let cardOpen = $state(false);
  let wrap = $state<HTMLElement>();
  const hover = hoverBridge((o) => (cardOpen = o));
  onDestroy(hover.destroy);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="actor-mark-wrap"
  bind:this={wrap}
  onmouseenter={hover.show}
  onmouseleave={hover.hide}
  onfocusin={hover.show}
  onfocusout={hover.hide}
  onkeydown={(e) => {
    if (e.key === 'Escape' && cardOpen) {
      e.stopPropagation();
      hover.close();
    }
  }}
>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <span
    class="actor-mark hue-pill actor-mark--{size}"
    class:actor-mark--ai={agent}
    class:hue-pill--neutral={!known}
    style:--actor-hue={known ? actorHue(actor!.id) : undefined}
    role="img"
    tabindex="0"
    aria-label={label}
    data-testid="actor-mark"
    data-part="mark"
  >{name.charAt(0).toUpperCase()}</span>
  <HoverCard kind={known ? (agent ? 'agent' : 'human') : 'unattributed'} title={name} text={known ? actor!.id : ''} bind:open={cardOpen} anchor={wrap} />
</span>
