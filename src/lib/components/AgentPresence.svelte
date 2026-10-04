<!--
  AgentPresence — "who is here": an ActorStack of the connected agents (status "online"), from
  AgentStatus.agents (no data-model change). Presentation only. Story: srs-web#422
-->
<script lang="ts">
  import type { AgentStatus } from '$lib/agent-activity.js';
  import ActorStack from './ActorStack.svelte';

  let { status }: { status: AgentStatus } = $props();
  const here = $derived(status.agents.filter((a) => a.status === 'online').map((a) => ({ kind: 'ai' as const, id: a.id, name: a.name })));
</script>

{#if here.length}<span class="presence" data-testid="presence"><ActorStack actors={here} /></span>{/if}
