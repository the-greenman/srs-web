<!-- Test host for EssayShell: a reactive agentPanel snippet (a raw snippet renders once and cannot track the model). -->
<script lang="ts">
  import EssayShell from '../src/lib/essay/EssayShell.svelte';
  import type { AgentStatus } from '../src/lib/agent-activity.js';

  let { agentStatus, ...rest }: { agentStatus: AgentStatus; [k: string]: unknown } = $props();
</script>

<EssayShell {...(rest as never)} {agentStatus}>
  {#snippet agentPanel(ctx)}<span>controls {ctx?.lastActivity('agent:a')}</span>{/snippet}
</EssayShell>
