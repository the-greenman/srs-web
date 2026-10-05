<!--
  AgentPanel — the agent library in one place (#442): saved agents as rows (ActorMark, name, relay,
  status dot, Connect/Disconnect, a ⋯ menu), the relay library as rows, and the two add forms behind
  Disclosures. Presentational: App passes the data and owns every handler, storage and host; errors
  from add/edit/remove come back as text and render inline (ADR-020 j). No headings, no native details element.
  Never a store import. With no relay the whole panel is "No relay yet.". Test ids of the
  pre-#442 dock are kept on the redesigned elements. Wraps .agent-panel (agent-panel.css); tokens
  `--agent-panel-*`; parts `agent relay name meta dot status actions`.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { AgentPanelCtx } from '$lib/agent-activity.js';
  import { relativeTime } from '$lib/relative-time.js';
  import type { Relay } from '$lib/relay-library.js';
  import ActionMenu from './ActionMenu.svelte';
  import ActorMark from './ActorMark.svelte';
  import type { PairingResponse } from '$lib/mcp/relay-protocol';
    import type { PairingView, PanelAgent } from './agent-panel.js';
  import Button from './Button.svelte';
  import Disclosure from './Disclosure.svelte';
  import Input from './Input.svelte';
  import McpConnection from './McpConnection.svelte';
  import Notice from './Notice.svelte';
  import PairingLoader from './PairingLoader.svelte';
  import Select from './Select.svelte';
  import Tag from './Tag.svelte';
  import type { MenuAction } from './menu-action.js';

  let {
    relays,
    agents,
    ctx,
    now,
    onAddRelay,
    onUpdateRelay,
    onRemoveRelay,
    onSetDefault,
    onConnectNew,
    onConnect,
    onDisconnect,
    onForget,
    onRename,
    onRotate,
    onTakeover,
    pair,
  }: {
    relays: Relay[];
    agents: PanelAgent[];
    ctx?: AgentPanelCtx;
    /** App's clock (ms), for "Connected 2 min ago". */
    now: number;
    /** Each returns an error message, or null on success. */
    onAddRelay: (label: string, url: string) => string | null;
    onUpdateRelay: (id: string, patch: { label?: string; url?: string }) => string | null;
    onRemoveRelay: (id: string) => string | null;
    onSetDefault: (id: string) => void;
    onConnectNew: (label: string, relayId: string) => void;
    onConnect: (id: string) => void;
    onDisconnect: (id: string) => void;
    onForget: (id: string) => void;
    onRename: (id: string, label: string) => void;
    onRotate: (id: string) => void;
    onTakeover: (id: string) => void;
    /** The current pairing code for an open agent; rejects when it cannot be fetched. */
    pair: (id: string) => Promise<PairingResponse>;
  } = $props();

  const STATUS: Record<string, string> = {
    idle: 'Not connected',
    connecting: 'Connecting…',
    online: 'Connected',
    offline: 'Reconnecting…',
    replaced: 'Taken over by another tab',
    // A browser WebSocket cannot read the HTTP status, so a 409 (held by another tab) and a
    // 403 executor_origin_forbidden both arrive as a refused connect.
    rejected: 'Connection refused',
    error: 'Connection failed',
  };

  const uid = $props.id();
  let root = $state<HTMLElement>();
  let connectOpen = $state(false);
  let relayFormOpen = $state(false);
  $effect(() => {
    if (relays.length === 0) relayFormOpen = true;
  });

  // Connect an agent
  let newName = $state('');
  let newRelayId = $state('');
  $effect(() => {
    if (!relays.some((r) => r.id === newRelayId)) newRelayId = (relays.find((r) => r.isDefault) ?? relays[0])?.id ?? '';
  });

  // Add / edit a relay (one form)
  let editingId = $state<string | null>(null);
  let formLabel = $state('');
  let formUrl = $state('');
  let formError = $state<string | null>(null);
  const editing = $derived(relays.find((r) => r.id === editingId));
  const editingUsed = $derived(editing ? agents.filter((a) => a.conn.relayId === editing.id).length : 0);
  let rowError = $state<{ id: string; text: string } | null>(null);
  // A stale remove error goes when the lists change; an edit of a relay that vanished is abandoned.
  $effect(() => {
    void relays;
    void agents;
    rowError = null;
  });
  $effect(() => {
    if (editingId && !relays.some((r) => r.id === editingId)) resetForm();
  });

  function startEdit(r: Relay) {
    editingId = r.id;
    formLabel = r.label;
    formUrl = r.url;
    formError = null;
    relayFormOpen = true;
    void tick().then(() => root?.querySelector<HTMLElement>('[data-testid="relay-label"]')?.focus());
  }
  function resetForm() {
    editingId = null;
    formLabel = '';
    formUrl = '';
    formError = null;
  }
  function submitRelay() {
    const err = editing
      ? onUpdateRelay(editing.id, { label: formLabel, ...(editingUsed ? {} : { url: formUrl }) })
      : onAddRelay(formLabel, formUrl);
    formError = err;
    if (err) return;
    resetForm();
    relayFormOpen = false;
  }

  // Rename (disconnected agents only)
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  function startRename(a: PanelAgent) {
    renamingId = a.conn.id;
    renameValue = a.conn.label ?? a.name;
    void tick().then(() => root?.querySelector<HTMLInputElement>('[data-testid="agent-rename-input"]')?.focus());
  }
  function finishRename(save: boolean) {
    if (save && renamingId) onRename(renamingId, renameValue);
    renamingId = null;
  }

  // Pairing / direct-URL view (#447, #456): one at a time, shown only while the row still has the channel it was opened on.
  let viewOpen = $state<{ id: string; callerUrl: string; kind: 'pair' | 'direct' } | null>(null);
  const viewShown = (a: PanelAgent, kind: 'pair' | 'direct') =>
    !!a.state?.callerUrl && viewOpen?.kind === kind && viewOpen.id === a.conn.id && viewOpen.callerUrl === a.state.callerUrl;
  const shownId = $derived(agents.find((a) => viewShown(a, 'pair') || viewShown(a, 'direct'))?.conn.id ?? null);
  let liveView = $state<PairingView>();
  let liveRetry = $state<() => void>();
  const rowEl = (id: string) => root?.querySelector<HTMLElement>(`[data-agent-id="${id}"]`);
  let wasShown: string | null = null;
  // Closing is permanent (Done, rotate, disconnect, forget): clear the state and return focus to that row's menu.
  $effect(() => {
    const id = shownId;
    if (!id && wasShown) {
      const was = wasShown;
      viewOpen = null;
      liveView = undefined;
      // The row may be gone (forgotten): fall back to the panel's first menu, else the panel itself.
      void tick().then(() => {
        const target = rowEl(was)?.querySelector<HTMLElement>('[data-testid="agent-menu"]') ?? root?.querySelector<HTMLElement>('[data-testid="agent-menu"]') ?? root;
        target?.focus();
      });
    }
    wasShown = id;
  });
  // Opening the direct URL puts focus on its field (pairing focuses via PairingLoader).
  $effect(() => {
    if (viewOpen?.kind === 'direct')
      void tick().then(() => root?.querySelector<HTMLElement>('[data-testid="mcp-caller-url"]')?.focus());
  });

  const relayMissing = (a: PanelAgent) => !relays.some((r) => r.id === a.conn.relayId);
  const agentActions = (a: PanelAgent): MenuAction[] => [
    ...(a.state?.callerUrl
      ? (['pair', 'direct'] as const).map((kind) => ({
          id: kind,
          label: kind === 'pair' ? 'Pair an agent…' : 'Direct URL…',
          enabled: true,
          run: () => (viewOpen = { id: a.conn.id, callerUrl: a.state?.callerUrl ?? '', kind }),
        }))
      : []),
    ...(a.state ? [] : [{ id: 'rename', label: 'Rename', enabled: true, run: () => startRename(a) }]),
    ...(a.state ? [{ id: 'rotate', label: 'Rotate URL', enabled: true, run: () => onRotate(a.conn.id) }] : []),
    { id: 'forget', label: 'Forget', enabled: true, run: () => onForget(a.conn.id) },
  ];
  const itemTestid = (a: MenuAction) => ({ forget: 'mcp-library-forget', rotate: 'mcp-rotate' })[a.id] ?? `agent-${a.id}`;
  const relayActions = (r: Relay): MenuAction[] => [
    { id: 'default', label: 'Make default', enabled: !r.isDefault, run: () => onSetDefault(r.id) },
    { id: 'edit', label: 'Edit', enabled: true, run: () => startEdit(r) },
    {
      id: 'remove',
      label: 'Remove',
      enabled: true,
      run: () => {
        const err = onRemoveRelay(r.id);
        rowError = err ? { id: r.id, text: err } : null;
      },
    },
  ];
  // The label/URL and removal checks here are hints: the store re-checks usage and refuses.
  const countOn = (id: string) => agents.filter((a) => a.conn.relayId === id).length;
