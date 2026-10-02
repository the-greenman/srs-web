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
  import type { SrsRepository } from "$lib/srs-client.js";
  import Block from "$lib/components/Block.svelte";
  import BlockStack from "$lib/components/BlockStack.svelte";
  import type { DropTarget } from "$lib/components/BlockStack.svelte";
  import DraftTray from "$lib/components/DraftTray.svelte";
  import LayersPanel from "$lib/components/LayersPanel.svelte";
  import type { DragPayload, KeyMove } from "$lib/components/dnd.js";
  import Button from "$lib/components/Button.svelte";
  import {
    addParagraph,
    listEssays,
    loadEssay,
    moveEntry,
    newEssay,
    setBody,
    shiftEntry,
    setHidden,
    setTitle,
    transfer,
  } from "./essay-document.js";
  import { essayWriteGuard } from "./essay-document.js";
  import type { AgentWriteGuard, EssayModel, EssaySummary } from "./essay-document.js";
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
    onAgentWriteGuard?: (guard: AgentWriteGuard | null) => void;
  } = $props();

  let essays = $state<EssaySummary[]>([]);
  let essayId = $state<string | null>(null);
  let model = $state<EssayModel | null>(null);
  let error = $state<string | null>(null);

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
    onAgentWriteGuard?.(model ? essayWriteGuard(model) : null);
  }

  onDestroy(() => onAgentWriteGuard?.(null));

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

  const hidden = $derived(new Set(model?.hidden ?? []));
  const inherited = $derived(hiddenByAncestor(model?.entries ?? [], hidden));
  const items = $derived((model?.entries ?? []).map((e) => ({ id: e.instanceId, depth: e.depth })));
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
    </div>
  {:else}
    <div class="essay-shell__grid">
      <main class="essay-shell__page" aria-label={model.title}>
        <h1 class="essay-shell__title">{model.title}</h1>
        {#if items.length === 0}
          <p class="essay-shell__hint">No paragraphs yet.</p>
          <Button variant="mono" data-testid="first-paragraph" onclick={() => run(() => `body:${addParagraph(repo, model!)}`)}>Add first paragraph</Button>
        {/if}
        <BlockStack {items} source="essay" label="Essay paragraphs" candrop={essayDrop} ondrop={(p, t) => onDrop("essay", p, t)}>
          {#snippet row(item, handle)}
            {@const p = model!.paragraphs[item.id]}
            {#if p}
              <Block
                id={p.id}
                title={p.title}
                body={p.body}
                hidden={hidden.has(p.id)}
                inherited={inherited.has(p.id)}
                {handle}
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
            {/if}
          {/snippet}
        </BlockStack>
      </main>
      <aside class="essay-shell__side">
        <LayersPanel
          {layers}
          candrop={essayDrop}
          ondrop={(p, t) => onDrop("essay", p, t)}
          onhide={(id, h) => run(() => setHidden(repo, model!, id, h))}
          onfold={toggleFold}
          onselect={(id) => document.querySelector<HTMLElement>(`[data-focus-key="body:${id}"]`)?.focus()}
          onkey={onKey}
        />
        <DraftTray
          items={draftItems}
          available={!!model.draftContainerId}
          unavailableReason="This essay has no draft area."
          candrop={draftDrop}
          ondrop={(p, t) => onDrop("draft", p, t)}
          onputback={putBack}
        />
      </aside>
    </div>
  {/if}
</div>
