<!--
  EssayShell — the writing surface of the agent-supported essay editor (epic
  muDemocracy.org#224, story #225; srs-web#328). An essay is a container; each paragraph a
  record shown as a block. Presentation only: every read/write goes through srs-client via
  essay-document.ts, and the engine validates every move. Agent (MCP) writes arrive as a
  `documentRevision` bump and re-render the view. Fold state is localStorage; hidden
  paragraphs live in the document-state record.
-->
<script lang="ts">
  import { tick, untrack } from "svelte";
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
    setDepth,
    setHidden,
    setTitle,
    transfer,
  } from "./essay-document.js";
  import type { EssayModel, EssaySummary } from "./essay-document.js";
  import {
    indentDepth,
    insertPlan,
    movePlan,
    parentIds,
    stepPlan,
    visibleEntries,
  } from "./essay-model.js";

  let {
    repo,
    repoName,
    onExport,
    onSave,
    saving = false,
    saveMessage = null,
    documentDirty = false,
    documentRevision = 0,
    onDocumentMutation = () => {},
    onOpenAnother,
    onOpenExplorer,
  }: {
    repo: SrsRepository;
    repoName: string;
    onExport: () => void;
    onSave?: () => void;
    saving?: boolean;
    saveMessage?: string | null;
    documentDirty?: boolean;
    /** Bumped by App on every in-place mutation, including MCP/agent writes. */
    documentRevision?: number;
    onDocumentMutation?: () => void;
    onOpenAnother: () => void;
    onOpenExplorer?: () => void;
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
  }

  // Re-render whenever the repository is mutated in place (own edits and MCP writes alike).
  $effect(() => {
    documentRevision;
    untrack(reload);
  });

  /** Run a mutation, tell App, reload, and keep keyboard focus where the writer was. */
  async function run(fn: () => string | void): Promise<void> {
    const key = (document.activeElement as HTMLElement | null)?.dataset?.focusKey;
    try {
      const focusKey = fn() ?? key;
      onDocumentMutation();
      reload();
      await tick();
      if (focusKey) document.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus();
    } catch (e) {
      error = msg(e);
    }
  }

  const hidden = $derived(new Set(model?.hidden ?? []));
  const items = $derived((model?.entries ?? []).map((e) => ({ id: e.instanceId, depth: e.depth ?? 0 })));
  const parents = $derived(parentIds(model?.entries ?? []));
  const label = (id: string) => model?.paragraphs[id]?.title || model?.paragraphs[id]?.body.slice(0, 40) || "untitled";
  const layers = $derived(
    visibleEntries(model?.entries ?? [], folded).map((e) => ({
      id: e.instanceId,
      depth: e.depth ?? 0,
      label: label(e.instanceId),
      hidden: hidden.has(e.instanceId),
      hasChildren: parents.has(e.instanceId),
      folded: folded.has(e.instanceId),
    })),
  );
  const draftItems = $derived(
    (model?.draftEntries ?? []).map((e) => ({ id: e.instanceId, label: label(e.instanceId) })),
  );

  function newParagraphAfter(id: string): string {
    // "after current at the same depth": past the current block's run
    const plan = insertPlan(model!.entries, id, "after");
    return `body:${addParagraph(repo, model!, plan ?? undefined)}`;
  }

  function onKey(id: string, m: KeyMove) {
    const entries = model?.entries ?? [];
    void run(() => {
      if (m === "up" || m === "down") {
        const p = stepPlan(entries, id, m);
        if (p) moveEntry(repo, model!, model!.containerId, id, p);
      } else {
        const d = indentDepth(entries, id, m === "in" ? 1 : -1);
        if (d !== null) setDepth(repo, model!.containerId, id, d);
      }
    });
  }

  function onDrop(to: "essay" | "draft", p: DragPayload, t: DropTarget) {
    const m = model;
    if (!m) return;
    const toId = to === "essay" ? m.containerId : m.draftContainerId;
    const fromId = p.from === "essay" ? m.containerId : m.draftContainerId;
    if (!toId || !fromId) return;
    const dest = to === "essay" ? m.entries : m.draftEntries;
    const nest = to === "essay";
    void run(() => {
      if (p.from === to) {
        const plan = movePlan(dest, p.id, t.id, t.zone);
        if (plan) moveEntry(repo, m, toId, p.id, nest ? plan : { ...plan, depth: 0 });
      } else {
        const plan = insertPlan(dest, t.id, t.zone);
        if (plan) transfer(repo, m, fromId, toId, p.id, nest ? plan : { ...plan, depth: 0 });
      }
    });
  }

  function putBack(id: string) {
    const m = model;
    if (!m?.draftContainerId) return;
    void run(() => {
      transfer(repo, m, m.draftContainerId as string, m.containerId, id, { position: m.entries.length, depth: 0 });
    });
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
        <BlockStack {items} source="essay" label="Essay paragraphs" ondrop={(p, t) => onDrop("essay", p, t)}>
          {#snippet row(item, handle)}
            {@const p = model!.paragraphs[item.id]}
            {#if p}
              <Block
                id={p.id}
                title={p.title}
                body={p.body}
                hidden={hidden.has(p.id)}
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
          ondrop={(p, t) => onDrop("essay", p, t)}
          onhide={(id, h) => run(() => setHidden(repo, model!, id, h))}
          onfold={toggleFold}
          onselect={(id) => document.querySelector<HTMLElement>(`[data-focus-key="body:${id}"]`)?.focus()}
          onkey={onKey}
        />
        <DraftTray
          items={draftItems}
          available={!!model.draftContainerId}
          unavailableReason="This essay has no draft area (creating one needs srs-rust#1133)."
          ondrop={(p, t) => onDrop("draft", p, t)}
          onputback={putBack}
        />
      </aside>
    </div>
  {/if}
</div>