</script>

{#snippet relayForm()}
  <form
    class="agent-panel__form"
    onsubmit={(e) => {
      e.preventDefault();
      submitRelay();
    }}
  >
    <Input bind:value={formLabel} placeholder="Label (optional)" aria-label="Relay label" data-testid="relay-label" />
    <Input
      bind:value={formUrl}
      type="url"
      inputmode="url"
      placeholder="https://relay.example.com"
      aria-label="Relay URL"
      aria-describedby={formError ? `${uid}-error` : undefined}
      disabled={!!editingUsed}
      data-testid="relay-url"
    />
    {#if editingUsed}<p class="agent-panel__meta">The URL is fixed while {editingUsed} agent{editingUsed === 1 ? '' : 's'} use this relay.</p>{/if}
    {#if formError}<Notice kind="error" id="{uid}-error" testid="relay-error">{formError}</Notice>{/if}
    <div class="agent-panel__actions">
      <Button size="sm" variant="secondary" type="submit" data-testid="relay-save">{editing ? 'Save' : 'Add relay'}</Button>
      {#if editing}<Button size="sm" variant="ghost" type="button" onclick={resetForm}>Cancel</Button>{/if}
    </div>
  </form>
{/snippet}

<div class="agent-panel" bind:this={root} tabindex="-1" data-testid="agent-panel">
  {#if relays.length === 0}
    <p class="agent-panel__empty" data-testid="agent-panel-empty">No relay yet.</p>
  {:else}
    {#if agents.length === 0}
      <p class="agent-panel__meta">No agents yet.</p>
    {:else}
      <ul class="agent-panel__list" data-part="agents">
        {#each agents as a (a.conn.id)}
          <li class="agent-panel__row" data-part="agent" data-agent-id={a.conn.id} data-testid={a.state ? 'mcp-agent-row' : 'mcp-library-item'}>
            <div class="agent-panel__line">
              <ActorMark size="sm" actor={{ kind: 'ai', id: a.conn.id, name: a.name }} />
              <div class="agent-panel__id">
                {#if renamingId === a.conn.id}
                  <Input
                    bind:value={renameValue}
                    aria-label="Agent name"
                    data-testid="agent-rename-input"
                    onkeydown={(e) => {
                      if (e.key === 'Enter') finishRename(true);
                      else if (e.key === 'Escape') finishRename(false);
                    }}
                    onblur={() => finishRename(true)}
                  />
                {:else}
                  <span class="agent-panel__name" data-part="name" title={a.name}>{a.name}</span>
                {/if}
                <span class="agent-panel__meta" data-part="meta" title={a.relayLabel}>{a.relayLabel}</span>
                <span class="agent-panel__meta" data-testid="agent-connected">{a.conn.lastConnectedAt ? `Connected ${relativeTime(a.conn.lastConnectedAt, now)}` : 'Never connected'}</span>
                {#if a.inUseElsewhere && !a.state}<span class="agent-panel__meta" data-testid="mcp-in-use">in use in another tab</span>{/if}
              </div>
              {#if a.state}
                <span class="agent-panel__dot agent-panel__dot--{a.state.status}" data-part="dot" aria-hidden="true"></span>
                <span class="sr-only" data-testid="mcp-status">{STATUS[a.state.status]}</span>
              {/if}
              <div class="agent-panel__actions" data-part="actions">
                {#if a.state}
                  <Button size="sm" variant="ghost" onclick={() => onDisconnect(a.conn.id)} data-testid="mcp-disconnect">Disconnect</Button>
                {:else}
                  <Button size="sm" variant="secondary" disabled={a.inUseElsewhere || relayMissing(a)} onclick={() => onConnect(a.conn.id)} data-testid="mcp-library-connect">Connect</Button>
                {/if}
                <ActionMenu actions={agentActions(a)} label={a.name} title="Agent actions" testid="agent-menu" {itemTestid} />
              </div>
            </div>
            {#if ctx && a.state}<p class="agent-panel__meta" data-testid="agent-last">{ctx.lastActivity(a.conn.id)}</p>{/if}
            {#if a.state}
              {#if viewShown(a, 'pair')}
                <PairingLoader pair={() => pair(a.conn.id)} {now} scope={() => rowEl(a.conn.id)} bind:view={liveView} bind:retry={liveRetry} />
              {/if}
              <McpConnection
                status={a.state.status}
                callerUrl={viewShown(a, 'direct') ? a.state.callerUrl : null}
                error={a.state.error}
                pairingView={viewShown(a, 'pair') ? (liveView ?? { data: null, error: null, minutes: 0 }) : null}
                onClosePair={() => (viewOpen = null)}
                onRetryPair={() => liveRetry?.()}
                onTakeover={() => onTakeover(a.conn.id)}
              />
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <Disclosure label="Connect an agent" bind:open={connectOpen} testid="mcp-connect-open">
      <form
        class="agent-panel__form"
        onsubmit={(e) => {
          e.preventDefault();
          onConnectNew(newName, newRelayId);
          newName = '';
        }}
      >
        <Input bind:value={newName} placeholder="Agent label (optional)" aria-label="Agent label" data-testid="mcp-agent-label" />
        {#if relays.length > 1}
          <Select bind:value={newRelayId} options={relays.map((r) => ({ value: r.id, label: r.label }))} aria-label="Relay" data-testid="mcp-agent-relay" />
        {/if}
        <Button size="sm" variant="secondary" type="submit" data-testid="mcp-connect-agent">Connect</Button>
      </form>
    </Disclosure>
    <ul class="agent-panel__list" data-part="relays">
      {#each relays as r (r.id)}
        {@const n = countOn(r.id)}
        <li class="agent-panel__row" data-part="relay" data-testid="relay-item">
          <div class="agent-panel__line">
            <div class="agent-panel__id">
              <span class="agent-panel__name" title={r.label}>{r.label}</span>
              <span class="agent-panel__meta agent-panel__url" title={r.url}>{r.url}</span>
              <span class="agent-panel__meta">{n} agent{n === 1 ? '' : 's'}</span>
            </div>
            {#if r.isDefault}<Tag status="active">Default</Tag>{/if}
            <ActionMenu actions={relayActions(r)} label={r.label} title="Relay actions" testid="relay-menu" />
          </div>
          {#if rowError?.id === r.id}<Notice kind="error" testid="relay-row-error">{rowError.text}</Notice>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  <Disclosure label={editing ? 'Edit relay' : 'Add a relay'} bind:open={relayFormOpen} testid="relay-add-open">
    {@render relayForm()}
  </Disclosure>
</div>
