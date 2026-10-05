<!--
  McpConnection — the per-agent detail block under an AgentPanel row: the copyable caller URL,
  takeover for a refused/replaced channel, the connection error (inline Notice, ADR-020 j) and
  notes. Identity, status word and Disconnect/Rotate live on the row (AgentPanel). Presentation
  only: the host decides state. Wraps .mcp-conn* (src/styles/components/mcp-connection.css).
  srs-web#307, #442
-->
<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import Button from './Button.svelte';
  import IconButton from './IconButton.svelte';
  import Input from './Input.svelte';
  import Notice from './Notice.svelte';
  export type McpConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'replaced' | 'rejected' | 'error';

  let {
    status,
    callerUrl = null,
    error = null,
    onTakeover,
  }: {
    status: McpConnectionStatus;
    callerUrl?: string | null;
    error?: string | null;
    onTakeover?: () => void;
  } = $props();

  let copied = $state(false);
  async function copy() {
    if (!callerUrl) return;
    try {
      await navigator.clipboard.writeText(callerUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard unavailable: the URL stays selectable in the field */
    }
  }
</script>

{#if error || callerUrl || status === 'rejected' || status === 'replaced'}
<section class="mcp-conn" data-testid="mcp-connection" aria-label="MCP connection">
  {#if error}<Notice kind="error">{error}</Notice>{:else if status === 'rejected'}<p class="mcp-conn__note">Another tab holds it, or the relay rejected this page origin (executor_origin_forbidden).</p>{/if}
  {#if callerUrl}
    <div class="mcp-conn__url" data-part="url">
      <Input readonly value={callerUrl} aria-label="MCP caller URL" data-part="input" data-testid="mcp-caller-url" onfocus={(e) => e.currentTarget.select()} />
      <IconButton icon={copied ? Check : Copy} variant="outline" label={copied ? 'Copied' : 'Copy'} onclick={copy} data-testid="mcp-copy" />
    </div>
    <p class="mcp-conn__note">Anyone with this URL can read and write this document while this tab is connected. MCP changes are unsaved until you Save or Export.</p>
  {/if}
  {#if status === 'rejected' || status === 'replaced'}
    <div class="mcp-conn__actions" data-part="actions">
      <Button size="sm" variant="secondary" onclick={onTakeover} data-testid="mcp-takeover">Take over here</Button>
    </div>
  {/if}
</section>
{/if}
