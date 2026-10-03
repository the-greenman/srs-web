<!--
  EssayShell — the writing surface of the agent-supported essay editor (epic
  muDemocracy.org#224, story #225; srs-web#328). An essay is a container; each paragraph a
  record shown as a block. Presentation only: every read/write goes through srs-client via
  essay-document.ts, and the engine validates every move. Agent (MCP) writes arrive as a
  `documentRevision` bump and re-render the view. Fold state is localStorage; hidden
  paragraphs live in the document-state record.
-->
<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import type { AgentWriteGuard, SrsRepository } from "$lib/srs-client.js";
  import AttachmentGlyph from "$lib/components/AttachmentGlyph.svelte";
  import PinnedPane from "$lib/components/PinnedPane.svelte";
  import Block from "$lib/components/Block.svelte";
  import BlockStack from "$lib/components/BlockStack.svelte";
  import type { DropTarget } from "$lib/components/BlockStack.svelte";
  import CommentBadge from "$lib/components/CommentBadge.svelte";
  import CommentThread from "$lib/components/CommentThread.svelte";
  import DraftTray from "$lib/components/DraftTray.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import LayersPanel from "$lib/components/LayersPanel.svelte";
  import type { DragPayload, KeyMove } from "$lib/components/dnd.js";
  import Button from "$lib/components/Button.svelte";
  import InlineText from "$lib/components/InlineText.svelte";
  import { currentActor, onActorChange, saveLocalName } from "$lib/actor.js";
  import {
    addComment,
    addParagraph,
    listEssays,
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
    agentPanel?: Snippet;
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

  function createEssay() {
    void run(() => {
      essayId = newEssay(repo, "Untitled essay");
    });
  }
</script>

<!-- Esc leaves zoom, except while typing (Esc there cancels the field's own edit). -->
<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && zoomId && !(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) zoomId = null;
  }}
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
          }}
        >
          {#each essays as essay (essay.id)}<option value={essay.id}>{essay.title}</option>{/each}
        </select>
      {/if}
    </div>
    <div class="essay-shell__actions">
      {#if documentDirty}<span class="essay-shell__status" data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
      {#if saveMessage}<span class="essay-shell__status" role="status">{saveMessage}</span>{/if}
      <Button variant="ghost" active={commentMode} aria-pressed={commentMode} data-testid="comment-mode" onclick={() => (commentMode = !commentMode)}>Comments</Button>
      {#if onSave}<Button variant="mono" disabled={saving} onclick={onSave}>{saving ? "Saving…" : "Save"}</Button>{/if}
      <Button variant="mono" onclick={onExport}>Export</Button>
      {#if onOpenExplorer}<Button variant="ghost" onclick={onOpenExplorer}>Explorer</Button>{/if}
      <Button variant="ghost" onclick={onOpenAnother}>Open another</Button>
    </div>
  </header>

  {#if error}<p class="essay-shell__error" role="alert" data-testid="essay-error">{error}</p>{/if}

  {#if !model}
    <div class="essay-shell__empty">
      <p>No essay in this repository yet.</p>
      <Button variant="primary" onclick={createEssay}>New essay</Button>
      {#if agentPanel}<Panel title="Agents" persistKey="essay.agents">{@render agentPanel()}</Panel>{/if}
    </div>
  {:else}
    <div class="essay-shell__grid">
      <main class="essay-shell__page" aria-label={model.title}>
        <InlineText
          as="h1"
          value={model.title}
          label="Essay title"
          oncommit={(v) => v.trim() && run(() => setEssayTitle(repo, model!.essayId, v.trim()))}
        />
        {#if zoomId}
          <div class="essay-shell__zoombar"><Button variant="ghost" data-testid="zoom-exit" onclick={() => (zoomId = null)}>← Whole document</Button></div>
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
                <CommentBadge
                  count={(model!.comments[p.id] ?? []).length}
                  label={p.title || "untitled paragraph"}
                  open={showThread(p.id)}
                  onclick={() => openThread(p.id, !openThreads.has(p.id))}
                />
                {#each model!.attachments[p.id] ?? [] as a (a.id)}
                  <AttachmentGlyph
                    kind={a.neighbourType}
                    title={a.label}
                    text={a.text}
                    pinned={pinnedIds.includes(a.id)}
                    onpin={() => togglePin(a.id)}
                  />
                {/each}
              {/snippet}
              <Block
                id={p.id}
                title={p.title}
                body={p.body}
                hidden={hidden.has(p.id)}
                inherited={inherited.has(p.id)}
                {handle}
                {margin}
                onzoom={() => (zoomId = p.id)}
                onbody={(v) => run(() => setBody(repo, p.id, v))}
                ontitle={(v) => run(() => setTitle(repo, p.id, v))}
                onhide={(h) => run(() => setHidden(repo, model!, p.id, h))}
                onnew={() => run(() => newParagraphAfter(p.id))}
                onindent={(d) => onKey(p.id, d === 1 ? "in" : "out")}
                onmove={(dir) => onKey(p.id, dir)}
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
      </main>
      <aside class="panel-rail" aria-label="Panels">
        <Panel title="Layers" persistKey="essay.layers">
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
        <Panel title="Draft" aside={draftItems.length} persistKey="essay.draft">
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
        {#if agentPanel}
          <Panel title="Agents" persistKey="essay.agents">{@render agentPanel()}</Panel>
        {/if}
      </aside>
    </div>
  {/if}
</div>
