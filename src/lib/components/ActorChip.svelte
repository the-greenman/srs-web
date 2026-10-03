<!--
  ActorChip — an actor's name with a stable colour (same actor id, same colour) and its kind
  (human / ai) as text, so it stays legible without colour. Presentation only: the actor is the
  engine-stamped `createdBy` (RFC-046), never chosen here. Wraps .actor-chip (comments.css).
  Story: srs-web#330 / #372
-->
<script lang="ts">
  import { actorHue } from '$lib/agent-activity.js';
  import type { Actor } from '$lib/srs-client.js';

  let { actor }: { actor: Actor } = $props();
</script>

<span class="actor-chip" style:--actor-hue={actorHue(actor.id)} data-testid="actor-chip">
  <span class="actor-chip__name" data-testid="actor-name">{actor.name || actor.id}</span>
  <span class="actor-chip__kind" data-testid="actor-kind">{actor.kind}</span>
</span>
