<!--
  EssayShell — the writing surface of the agent-supported essay editor (epic
  muDemocracy.org#224, story #225; srs-web#328). An essay is a container; each paragraph a
  record shown as a block. Presentation only: every read/write goes through srs-client via
  essay-document.ts, and the engine validates every move. Agent (MCP) writes arrive as a
  `documentRevision` bump and re-render the view. Fold state is localStorage; hidden
  paragraphs live in the document-state record.
-->
<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import type { AgentWriteGuard, SrsRepository } from "$lib/srs-client.js";
  import AgentFeed from "$lib/components/AgentFeed.svelte";
  import { ago, verb } from "$lib/agent-activity.js";
  import type { AgentPanelCtx, AgentStatus } from "$lib/agent-activity.js";
  import PinnedPane from "$lib/components/PinnedPane.svelte";
  import ParagraphMargin from "$lib/components/ParagraphMargin.svelte";
  import Block from "$lib/components/Block.svelte";
  import BlockStack from "$lib/components/BlockStack.svelte";
  import type { DropTarget } from "$lib/components/BlockStack.svelte";
  import CommentThread from "$lib/components/CommentThread.svelte";
  import DraftTray from "$lib/components/DraftTray.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import LayersPanel from "$lib/components/LayersPanel.svelte";
  import type { DragPayload, KeyMove } from "$lib/components/dnd.js";
  import Button from "$lib/components/Button.svelte";
  import InlineText from "$lib/components/InlineText.svelte";
  import MarkdownHelp from "$lib/components/MarkdownHelp.svelte";
  import ActionMenu from "$lib/components/ActionMenu.svelte";
  import { NARROW } from "$lib/components/narrow.js";
  import { currentActor, onActorChange, saveLocalName } from "$lib/actor.js";
  import {
    addComment,
    addParagraph,
    copyEssay,
    listEssays,
    makeLocalCopy,
    loadEssay,
    moveEntry,
    newEssay,
    setBody,
    setEssayTitle,
    shiftEntry,
    setHidden,
    setTitle,
    transfer,
  } from "./essay-document.js";
  import { essayWriteGuard } from "./essay-document.js";
  import type { EssayModel, EssaySummary } from "./essay-document.js";
  import { formatAddress, parseAddress } from "./address.js";
  import { headerActions } from "./header-actions.js";
  import { annotationsFor, loadVariant, saveVariant } from "./annotations.js";
  import type { Annotation } from "./annotations.js";
  import { hiddenByAncestor, outsideRun, visibleEntries } from "./essay-model.js";

  let {
    repo,
    repoName,
    onExport,
    onSave,
    saving = false,
    saveMessage = null,
    documentDirty = false,
    documentRevision = 0,
    onOpenAnother,
    onOpenExplorer,
    onAgentWriteGuard,
    agentPanel,
    agentStatus,
  }: {
    // Common EditorShellProps this shell does not use (kept so every shell takes one prop set).
    documentProvider?: string;
    onExportSrsj?: () => void;
    readOnlyReason?: string | null;
    repo: SrsRepository;
    repoName: string;
    onExport: () => void;
    onSave?: () => void;
    saving?: boolean;
    saveMessage?: string | null;
    documentDirty?: boolean;
    /** Bumped by App on every in-place mutation, including MCP/agent writes. */
    documentRevision?: number;
    onOpenAnother: () => void;
    onOpenExplorer?: () => void;
    onAgentWriteGuard?: (guard: AgentWriteGuard | null, replacing?: AgentWriteGuard) => void;
    agentPanel?: Snippet<[AgentPanelCtx?]>;
    /** Connected count, per-agent status and the agent write feed (App; registry.ts). */
    agentStatus?: AgentStatus;
  } = $props();

  let essays = $state<EssaySummary[]>([]);
  let essayId = $state<string | null>(null);
  let model = $state<EssayModel | null>(null);
  let error = $state<string | null>(null);
  /** Whether UI writes are attributed (login or saved name); follows actor changes. */
  let hasActor = $state(currentActor() !== null);
  onDestroy(onActorChange(() => (hasActor = currentActor() !== null)));

  const foldKey = (id: string) => `srs-web.essay-fold.${id}`;
  let folded = $state<Set<string>>(new Set());

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  function loadFolded(id: string) {
    try {
      folded = new Set(JSON.parse(localStorage.getItem(foldKey(id)) ?? "[]"));
    } catch {
      folded = new Set();
    }
  }

  let lastGuard: AgentWriteGuard | undefined;

  function reload(): void {
    try {
      essays = listEssays(repo);
      if (!essayId || !essays.some((e) => e.id === essayId)) {
        essayId = essays[0]?.id ?? null;
        if (essayId) loadFolded(essayId);
      }
      model = essayId ? loadEssay(repo, essayId) : null;
      error = null;
    } catch (e) {
      error = msg(e);
    }
    const prev = lastGuard;
    lastGuard = model ? essayWriteGuard(model) : undefined;
    onAgentWriteGuard?.(lastGuard ?? null, lastGuard ? undefined : prev);
  }

  onDestroy(() => onAgentWriteGuard?.(null, lastGuard));

  // Re-render whenever the repository is mutated in place (own edits and MCP writes alike).
  $effect(() => {
    documentRevision;
    untrack(reload);
  });

  /**
   * Run a mutation and keep keyboard focus where the writer was. No reload here: the write
   * bumps `documentRevision` (observeWrites, a microtask queued before `tick()` flushes), and
   * the effect above is the one reload. Reloading here too doubled the cost of every commit.
   */
  async function run(fn: () => string | void): Promise<void> {
    const key = (document.activeElement as HTMLElement | null)?.dataset?.focusKey;
    try {
      const focusKey = fn() ?? key;
      await tick();
      if (focusKey) document.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus();
    } catch (e) {
      error = msg(e);
    }
  }

  /** Pinned attachment ids (relation ids). Derived against the model, so a removed one drops out. */
  let pinnedIds = $state<string[]>([]);
  const togglePin = (id: string) =>
    (pinnedIds = pinnedIds.includes(id) ? pinnedIds.filter((x) => x !== id) : [...pinnedIds, id]);
  const pinned = $derived(
    Object.values(model?.attachments ?? {})
      .flat()
      .filter((a) => pinnedIds.includes(a.id))
      .map((a) => ({ id: a.id, kind: `${a.neighbourType} · ${a.relationType}`, title: a.label, text: a.text })),
  );

  let variant = $state(loadVariant());
  const toggleVariant = () => saveVariant((variant = variant === "compact" ? "expanded" : "compact"));
  /** Margin clicks: the one kind -> action mapping (the model says what, the margin how it looks). */
  function openAnnotation(a: Annotation, paragraphId: string) {
    if (a.kind === "comments") openThread(paragraphId, !openThreads.has(paragraphId));
    else if (a.kind === "attachment") togglePin(a.key);
    else if (a.kind === "shared") void run(() => makeLocalCopy(repo, model!, paragraphId));
    else if (a.targetId)
      document.querySelector<HTMLElement>(`[data-focus-key="body:${a.targetId}"]`)?.focus();
  }

  const hidden = $derived(new Set(model?.hidden ?? []));
  const inherited = $derived(hiddenByAncestor(model?.entries ?? [], hidden));
  /** UI-only comment state: which threads are open, show-all mode, and the zoomed paragraph. */
  let openThreads = $state<Set<string>>(new Set());
  let commentMode = $state(false);
  let zoomId = $state<string | null>(null);
  const showThread = (id: string) => commentMode || zoomId === id || openThreads.has(id);
  const openThread = (id: string, on: boolean) => {
    const next = new Set(openThreads);
    if (on) next.add(id);
    else next.delete(id);
    openThreads = next;
  };
  const allItems = $derived((model?.entries ?? []).map((e) => ({ id: e.instanceId, depth: e.depth })));
  /** Zoomed: the paragraph and its subtree (the entries after it that are deeper). */
  const items = $derived.by(() => {
    const at = zoomId ? allItems.findIndex((i) => i.id === zoomId) : -1;
    if (at < 0) return allItems;
    const rest = allItems.slice(at + 1);
    const end = rest.findIndex((i) => i.depth <= allItems[at].depth);
    return [allItems[at], ...(end < 0 ? rest : rest.slice(0, end))];
  });
  const essayDrop = (drag: string, target: string) => outsideRun(model?.entries ?? [], drag, target);
  const draftDrop = (drag: string, target: string) => outsideRun(model?.draftEntries ?? [], drag, target);
  const label = (id: string) => model?.paragraphs[id]?.title || model?.paragraphs[id]?.body.slice(0, 40) || "untitled";
  const layers = $derived(
    visibleEntries(model?.entries ?? [], folded).map((e) => ({
      id: e.instanceId,
      depth: e.depth,
      label: label(e.instanceId),
      hidden: hidden.has(e.instanceId),
      inherited: inherited.has(e.instanceId),
      hasChildren: e.hasChildren,
      folded: folded.has(e.instanceId),
    })),
  );
  const draftItems = $derived(
    (model?.draftEntries ?? []).map((e) => ({ id: e.instanceId, label: label(e.instanceId) })),
  );

  function comment(paragraphId: string, text: string, name?: string) {
    if (name) {
      if (!saveLocalName(name)) return void (error = "Could not remember your name in this browser.");
    }
    openThread(paragraphId, true);
    void run(() => addComment(repo, paragraphId, text));
  }

  /** Focus a paragraph (agent feed, deep link); leave zoom first when it is hidden by it. */
  async function focusParagraph(id: string, key = "body"): Promise<void> {
    if (zoomId && !items.some((i) => i.id === id)) setZoom(null);
    await tick();
    const el = document.querySelector<HTMLElement>(`[data-focus-key="${key}:${id}"]`);
    el?.focus();
    el?.scrollIntoView?.({ block: "center" });
  }

  /** Arrow past the first/last line: the nearest paragraph with a body editor (not hidden), in zoomed order. */
  function navigate(id: string, dir: "prev" | "next") {
    const at = items.findIndex((i) => i.id === id);
    const rest = dir === "next" ? items.slice(at + 1) : items.slice(0, at).reverse();
    const to = rest.find((i) => !hidden.has(i.id) && !inherited.has(i.id));
    if (!to) return;
    void focusParagraph(to.id).then(tick).then(() => {
      const body = document.querySelector<HTMLElement>(`[data-focus-key="body:${to.id}"]`);
      if (!body) return;
      // Block's edit effect leaves the caret at the end; going down wants the start.
      if (dir === "next") getSelection()?.collapse(body.firstChild ?? body, 0);
    });
  }

  /**
   * Addresses (address.ts): zoom and essay switches push the hash; applying an address from the
   * URL never pushes (the hash already equals the state, so `push` is a no-op).
   */
  let notice = $state<string | null>(null);
  let linkFallback = $state<string | null>(null);
  const push = () => {
    const h = formatAddress({ essayId: essayId ?? undefined, zoomId: zoomId ?? undefined });
    if (h !== (location.hash === "#" ? "" : location.hash)) history.pushState(null, "", h || location.pathname + location.search);
  };
  function setZoom(id: string | null) {
    zoomId = id;
    push();
  }
  function applyAddress() {
    const a = parseAddress(location.hash);
    notice = null;
    if (a.essayId && a.essayId !== essayId) {
      if (essays.some((e) => e.id === a.essayId)) {
        essayId = a.essayId;
        loadFolded(essayId);
        reload();
      } else notice = "That link points to an essay that is not here; showing the current one.";
    }
    const want = a.zoomId ?? a.paragraphId;
    if (want && !allItems.some((i) => i.id === want)) notice ??= "That paragraph is no longer here; showing the whole document.";
    zoomId = a.zoomId && allItems.some((i) => i.id === a.zoomId) ? a.zoomId : null;
    if (a.paragraphId && !zoomId && allItems.some((i) => i.id === a.paragraphId)) void focusParagraph(a.paragraphId, "handle");
  }
  onMount(() => applyAddress());

  async function copyLink(id: string, zoom = false) {
    const url = location.origin + location.pathname + location.search +
      formatAddress({ essayId: essayId ?? undefined, [zoom ? "zoomId" : "paragraphId"]: id });
    try {
      await navigator.clipboard.writeText(url);
      linkFallback = null;
      notice = "Link copied";
    } catch {
      linkFallback = url;
    }
  }

  /** One clock for every relative time in the Agents panel. */
  let now = $state(Date.now());
  const clock = setInterval(() => (now = Date.now()), 15000);
  onDestroy(() => clearInterval(clock));
  const paragraphLabel = (id: string) => (model?.paragraphs[id] ? label(id) : undefined);
  const panelCtx: AgentPanelCtx = {
    lastActivity(agentId) {
      const w = agentStatus?.writes.find((x) => x.agentId === agentId);
      if (!w) return "No activity yet";
      const l = w.instanceId ? paragraphLabel(w.instanceId) : undefined;
      return `${l === undefined ? verb(w) : `${verb(w)} ¶ ${l}`} · ${ago(w.at, now)}`;
    },
  };

  // Live highlight (CSS only, agent-activity.css): paragraphs an agent just wrote flash once.
  // Only writes newer than the last one handled, so a re-render or a mount never replays old ones.
  let liveSeen = Date.now();
  const liveTimers = new Set<ReturnType<typeof setTimeout>>();
  onDestroy(() => liveTimers.forEach(clearTimeout));
  $effect(() => {
    const fresh = (agentStatus?.writes ?? []).filter((w) => w.at > liveSeen && w.instanceId);
    if (!fresh.length) return;
    liveSeen = Math.max(...fresh.map((w) => w.at));
    // The paragraph re-renders on the revision bump that follows the write; flash after it.
    const t = setTimeout(() => {
      liveTimers.delete(t);
      for (const w of fresh) {
        const el = document.querySelector<HTMLElement>(`.block[data-block-id="${w.instanceId}"]`);
        if (!el) continue;
        el.classList.remove("is-live");
        void el.offsetWidth; // restart the animation on a repeat write
        el.classList.add("is-live");
        const off = setTimeout(() => (liveTimers.delete(off), el.classList.remove("is-live")), 2600);
        liveTimers.add(off);
      }
    }, 60);
    liveTimers.add(t);
  });

  const newParagraphAfter = (id: string): string =>
    `body:${addParagraph(repo, model!, { id, zone: "after" })}`;

  const SHIFT = { up: "up", down: "down", in: "indent", out: "outdent" } as const;
  function onKey(id: string, m: KeyMove) {
    void run(() => shiftEntry(repo, model!.containerId, id, SHIFT[m]));
  }

  function onDrop(to: "essay" | "draft", p: DragPayload, t: DropTarget) {
    const m = model;
    if (!m) return;
    const toId = to === "essay" ? m.containerId : m.draftContainerId;
    const fromId = p.from === "essay" ? m.containerId : m.draftContainerId;
    if (!toId || !fromId) return;
    void run(() => {
      if (p.from === to) moveEntry(repo, toId, p.id, t);
      else transfer(repo, fromId, toId, p.id, t);
    });
  }

  function putBack(id: string) {
    const m = model;
    if (!m?.draftContainerId) return;
    void run(() => transfer(repo, m.draftContainerId as string, m.containerId, id));
  }

  function toggleFold(id: string, on: boolean) {
    const next = new Set(folded);
    if (on) next.add(id);
    else next.delete(id);
    folded = next;
    try {
      if (essayId) localStorage.setItem(foldKey(essayId), JSON.stringify([...next]));
    } catch {}
  }

  /** New / copied document: select it (the revision-bump reload loads it) and take the same address path as switching. */
  function openNew(make: () => string) {
    void run(() => {
      essayId = make();
      zoomId = null;
      loadFolded(essayId);
    });
    push();
  }
  const createEssay = () => openNew(() => newEssay(repo, "Untitled essay"));
  const copyDocument = () => openNew(() => copyEssay(repo, model!));
  let helpOpen = $state(false);
  const barActions = $derived(
    headerActions(
      {
        onnew: createEssay,
        oncopy: model ? copyDocument : undefined,
        onhelp: () => (helpOpen = !helpOpen),
        onvariant: toggleVariant,
        oncomments: () => (commentMode = !commentMode),
        onsave: onSave,
        onexport: onExport,
        onexplorer: onOpenExplorer,
        onopenanother: onOpenAnother,
      },
      { expanded: variant === "expanded", commentMode, saving },
    ),
  );
</script>

<!-- Esc leaves zoom, except while typing (Esc there cancels the field's own edit). -->
<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && zoomId && !(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) setZoom(null);
  }}
  onpopstate={applyAddress}
