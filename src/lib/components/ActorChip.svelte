<!--
  ActorChip — an actor's name with a stable colour (same actor id, same colour) and its kind
  (human / ai) as text, so it stays legible without colour. Presentation only: the actor is the
  engine-stamped `createdBy` (RFC-046), never chosen here. The leading shape is ActorMark's (circle
  = human, notched square = agent). No actor (or no id) is the explicit "Unattributed" state: a
  neutral chip with no kind text. Composes .hue-pill; wraps .actor-chip (comments.css).
  Story: srs-web#330 / #372 / #422
-->
<script lang="ts">
  import { actorHue } from '$lib/actor-hue.js';
  import type { Actor } from '$lib/srs-client.js';

  let { actor }: { actor?: Actor } = $props();
  const known = $derived(!!actor?.id);
</script>

<span
  class="actor-chip hue-pill"
  class:hue-pill--neutral={!known}
  style:--actor-hue={known ? actorHue(actor!.id) : undefined}
  data-testid="actor-chip"
>
  <span class="actor-mark actor-mark--sm actor-chip__shape" class:actor-mark--ai={actor?.kind === 'ai'} aria-hidden="true"></span>
  <span class="actor-chip__name" data-testid="actor-name">{known ? actor!.name || actor!.id : 'Unattributed'}</span>
  {#if known}<span class="actor-chip__kind" data-testid="actor-kind">{actor!.kind}</span>{/if}
</span>
