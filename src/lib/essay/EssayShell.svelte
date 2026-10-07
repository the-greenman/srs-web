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
  import { copyText } from "$lib/clipboard.js";
  import { repositoryId } from "$lib/srs-client.js";
  import type { AgentWriteGuard, SrsRepository } from "$lib/srs-client.js";
  import AgentFeed from "$lib/components/AgentFeed.svelte";
  import AgentPresence from "$lib/components/AgentPresence.svelte";
  import { verb } from "$lib/agent-activity.js";
  import { relativeTime } from "$lib/relative-time.js";
  import type { AgentPanelCtx, AgentStatus } from "$lib/agent-activity.js";
  import PinnedPane from "$lib/components/PinnedPane.svelte";
  import AnnotationMargin from "$lib/components/AnnotationMargin.svelte";
  import Block from "$lib/components/Block.svelte";
  import BlockStack from "$lib/components/BlockStack.svelte";
  import type { DropTarget } from "$lib/components/BlockStack.svelte";
  import CommentThread from "$lib/components/CommentThread.svelte";
  import BinTray from "$lib/components/BinTray.svelte";
  import ReferencesTray from "$lib/components/ReferencesTray.svelte";
  import DraftTray from "$lib/components/DraftTray.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import LayersPanel from "$lib/components/LayersPanel.svelte";
  import type { DragPayload, KeyMove } from "$lib/components/dnd.js";
  import Button from "$lib/components/Button.svelte";
  import InlineText from "$lib/components/InlineText.svelte";
  import MarkdownText from "$lib/components/MarkdownText.svelte";
  import MarkdownHelp from "$lib/components/MarkdownHelp.svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import InspectorTrigger from "$lib/components/InspectorTrigger.svelte";
  import Main from "$lib/components/Main.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import LinkIcon from "@lucide/svelte/icons/link";
  import Notice from "$lib/components/Notice.svelte";
  import { notify } from "$lib/notices.svelte.js";
  import { takeFiles } from "$lib/components/attach-check.js";
  import type { AttachFile } from "$lib/components/attach-check.js";
  import { downloadAttachment } from "$lib/attachment-download.js";
  import Input from "$lib/components/Input.svelte";
  import Select from "$lib/components/Select.svelte";
  import { NARROW } from "$lib/breakpoints";
  import { currentActor, onActorChange, saveLocalName } from "$lib/actor.js";
  import {
    addParagraph,
    attachFiles,
    binParagraph,
    copyEssay,
    deleteForever,
    listEssays,
    makeLocalCopy,
    loadEssay,
    moveEntry,
    newEssay,
    setBody,
    setEssayPurpose,
    setEssayTitle,
    agentHandoff,
    shiftEntry,
    removeAttachment,
    removeReference,
    setHidden,
    setTitle,
    transfer,
  } from "./essay-document.js";
  import { essayMarkdown, essayReferences, essaySnapshot, essayWriteGuard } from "./essay-document.js";
  import { downloadText, triggerDownload } from "$lib/governance/decision-export-utils.js";
  import type { EssayModel, EssaySummary } from "./essay-document.js";
  import { formatAddress, parseAddress } from "./address.js";
  import { HEADER_GROUPS, headerActions } from "./header-actions.js";
  import { canShow, isShown, setOpen, summary, toggle, toggleAll } from "./thread-visibility.js";
  import { addComment } from "$lib/comments.js";
  import { annotationsFor } from "$lib/annotations.js";
  import type { Annotation } from "$lib/annotations.js";
  import { essaySource } from "./annotation-source.js";
  import { hiddenByAncestor, outsideRun, visibleEntries } from "./essay-model.js";

  let {
    repo,
    repoName,
    readOnlyReason = null,
    onExport,
    onSave,
    saving = false,
    documentDirty = false,
    documentRevision = 0,
    onOpenAnother,
    onOpenExplorer,
    onAgentWriteGuard,
    agentPanel,
    agentStatus,
    onOpenPackages,
  }: {
    // Common EditorShellProps this shell does not use (kept so every shell takes one prop set).
    documentProvider?: string;
    onOpenAgents?: () => void;
    onOpenPackages?: () => void;
    onExportSrsj?: () => void;
    /** Set when the repository was opened read-only: no repair writes on load. */
    readOnlyReason?: string | null;
    repo: SrsRepository;
    repoName: string;
    onExport: () => void;
    onSave?: () => void;
    saving?: boolean;
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

  const pinKey = (id: string) => `essay.pins.${id}`;
  const foldKey = (id: string) => `srs-web.essay-fold.${id}`;
  let folded = $state<Set<string>>(new Set());

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  function loadViewState(id: string) {
    try {
      folded = new Set(JSON.parse(localStorage.getItem(foldKey(id)) ?? "[]"));
    } catch {
      folded = new Set();
    }
    try {
      const ids = JSON.parse(localStorage.getItem(pinKey(id)) ?? "[]");
      pinnedIds = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
    } catch {
      pinnedIds = [];
    }
  }

  let lastGuard: AgentWriteGuard | undefined;

  function reload(): void {
    try {
      essays = listEssays(repo);
      if (!essayId || !essays.some((e) => e.id === essayId)) {
        essayId = essays[0]?.id ?? null;
        if (essayId) loadViewState(essayId);
      }
      model = essayId ? loadEssay(repo, essayId, { repair: !readOnlyReason }) : null;
      error = null;
      if (model?.repairError)
        notify({ kind: "error", key: "essay-repair", text: `Could not set up this essay's containers: ${model.repairError}` });
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
  /** Per browser, not document-state (owner ruling, srs-web#406). */
  function setPins(ids: string[]) {
    pinnedIds = ids;
    if (!essayId) return;
    try {
      localStorage.setItem(pinKey(essayId), JSON.stringify(ids));
    } catch {
      /* storage blocked or full: pins stay for this session only */
    }
  }
  const togglePin = (id: string) =>
    setPins(pinnedIds.includes(id) ? pinnedIds.filter((x) => x !== id) : [...pinnedIds, id]);
  // Drop pins whose attachment no longer exists, silently.
  $effect(() => {
    if (!model) return;
    const live = new Set(Object.values(model.attachments).flat().map((a) => a.id));
    const kept = untrack(() => pinnedIds).filter((id) => live.has(id));
    if (kept.length !== untrack(() => pinnedIds).length) untrack(() => setPins(kept));
  });
  const pinned = $derived(
    Object.values(model?.attachments ?? {})
      .flat()
      .filter((a) => pinnedIds.includes(a.id))
      .map((a) => ({ id: a.id, kind: a.neighbourType, relation: a.relationLabel, title: a.label, text: a.text })),
  );

  /** The frame's state: Wide is the one setter (`ShellState.toggleWide`, saved through `wide.ts`); `data-margin` on `.app` carries it. */
  const shell = new ShellState({ wideEnabled: true });
  const marginVariant = $derived(shell.wide ? "expanded" : "compact");
  /** Inspector-trigger badge: agent writes newer than the last time the drawer was open (agent-activity.ts; no new data source). */
  // null until the first status arrives: history that arrives after mount is seeded as seen, not counted as new.
  let seenSeq = $state<number | null>(untrack(() => (agentStatus ? (agentStatus.writes[0]?.seq ?? 0) : null)));
  $effect.pre(() => {
    if (seenSeq === null && agentStatus) seenSeq = agentStatus.writes[0]?.seq ?? 0;
  });
  const unseen = $derived(seenSeq === null ? 0 : (agentStatus?.writes.filter((w) => w.seq > seenSeq!).length ?? 0));
  $effect(() => {
    shell.inspectorBadge = shell.inspectorOpen ? 0 : unseen;
  });
  $effect(() => {
    if (shell.inspectorOpen) seenSeq = agentStatus?.writes[0]?.seq ?? seenSeq;
  });
  /** Margin clicks: the one kind -> action mapping (the model says what, the margin how it looks). */
  function openAnnotation(a: Annotation, paragraphId: string) {
    if (a.kind === "comments") openThreads = toggle(openThreads, paragraphId);
    else if (a.kind === "attachment") togglePin(a.key);
    else if (a.kind === "shared") void run(() => makeLocalCopy(repo, model!, paragraphId));
    else if (a.targetId)
      document.querySelector<HTMLElement>(`[data-focus-key="body:${a.targetId}"]`)?.focus();
  }

  const hidden = $derived(new Set(model?.hidden ?? []));
  const inherited = $derived(hiddenByAncestor(model?.entries ?? [], hidden));
  /** UI-only: the opened threads (rules in thread-visibility.ts) and the zoomed paragraph. */
  let openThreads = $state<Set<string>>(new Set());
  let zoomId = $state<string | null>(null);
  /** Close from the thread's own control: the same toggle as the badge, then focus returns to the badge. */
  function closeThread(id: string) {
    openThreads = setOpen(openThreads, id, false);
    void tick().then(() =>
      document.querySelector<HTMLElement>(`[data-block-id="${id}"] [data-testid="comment-badge"]`)?.focus(),
    );
  }
  const showThread = (id: string) => isShown(openThreads, id, hidden, inherited);
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
  const binItems = $derived(
    (model?.binEntries ?? []).map((e) => ({ id: e.instanceId, label: label(e.instanceId) })),
  );
  const referenceItems = $derived(
    (model?.references ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      type: r.typeName,
      paragraphs: r.paragraphIds.map((id) => ({ id, label: label(id) })),
      openable: r.paragraphIds.length > 0,
    })),
  );
  /** Open a reference: pin its attachment (its relation to a paragraph) in the pinned pane. */
  function openReference(id: string) {
    const att = Object.values(model?.attachments ?? {}).flat().find((a) => a.neighbourId === id);
    if (att && !pinnedIds.includes(att.id)) togglePin(att.id);
  }
  const attach = (paragraphId: string, files: AttachFile[]) => run(() => attachFiles(repo, paragraphId, files));
  /** Files dropped on a paragraph: the same client check as the popover, rejections as a warning toast. */
  async function dropFiles(paragraphId: string, files: File[]) {
    const { accepted, rejected } = await takeFiles(files, undefined, 0);
    if (rejected.length)
      notify({
        kind: "warning",
        key: "attach-rejected",
        text: rejected.map((r) => `${r.name}: ${r.reason}`).join("; "),
        testid: "attach-rejected",
      });
    if (!accepted.length) return;
    await attach(paragraphId, accepted);
  }
  function downloadFile(a: Annotation) {
    try {
      downloadAttachment(repo, a.documentId!, a.label);
    } catch (e) {
      notify({
        kind: "warning",
        key: "download-unavailable",
        text: `Could not download ${a.label}: ${msg(e)}`,
        testid: "download-unavailable",
      });
    }
  }
  const dropReference = (id: string) => run(() => removeReference(repo, model!, id));
  const draftItems = $derived(
    (model?.draftEntries ?? []).map((e) => ({ id: e.instanceId, label: label(e.instanceId) })),
  );

  function comment(paragraphId: string, text: string, name?: string) {
    if (name) {
      if (!saveLocalName(name)) return void (error = "Could not remember your name in this browser.");
    }
    openThreads = setOpen(openThreads, paragraphId, true);
    void run(() => addComment(repo, paragraphId, text, model?.commentsContainerId));
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
    if (id) openThreads = setOpen(openThreads, id, true);
    push();
  }
  function applyAddress() {
    const a = parseAddress(location.hash);
    notice = null;
    if (a.essayId && a.essayId !== essayId) {
      if (essays.some((e) => e.id === a.essayId)) {
        essayId = a.essayId;
        loadViewState(essayId);
        reload();
      } else notice = "That link points to an essay that is not here; showing the current one.";
    }
    const want = a.zoomId ?? a.paragraphId;
    if (want && !allItems.some((i) => i.id === want)) notice ??= "That paragraph is no longer here; showing the whole document.";
    zoomId = a.zoomId && allItems.some((i) => i.id === a.zoomId) ? a.zoomId : null;
    if (zoomId) openThreads = setOpen(openThreads, zoomId, true);
    if (a.paragraphId && !zoomId && allItems.some((i) => i.id === a.paragraphId)) void focusParagraph(a.paragraphId, "handle");
  }
  onMount(() => applyAddress());

  async function copyLink(id: string, zoom = false) {
    const url = location.origin + location.pathname + location.search +
      formatAddress({ essayId: essayId ?? undefined, [zoom ? "zoomId" : "paragraphId"]: id });
    if (await copyText(url)) {
      linkFallback = null;
      notify({ kind: "success", key: "copy-link", text: "Link copied", testid: "address-notice" });
    } else {
      linkFallback = url;
    }
  }

  function exportMarkdown() {
    try {
      downloadText(essayMarkdown(repo, model!), "text/markdown", `${model!.title}.md`);
      notify({ kind: "success", key: "export", text: "Exported" });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  /** Export references (srs-web#278): the material the essay refers to, as markdown, from the bundle. */
  function exportReferences() {
    try {
      downloadText(essayReferences(repo, model!), "text/markdown", `${model!.title} (references).md`);
      notify({ kind: "success", key: "export", text: "References exported" });
    } catch (e) {
      error = msg(e);
    } finally {
      reload(); // the bundle may be new: model, write guard and handoff learn it
    }
  }

  /** Export snapshot (srs-web#417): refresh the bundle, then the core's slice of it as a `.srs`. */
  function exportSnapshot() {
    try {
      const { bytes } = essaySnapshot(repo, model!);
      triggerDownload(new Blob([bytes], { type: "application/zip" }), `${model!.title} (snapshot).srs`);
      notify({ kind: "success", key: "export", text: "Snapshot exported" });
    } catch (e) {
      error = msg(e);
    } finally {
      reload(); // the bundle may be new (even if the export was refused): model, write guard and handoff learn it
    }
  }

  /** Copy the agent handoff (srs-web#411): the whole essay, or `focusId` as the paragraph to look at. */
  async function copyForAgent(focusId?: string) {
    const m = model;
    if (!m) return;
    const text = agentHandoff({
      repositoryId: repositoryId(repo),
      essay: { id: m.essayId, title: m.title },
      containerId: m.containerId,
      purpose: m.purpose,
      stateId: m.stateId,
      draftContainerId: m.draftContainerId,
      binContainerId: m.binContainerId,
      commentsContainerId: m.commentsContainerId,
      referencesContainerId: m.referencesContainerId,
      bundleContainerId: m.bundleContainerId,
      focus: focusId ? { id: focusId, title: m.paragraphs[focusId] ? label(focusId) : "untitled" } : undefined,
    });
    if (await copyText(text)) {
      linkFallback = null;
      notify({ kind: "success", key: "copy-agent", text: "Copied for agent", testid: "address-notice" });
    } else {
      error = "Could not copy to the clipboard.";
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
      return `${l === undefined ? verb(w) : `${verb(w)} ¶ ${l}`} · ${relativeTime(w.at, now)}`;
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

  const toBin = (id: string) => run(() => binParagraph(repo, model!, id));
  const restore = (id: string) =>
    run(() => transfer(repo, model!.binContainerId!, model!.containerId, id));
  function forget(id: string) {
    if (confirm(`Delete "${label(id)}" permanently? This cannot be undone.`))
      void run(() => deleteForever(repo, model!, id));
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
      loadViewState(essayId);
    });
    push();
  }
  const createEssay = () => openNew(() => newEssay(repo, "Untitled essay"));
  const copyDocument = () => openNew(() => copyEssay(repo, model!));
  let agentsOpen = $state(true);
  /** Go > Agents…: open the inspector (a drawer when narrow), expand the Agents panel, focus its first control. */
  async function openAgents() {
    shell.inspectorOpen = true;
    agentsOpen = true;
    await tick();
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="agent-panel"] button, [data-testid="agent-panel"] input')?.focus());
  }
  let helpOpen = $state(false);
  const helpId = "essay-md-help";
  let toolbarEl = $state<HTMLElement>();
  /** The paragraphs in view that can show a thread: the header Comments state is read over these. */
  const shownIds = $derived(items.map((i) => i.id).filter((id) => canShow(id, hidden, inherited)));
  const barActions = $derived(
    headerActions(
      {
        onnew: createEssay,
        oncopy: model ? copyDocument : undefined,
        onhelp: () => { helpOpen = true; },
        oncomments: () => (openThreads = toggleAll(openThreads, shownIds)),
        onsave: onSave,
        onexport: onExport,
        onexportmd: model ? exportMarkdown : undefined,
        onsnapshot: model?.canSnapshot ? exportSnapshot : undefined,
        onreferences: model?.canSnapshot ? exportReferences : undefined,
        onexplorer: onOpenExplorer,
        onopenagents: agentPanel ? openAgents : undefined,
        onopenpackages: onOpenPackages,
        onopenanother: onOpenAnother,
      },
      { shell, comments: summary(openThreads, shownIds), saving, dirty: documentDirty, help: { id: helpId, open: helpOpen } },
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

{#snippet mainPane()}
    <Main>
  {#snippet bar()}
  <Toolbar
    title={model?.title ?? repoName}
    actions={barActions}
    groups={HEADER_GROUPS}
    bind:root={toolbarEl}
  >
    {#snippet titleSlot()}
      <span class="eyebrow">{repoName}</span>
      {#if essays.length > 1}
        <Select
          aria-label="Essay"
          value={essayId ?? ""}
          options={essays.map((essay) => ({ value: essay.id, label: essay.title }))}
          onchange={(e) => {
            essayId = e.currentTarget.value;
            zoomId = null;
            loadViewState(essayId);
            reload();
            push();
          }}
        />
      {/if}
    {/snippet}
    {#snippet trail()}<InspectorTrigger />{/snippet}
    {#snippet status()}
      {#if documentDirty}<span data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
    {/snippet}
  </Toolbar>
  {/snippet}
  <MarkdownHelp id={helpId} anchor={toolbarEl} bind:open={helpOpen} />

  {#if notice}
    <Notice kind="info" testid="address-notice" onDismiss={() => (notice = null)}>{notice}</Notice>
  {/if}
  {#if linkFallback}
    <Notice kind="info">
      Copy this link: <Input readonly aria-label="Link" data-testid="link-fallback" value={linkFallback} onfocus={(e) => e.currentTarget.select()} />
    </Notice>
  {/if}
  {#if error}<Notice kind="error" testid="essay-error">{error}</Notice>{/if}


  <div class="workspace workspace--flush essay-shell">
  {#if !model}
    <div class="essay-shell__empty">
      <p>No essay in this repository yet.</p>
      <Button variant="primary" onclick={createEssay}>New essay</Button>
    </div>
  {:else}
      <article class="essay-shell__page" aria-label={model.title}>
        <InlineText
          as="h1"
          value={model.title}
          label="Essay title"
          oncommit={(v) => v.trim() && run(() => setEssayTitle(repo, model!, v.trim()))}
        />
        {#if model.purpose !== null}
          <div class="essay-shell__purpose">
            <MarkdownText
              value={model.purpose}
              base="purpose"
              label="Essay purpose"
              placeholder="Add a purpose: what this essay is for"
              focusKey="purpose"
              oncommit={(v) => run(() => setEssayPurpose(repo, model!.essayId, v))}
            />
          </div>
        {/if}
        {#if zoomId}
          <div class="essay-shell__zoombar">
            <Button variant="ghost" data-testid="zoom-exit" aria-label="Whole document" onclick={() => setZoom(null)}><ArrowLeft size={16} aria-hidden="true" /><span class="essay-shell__label"> Whole document</span></Button>
            <Button variant="ghost" data-testid="zoom-copy-link" aria-label="Copy link" onclick={() => copyLink(zoomId!, true)}><span class="essay-shell__narrow-icon" aria-hidden="true"><LinkIcon size={16} aria-hidden="true" /></span><span class="essay-shell__label">Copy link</span></Button>
          </div>
        {/if}
        {#if items.length === 0}
          <p class="essay-shell__hint">No paragraphs yet.</p>
          <Button variant="mono" data-testid="first-paragraph" onclick={() => run(() => `body:${addParagraph(repo, model!)}`)}>Add first paragraph</Button>
        {/if}
        <BlockStack {items} source="essay" label="Essay paragraphs" candrop={essayDrop} ondrop={(p, t) => onDrop("essay", p, t)} onfiles={dropFiles}>
          {#snippet row(item, handle)}
            {@const p = model!.paragraphs[item.id]}
            {#if p}
              {#snippet margin()}
                <AnnotationMargin
                  annotations={annotationsFor(essaySource(model!), p.id)}
                  variant={marginVariant}
                  active={[...pinnedIds, ...(showThread(p.id) ? [`comments:${p.id}`] : [])]}
                  onopen={(a) => openAnnotation(a, p.id)}
                  onremove={(a) => run(() => removeAttachment(repo, a.key))}
                  ondownload={downloadFile}
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
                oncopyagent={() => copyForAgent(p.id)}
                onattach={(files) => attach(p.id, files)}
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
                ondelete={() => toBin(p.id)}
              />
              {#if showThread(p.id)}
                <CommentThread {now} comments={model!.comments[p.id] ?? []} needsName={!hasActor} onadd={(t, n) => comment(p.id, t, n)} onclose={() => closeThread(p.id)} />
              {/if}
            {/if}
          {/snippet}
        </BlockStack>
        {#if items.length > 0 && !zoomId}
          <Button variant="mono" class="essay-shell__add" data-testid="add-paragraph" onclick={() => run(() => `body:${addParagraph(repo, model!)}`)}>Add paragraph</Button>
        {/if}
      </article>
  {/if}
  </div>
    </Main>
{/snippet}

{#snippet inspectorPane()}
    <Inspector label="Panels">
      <div class="panel-rail" data-testid="rail">
{#if model}
        <Panel title="Layers" persistKey="essay.layers" collapseWhen={NARROW}>
          <LayersPanel
            {layers}
            candrop={essayDrop}
            ondrop={(p, t) => onDrop("essay", p, t)}
            onhide={(id, h) => run(() => setHidden(repo, model!, id, h))}
            ondelete={toBin}
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
        <Panel title="Bin" aside={binItems.length} persistKey="essay.bin" collapseWhen={NARROW}>
          <BinTray
            items={binItems}
            onrestore={restore}
            onforget={forget}
          />
        </Panel>
        {#if model.referencesContainerId}
          <Panel title="References" aside={referenceItems.length} persistKey="essay.references" collapseWhen={NARROW}>
            <ReferencesTray items={referenceItems} onopen={openReference} onfocus={(id) => focusParagraph(id)} onremove={dropReference} />
          </Panel>
        {/if}
        <PinnedPane items={pinned} onunpin={togglePin} onremove={(id) => run(() => removeAttachment(repo, id))} />
{/if}
        {#if agentPanel}{@render agents()}{/if}
      </div>
    </Inspector>
{/snippet}

<!-- No inspector column until there is something in it (an essay, or the agent panel). -->
<AppShell {shell} main={mainPane} inspector={model || agentPanel ? inspectorPane : undefined} inspectorLabel="Panels" />

{#snippet agents()}
  <Panel title="Agents" aside={agentStatus ? `${agentStatus.connected}/${agentStatus.total}` : undefined} persistKey="essay.agents" collapseWhen={NARROW} bind:open={agentsOpen}>
    {#snippet actions()}{#if agentStatus}<AgentPresence status={agentStatus} />{/if}{/snippet}
    {#if model}
      <Button size="sm" variant="mono" data-testid="copy-for-agent" onclick={() => copyForAgent(zoomId ?? undefined)}>Copy essay handoff</Button>
    {/if}
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
