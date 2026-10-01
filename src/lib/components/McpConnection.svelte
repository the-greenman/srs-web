<!--
  McpConnection — status + controls for the browser-hosted MCP endpoint relayed
  to AI callers. Presentation only: the host decides state; this renders it,
  offers a copyable caller URL, rotation and takeover. Wraps .mcp-conn*
  (src/styles/components/mcp-connection.css).
  srs-web#307: https://github.com/the-greenman/srs-web/issues/307
-->
<script lang="ts">
  export type McpConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'replaced' | 'rejected' | 'error';

  let {
    status = 'idle',
    callerUrl = null,
    error = null,
    repositoryName = null,
    onRotate,
    onTakeover,
  }: {
    status?: McpConnectionStatus;
    callerUrl?: string | null;
    error?: string | null;
    repositoryName?: string | null;
    onRotate?: () => void;
    onTakeover?: () => void;
  } = $props();

  const label: Record<McpConnectionStatus, string> = {
    idle: 'Not connected',
    connecting: 'Connecting…',
    online: 'Connected',
    offline: 'Reconnecting…',
    replaced: 'Taken over by another tab',
    rejected: 'Another tab holds this connection',
    error: 'Connection failed',
  };

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

<section class="mcp-conn" data-testid="mcp-connection" aria-label="MCP connection">
  <div class="mcp-conn__head">
    <span class="mcp-conn__dot mcp-conn__dot--{status}" aria-hidden="true"></span>
    <span class="mcp-conn__status" data-testid="mcp-status">{label[status]}</span>
    {#if repositoryName}<span class="mcp-conn__repo">{repositoryName}</span>{/if}
  </div>
  {#if error}<p class="mcp-conn__error" role="alert">{error}</p>{/if}
  {#if callerUrl}
    <div class="mcp-conn__url">
      <input class="mcp-conn__input" readonly value={callerUrl} aria-label="MCP caller URL" data-testid="mcp-caller-url" onfocus={(e) => e.currentTarget.select()} />
      <button type="button" class="btn btn--mono" onclick={copy} data-testid="mcp-copy">{copied ? 'Copied' : 'Copy'}</button>
    </div>
    <p class="mcp-conn__note">Anyone with this URL can read and write this document while this tab is connected. MCP changes are unsaved until you Save or Export.</p>
  {/if}
  <div class="mcp-conn__actions">
    {#if status === 'rejected' || status === 'replaced'}
      <button type="button" class="btn btn--secondary" onclick={onTakeover} data-testid="mcp-takeover">Take over here</button>
    {/if}
    {#if onRotate}
      <button type="button" class="btn btn--ghost" onclick={onRotate} data-testid="mcp-rotate">Rotate URL</button>
    {/if}
  </div>
  {#if onRotate}
    <p class="mcp-conn__note">Rotating moves this tab to a new URL. The old URL goes offline once this tab disconnects, but is not revoked.</p>
  {/if}
</section>