/>

<div class="essay-shell">
  <header class="essay-shell__bar">
    <div class="essay-shell__heading">
      <span class="eyebrow">{repoName}</span>
      {#if essays.length > 1}
        <select
          aria-label="Essay"
          value={essayId}
          onchange={(e) => {
            essayId = e.currentTarget.value;
            zoomId = null;
            loadFolded(essayId);
            reload();
            push();
          }}
        >
          {#each essays as essay (essay.id)}<option value={essay.id}>{essay.title}</option>{/each}
        </select>
      {/if}
    </div>
    <div class="essay-shell__actions">
      {#if documentDirty}<span class="essay-shell__status" data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
      {#if saveMessage}<span class="essay-shell__status" role="status">{saveMessage}</span>{/if}
      <!-- The one header action list, rendered as buttons here and as the overflow menu on narrow screens (CSS picks one). -->
      <div class="essay-shell__buttons">
        {#each barActions as a (a.id)}
          {#if a.id === "help"}
            <button type="button" class="md-help__btn" data-md-help-trigger aria-label={a.label} aria-expanded={helpOpen} title={a.label} onclick={a.run}>?</button>
          {:else}
            <Button variant={a.variant} active={a.pressed} aria-pressed={a.pressed} data-testid={a.testid} disabled={!a.enabled} onclick={a.run}>{a.label}</Button>
          {/if}
        {/each}
      </div>
      <ActionMenu class="essay-shell__overflow action-menu--end" testid="header-menu" title="Document actions" label={model?.title ?? repoName} actions={barActions} />
    </div>
    <MarkdownHelp open={helpOpen} onclose={() => (helpOpen = false)} />
  </header>

  {#if notice}
    <p class="essay-shell__status" role="status" data-testid="address-notice">
      {notice} <button type="button" class="block__action" aria-label="Dismiss" onclick={() => (notice = null)}>×</button>
    </p>
  {/if}
  {#if linkFallback}
    <p class="essay-shell__status" role="status">
      Copy this link: <input readonly aria-label="Link" data-testid="link-fallback" value={linkFallback} onfocus={(e) => e.currentTarget.select()} />
    </p>
  {/if}
  {#if error}<p class="essay-shell__error" role="alert" data-testid="essay-error">{error}</p>{/if}

  {#if !model}
    <div class="essay-shell__empty">
      <p>No essay in this repository yet.</p>
      <Button variant="primary" onclick={createEssay}>New essay</Button>
      {#if agentPanel}{@render agents()}{/if}
    </div>
  {:else}
    <div class="essay-shell__grid">
      <main class="essay-shell__page" aria-label={model.title}>
        <InlineText
          as="h1"
          value={model.title}
          label="Essay title"
          oncommit={(v) => v.trim() && run(() => setEssayTitle(repo, model!, v.trim()))}
        />
        {#if zoomId}
          <div class="essay-shell__zoombar">
            <Button variant="ghost" data-testid="zoom-exit" aria-label="Whole document" onclick={() => setZoom(null)}>←<span class="essay-shell__label"> Whole document</span></Button>
            <Button variant="ghost" data-testid="zoom-copy-link" aria-label="Copy link" onclick={() => copyLink(zoomId!, true)}><span class="essay-shell__narrow-icon" aria-hidden="true">🔗</span><span class="essay-shell__label">Copy link</span></Button>
          </div>
        {/if}
        {#if items.length === 0}
          <p class="essay-shell__hint">No paragraphs yet.</p>
          <Button variant="mono" data-testid="first-paragraph" onclick={() => run(() => `body:${addParagraph(repo, model!)}`)}>Add first paragraph</Button>
        {/if}
        <BlockStack {items} source="essay" label="Essay paragraphs" candrop={essayDrop} ondrop={(p, t) => onDrop("essay", p, t)}>
          {#snippet row(item, handle)}
            {@const p = model!.paragraphs[item.id]}
            {#if p}
              {#snippet margin()}
                <ParagraphMargin
                  annotations={annotationsFor(model!, p.id)}
                  {variant}
                  active={[...pinnedIds, ...(showThread(p.id) ? [`comments:${p.id}`] : [])]}
                  onopen={(a) => openAnnotation(a, p.id)}
                />
              {/snippet}
              <Block
                id={p.id}
                title={p.title}
                body={p.body}
                hidden={hidden.has(p.id)}
                inherited={inherited.has(p.id)}
                {handle}
                {margin}
                onzoom={() => setZoom(p.id)}
                oncopylink={() => copyLink(p.id)}
                onbody={(v) => run(() => setBody(repo, p.id, v))}
                ontitle={(v) => run(() => setTitle(repo, p.id, v))}
                onhide={(h) => run(() => setHidden(repo, model!, p.id, h))}
                onnew={() => run(() => newParagraphAfter(p.id))}
                onindent={(d) => onKey(p.id, d === 1 ? "in" : "out")}
                onmove={(dir) => onKey(p.id, dir)}
                onnavigate={(dir) => navigate(p.id, dir)}
                onpull={model!.draftContainerId
                  ? () => onDrop("draft", { id: p.id, from: "essay" }, { id: null, zone: "after" })
                  : undefined}
              />
              {#if showThread(p.id)}
                <CommentThread comments={model!.comments[p.id] ?? []} needsName={!hasActor} onadd={(t, n) => comment(p.id, t, n)} />
              {/if}
            {/if}
          {/snippet}
        </BlockStack>
        {#if items.length > 0 && !zoomId}
          <Button variant="mono" class="essay-shell__add" data-testid="add-paragraph" onclick={() => run(() => `body:${addParagraph(repo, model!)}`)}>Add paragraph</Button>
        {/if}
      </main>
      <aside class="panel-rail" aria-label="Panels">
        <Panel title="Layers" persistKey="essay.layers" collapseWhen={NARROW}>
          <LayersPanel
            {layers}
            candrop={essayDrop}
            ondrop={(p, t) => onDrop("essay", p, t)}
            onhide={(id, h) => run(() => setHidden(repo, model!, id, h))}
            onfold={toggleFold}
            onselect={(id) => document.querySelector<HTMLElement>(`[data-focus-key="body:${id}"]`)?.focus()}
            onkey={onKey}
          />
        </Panel>
        <Panel title="Draft" aside={draftItems.length} persistKey="essay.draft" collapseWhen={NARROW}>
          <DraftTray
            items={draftItems}
            available={!!model.draftContainerId}
            unavailableReason="This essay has no draft area."
            candrop={draftDrop}
            ondrop={(p, t) => onDrop("draft", p, t)}
            onputback={putBack}
          />
        </Panel>
        <PinnedPane items={pinned} onunpin={togglePin} />
        {#if agentPanel}{@render agents()}{/if}
      </aside>
    </div>
  {/if}
</div>

{#snippet agents()}
  <Panel title="Agents" aside={agentStatus ? `${agentStatus.connected}/${agentStatus.total}` : undefined} persistKey="essay.agents" collapseWhen={NARROW}>
    {#if agentStatus}
      <AgentFeed
        {now}
        status={agentStatus}
        {paragraphLabel}
        onselect={focusParagraph}
      />
    {/if}
    {@render agentPanel?.(panelCtx)}
  </Panel>
{/snippet}
