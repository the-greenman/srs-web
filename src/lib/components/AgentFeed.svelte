<!--
  AgentFeed — the newest-first feed of agent writes (the per-agent row lives in McpConnection). Presentation only: App observes the writes (agent-activity.ts); the shell supplies
  the paragraph label and what a click does. A write whose paragraph is unknown is not clickable.
  Wraps .agent-activity (agent-activity.css). Story: srs-web#372
-->
<script lang="ts">
  import ActorChip from './ActorChip.svelte';
  import { ago, verb } from '$lib/agent-activity.js';
  import type { AgentStatus, AgentWrite } from '$lib/agent-activity.js';

  let {
    status,
    paragraphLabel,
    onselect,
    now = Date.now(),
    limit = 20,
  }: {
    status: AgentStatus;
    /** The paragraph's label, or undefined when `instanceId` is not a paragraph of the open essay. */
    paragraphLabel: (instanceId: string) => string | undefined;
    onselect: (instanceId: string) => void;
    /** The shell's clock, so every relative time ticks together. */
    now?: number;
    limit?: number;
  } = $props();

  const actor = (id: string) => ({ kind: 'ai' as const, id, name: status.agents.find((a) => a.id === id)?.name });
  const what = (w: AgentWrite) => {
    const label = w.instanceId ? paragraphLabel(w.instanceId) : undefined;
    return label === undefined ? verb(w) : `${verb(w)} ¶ ${label}`;
  };
</script>

{#if status.writes.length}
  <h3 class="agent-activity__head">Activity</h3>
  <ul class="agent-activity" aria-label="Agent activity" data-testid="agent-feed">
    {#each status.writes.slice(0, limit) as w (w.seq)}
      <li class="agent-activity__entry" data-testid="agent-feed-entry">
        <ActorChip actor={actor(w.agentId)} />
        {#if w.instanceId && paragraphLabel(w.instanceId) !== undefined}
          <button type="button" class="agent-activity__what" data-testid="agent-feed-focus" onclick={() => onselect(w.instanceId as string)}>{what(w)} · {ago(w.at, now)}</button>
        {:else}
          <span class="agent-activity__what">{what(w)} · {ago(w.at, now)}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
