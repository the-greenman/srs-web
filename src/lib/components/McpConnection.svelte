<!--
  McpConnection — the per-agent detail block under an AgentPanel row: the pairing view (connector URL,
  pairing code, expiry; fed by PairingLoader), the direct caller URL under Advanced, takeover for a
  refused/replaced channel, the connection error (inline Notice, ADR-020 j) and notes. Identity,
  status word and Disconnect/Rotate live on the row (AgentPanel). Presentation only: the host decides
  state, the loader owns the pairing timers. Wraps .mcp-conn* (src/styles/components/mcp-connection.css);
  parts `pairing advanced`. srs-web#307, #442, #447
-->
<script lang="ts">
  import Button from './Button.svelte';
  import CopyField from './CopyField.svelte';
  import Disclosure from './Disclosure.svelte';
  import Notice from './Notice.svelte';
  import type { PairingView } from './agent-panel.js';
  export type McpConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'replaced' | 'rejected' | 'error';

  let {
    status,
    callerUrl = null,
    error = null,
    pairingView = null,
    onTakeover,
    onClosePair,
    onRetryPair,
  }: {
    status: McpConnectionStatus;
    callerUrl?: string | null;
    error?: string | null;
    pairingView?: PairingView | null;
    onTakeover?: () => void;
    onClosePair?: () => void;
    onRetryPair?: () => void;
  } = $props();

  let advancedOpen = $state(false);
</script>

{#if error || callerUrl || pairingView || status === 'rejected' || status === 'replaced'}
<section class="mcp-conn" data-testid="mcp-connection" aria-label="MCP connection">
  {#if error}<Notice kind="error">{error}</Notice>{:else if status === 'rejected'}<p class="mcp-conn__note">Another tab holds it, or the relay rejected this page origin (executor_origin_forbidden).</p>{/if}
  {#if pairingView}
    <div class="mcp-conn__pairing" data-part="pairing">
      <p class="mcp-conn__note" data-testid="pair-help">Paste the connector URL into any MCP client. It will ask for this code.</p>
      {#if pairingView.data}
        <CopyField value={pairingView.data.connectorUrl} label="Connector URL" buttonLabel="Copy connector URL" testid="pair-url" />
        <div class="mcp-conn__code"><CopyField value={pairingView.data.code} label="Pairing code" buttonLabel="Copy pairing code" testid="pair-code" /></div>
        <p class="mcp-conn__expiry" data-testid="pair-countdown">{pairingView.minutes === 0 ? 'Refreshing…' : `Expires in about ${pairingView.minutes} min`}</p>
        <p class="mcp-conn__note" data-testid="pair-security">Anyone with this code can connect to this document until it refreshes. Changes stay unsaved until you Save or Export.</p>
      {:else if !pairingView.error}
        <p class="mcp-conn__note" data-testid="pair-loading">Getting a pairing code…</p>
      {/if}
      {#if pairingView.error}
        <Notice kind="error" testid="pair-error">{pairingView.error}</Notice>
        <div class="mcp-conn__actions"><Button size="sm" variant="secondary" onclick={onRetryPair} data-testid="pair-retry">Retry</Button></div>
      {/if}
      <div class="mcp-conn__actions"><Button size="sm" variant="ghost" onclick={onClosePair} data-testid="pair-close">Done</Button></div>
    </div>
  {/if}
  {#if callerUrl}
    <div data-part="advanced">
      <Disclosure label="Advanced: direct URL" bind:open={advancedOpen} testid="mcp-advanced-open">
        <CopyField value={callerUrl} label="Direct URL" buttonLabel="Copy direct URL" testid="mcp-caller-url" />
        <p class="mcp-conn__note">Anyone with this URL can read and write this document while this tab is connected. MCP changes are unsaved until you Save or Export.</p>
      </Disclosure>
    </div>
  {/if}
  {#if status === 'rejected' || status === 'replaced'}
    <div class="mcp-conn__actions" data-part="actions">
      <Button size="sm" variant="secondary" onclick={onTakeover} data-testid="mcp-takeover">Take over here</Button>
    </div>
  {/if}
</section>
{/if}
