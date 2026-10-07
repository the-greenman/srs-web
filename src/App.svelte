<!--
  App.svelte — Application shell.

  Owns: WASM initialisation, repo loading, top-level app state, editor mode selection.
  Delegates: the active editor to its registered shell ($lib/editors/registry).

  States: boot → idle → loaded | error
    boot:   WASM initialising
    idle:   WASM ready, no repo loaded — show mode picker then file picker
    loaded: repo loaded — show the generic shell or a registered editor shell
    error:  unrecoverable error

  B4 read-only governance viewer: https://github.com/the-greenman/srs-web/issues/3
  B9 edit forms:                  https://github.com/the-greenman/srs-web/issues/5
  B11 lifecycle & supersession:   https://github.com/the-greenman/srs-web/issues/7
-->
<script lang="ts">
  import Notice from '$lib/components/Notice.svelte';
  import {
    initWasm,
    loadRepo,
    loadRepoFromArchive,
    loadRepoFromTree,
    exportSrsj,
    exportArchive,
    observeWrites,
    exportTree,
    createBlankRepository,
    installBundles,
    neededMigrationIds,
    RFC046_MIGRATION_ID,
    applyMigration,
  } from "$lib/srs-client.js";
  import { applyActor, onActorChange, refreshSignedInActor } from "$lib/actor.js";
  import { acquireChannelLock, releaseChannelLock, channelsInUseElsewhere, connections, credsKey, type AgentConnection } from "$lib/agent-connections.js";
  import { relays } from "$lib/relay-library.js";
  import { observeSession, pushWrite, type AgentPanelCtx, type AgentStatus, type AgentWrite } from "$lib/agent-activity.js";
  import { reopenSaved } from "$lib/reopen.js";
  import { fetchArchiveFile, parseOpenUrl, withoutOpenParam } from "$lib/open-url.js";
  import { mayKeepWorkingCopy, readOnlyGuard, readOnlyRepo } from "$lib/read-only.js";
  import { listRelations, listTypes, repositoryId, type AgentWriteGuard, type McpSession, type SrsRepository, type UpgradePackageResult, upgradeBundles } from "$lib/srs-client.js";
    import { loadWorkingCopy, clearWorkingCopy, saveWorkingCopy, workingCopyScheduler } from "$lib/browser-cache.js";
  import type { WorkingCopyEntry } from "$lib/browser-cache.js";
  import { DocumentMutationTracker } from "$lib/document-mutations.js";

  import { EDITORS, availableEditors, installEditor as installEditorPackages, usableEditor } from "$lib/editors/registry.js";
  import UpgradePlan from "$lib/components/UpgradePlan.svelte";
  import PackagesDialog from "$lib/components/PackagesDialog.svelte";
  import { installedPackages, upgradeNoticeText } from "$lib/package-upgrade.js";
  import { adoptByPackage } from "$lib/upgrade-plan.js";
  import GenericSrsShell from "$lib/generic/GenericSrsShell.svelte";
  import SourceChooser from "$lib/components/SourceChooser.svelte";
  import SrsMark from "$lib/components/SrsMark.svelte";
  import Wordmark from "$lib/components/Wordmark.svelte";
  import CreateRepositoryPanel from "$lib/components/CreateRepositoryPanel.svelte";
  import GitSaveModal from "$lib/components/GitSaveModal.svelte";
  import SaveToModal from "$lib/components/SaveToModal.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import AgentPresence from "$lib/components/AgentPresence.svelte";
  import AgentPanel from "$lib/components/AgentPanel.svelte";
  import type { PanelAgent } from "$lib/components/agent-panel.js";
  import { RelayHost, type HostState } from "$lib/mcp/relay-host.js";
  import { tick, untrack } from "svelte";
  import { notify, pinNotice, resetNotices, toUiDiagnostic, unpinNotice, type NoticeKind } from "$lib/notices.svelte.js";
  import { slugifyFilename } from "$lib/slug.js";
  import {
    createStorageProvidersFromEnv,
    downloadDocument,
    downloadArchive,
    isGitBranchAware,
    openLocalFile,
    stripSrsExtension,
    toArchiveName,
    StorageError,
    type DocumentHandle,
    type RepoTreeAware,
  } from "$lib/storage/index.js";

  // Link to install/manage the GitHub App (a GitHub App must be installed to write).
  const githubAppSlug = import.meta.env.VITE_GITHUB_APP_SLUG ?? "";
  const githubInstallUrl = githubAppSlug
    ? `https://github.com/apps/${githubAppSlug}/installations/new`
    : null;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  type AppState = "boot" | "idle" | "migrate" | "loaded" | "error";
  /** "generic" or an EditorDefinition id from $lib/editors/registry. */
  type EditorMode = string;

  let appState = $state<AppState>("boot");
  let errorMsg = $state<string | null>(null);
  let editorMode = $state<EditorMode>("generic");

  let repoName = $state<string>("Untitled repository");
  const storageProviders = createStorageProvidersFromEnv();
  let activeDocument = $state<DocumentHandle | null>(null);
  /**
   * Set (to the source host) while the open repository came from a link and may not be edited (#471).
   * Cleared by every other load path, and by saving a copy to the user's own storage.
   */
  let readOnlyHost = $state<string | null>(null);
  /** Host of a link being fetched at boot (#471), for the splash text. */
  let openingHost = $state<string | null>(null);

  /** Document-level Save (write-capable cloud/git handles only). */
  let saving = $state(false);
  /** Git Save dialog (branch choice + install hint) state. */
  let gitSaveOpen = $state(false);
  let gitSaveError = $state<string | null>(null);
  let saveToOpen = $state(false);
  let saveToError = $state<string | null>(null);

  let repo = $state<SrsRepository | null>(null);

  /**
   * One in-place WASM repository can be mutated by more than one UI/executor.
   * This tracker is the sole authority for whether an exported save snapshot is
   * still current when an asynchronous provider write completes.
   */
  const documentMutations = new DocumentMutationTracker();
  let documentDirty = $state(false);
  /** Reactive invalidation signal for UI projections of the in-place repository. */
  let documentRevision = $state(0);
  /**
   * The one editor-availability computation (srs-web#399): entry type present and `requires` met by the
   * core's RFC-044 check. The shell selection below and the picker (GenericSrsShell) both read it.
   */
  const offeredEditors = $derived.by(() => {
    void documentRevision; // re-run after a mutation (a package install changes the answer)
    return repo && !readOnlyHost ? availableEditors(repo, listTypes(repo)) : [];
  });
  const activeEditor = $derived(usableEditor(offeredEditors, editorMode));
  // An editor that stops being usable drops back to the generic shell for good, so a later
  // package install never flips the user back into it unasked.
  $effect(() => {
    if (!activeEditor && editorMode !== "generic") editorMode = "generic";
  });

  /**
   * Catalog diagnostics from the load-time `validate()` pass (RFC-038 [R24]).
   * Under tree-authoritative storage a malformed or duplicate object is a
   * diagnostic, not a silent omission — the repository still opens, so the
   * only way the user learns an object was rejected is if we show it.
   */

  /** Cached working copy loaded from localStorage on WASM init. */
  let cachedSession = $state<WorkingCopyEntry | null>(null);
  let restoreError = $state<string | null>(null);

  /**
   * RFC-043 revision gate (srs-web#334). A rev-7 repository loads but the rev-8
   * engine refuses every read until `rfc043-container-entries` is applied, so the
   * load is held here and the user is asked — never opened empty. `finish(dirty)`
   * is the load path's own completion step; it runs after migrate (dirty=true,
   * the migrated working copy is unsaved until Save) or immediately when no
   * migration is needed.
   */
  let pendingMigration = $state<{ repo: SrsRepository; name: string; ids: string[]; finish: (dirty: boolean) => void } | null>(null);
  let migrationError = $state<string | null>(null);

  function gateOnMigration(loaded: SrsRepository, name: string, finish: (dirty: boolean) => void): void {
    // rfc043 (7 -> 8) and rfc046 (8 -> 9): attribution (RFC-046) needs revision 9.
    let ids: string[];
    try {
      ids = neededMigrationIds(loaded);
    } catch (e) {
      // Unknown revision state: do not open (no actor, no writes) and say why.
      repo = null;
      errorMsg = `Could not determine whether this repository needs migration: ${e instanceof Error ? e.message : String(e)}`;
      appState = "error";
      return;
    }
    if (ids.length) {
      pendingMigration = { repo: loaded, name, ids, finish };
      repo = null; // not opened (no MCP session etc.) until migrated
      migrationError = null;
      appState = "migrate";
    } else {
      finish(false);
    }
  }

  function runPendingMigration(): void {
    const pending = pendingMigration;
    if (!pending) return;
    try {
      // Each id is re-checked after the previous one (rfc046 requires rfc043 first).
      for (const id of pending.ids) {
        if (neededMigrationIds(pending.repo).includes(id)) applyMigration(pending.repo, id);
      }
    } catch (e: unknown) {
      // All-or-nothing in the engine: nothing was written. Keep the prompt up.
      migrationError = `Migration failed: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    pendingMigration = null;
    pending.finish(true);
  }

  function cancelPendingMigration(): void {
    pendingMigration = null;
    repo = null;
    activeDocument = null;
    readOnlyHost = null;
    appState = "idle";
  }

  /** GitHub login -> `github:<login>` actor (RFC-046); no sign-in leaves the local/none fallback. */
  async function resolveSignedInActor(): Promise<void> {
    const github = storageProviders.github;
    if (!github?.profile) return;
    await refreshSignedInActor("github", () => github.profile?.() ?? Promise.resolve(null));
  }

  // Any actor change (login resolved / cleared, name saved) is re-applied to the open repository.
  onActorChange(() => {
    if (repo) applyActor(repo);
  });

  /** A new document: drop the old one's toasts, dismissals and catalog notice (the load path pins its own after). */
  function clearNotices(): void {
    resetNotices();
    unpinNotice("catalog");
  }

  /** One save-result toast: the single "save" key, so a later result replaces an earlier (even a sticky error). */
  const saveToast = (kind: NoticeKind, text: string, duration?: number): void => {
    notify({ kind, key: "save", text, testid: "save-status", duration });
  };

  function beginDocument({ dirty = false }: { dirty?: boolean } = {}): void {
    // Every load path passes through here: from now on each engine write reports itself.
    if (repo) {
      if (readOnlyHost) repo = readOnlyRepo(repo, () => readOnlyHost !== null);
      repo = observeWrites(repo, syncDocument);
      applyActor(repo);
      void resolveSignedInActor();
    }
    clearNotices();
    workingCopy.cancel();
    workingCopySaved = true;
    const revision = documentMutations.beginDocument(repo?.write_epoch() ?? 0, { dirty });
    documentDirty = documentMutations.dirty;
    documentRevision = revision.revision;
  }

  /** Whether the last recovery-copy write succeeded (srs-web#312). */
  let workingCopySaved = $state(true);

  /**
   * The recovery copy exports the whole repository, so it is written at most once per
   * window rather than on every commit (srs-web#353: ~45 ms per commit on muSrs). Skipped
   * when the document was closed or saved in the meantime.
   */
  const workingCopy = workingCopyScheduler(() => {
    if (repo && mayKeepWorkingCopy(readOnlyHost, documentMutations.dirty)) workingCopySaved = saveWorkingCopy(repoName, exportSrsj(repo));
  }, 2000);
  $effect(() => {
    const flush = () => workingCopy.flush();
    const onHidden = () => document.visibilityState === "hidden" && flush();
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  });

  /**
   * The one "did the repository change?" check. Called by the write-observing repo handle
   * (`observeWrites`, every UI writer), by the relay host after each MCP request, and before
   * every save snapshot. Compares the engine's `write_epoch()` with the last observed value,
   * so it is idempotent: a no-op action leaves the document clean (srs-web#345).
   *
   * Returns whether the last local recovery-copy write succeeded (false when its
   * `localStorage` write failed, srs-web#312) so GovernanceShell's save indicator can
   * reflect it. The copy itself is written by `workingCopy`, at most 2 s later.
   */
  function syncDocument(): boolean {
    if (!repo || !documentMutations.sync(repo.write_epoch())) return workingCopySaved;
    documentDirty = documentMutations.dirty;
    documentRevision = documentMutations.current.revision;
    workingCopy.schedule();
    return workingCopySaved;
  }

  function completeDocumentSave(snapshot: ReturnType<typeof documentMutations.captureSave>): boolean {
    const savedCurrentRevision = documentMutations.completeSave(snapshot);
    documentDirty = documentMutations.dirty;
    if (savedCurrentRevision) {
      workingCopy.cancel();
      clearWorkingCopy();
    }
    return savedCurrentRevision;
  }

  // ---------------------------------------------------------------------------
  // MCP relay (srs-web#307). Enabled only when a relay origin is configured.
  // The Rust/WASM McpSession owns all MCP semantics; this only hosts it. MCP
  // writes mark the document unsaved via syncDocument and never call
  // a storage provider — persistence stays an explicit Save/Export.
  // ---------------------------------------------------------------------------

  // Relays are a user-managed library (srs-web#442, relay-library.ts); each agent is bound to one.
  let relayList = $state(relays.list());
  /** Bind agents that predate the library to the default relay (called after every relay change). */
  function adoptRelays() {
    const d = relayList.find((r) => r.isDefault);
    if (d) library = [...connections.adoptRelay(d.id)];
  }
  const relayError = (r: { relays: typeof relayList } | { error: string }, done?: string): string | null => {
    if ("error" in r) return r.error;
    relayList = r.relays;
    adoptRelays();
    if (done) notify({ kind: "info", key: "agents", text: done });
    return null;
  };
  const addRelay = (label: string, url: string) => relayError(relays.add(label, url), "Relay added");
  const updateRelay = (id: string, patch: { label?: string; url?: string }) => relayError(relays.update(id, patch));
  const removeRelay = (id: string) => relayError(relays.remove(id), "Relay removed");
  function setDefaultRelay(id: string) {
    relayList = relays.setDefault(id);
  }
  // One relay channel + MCP session per agent connection (srs-web#358), each with its own
  // host-minted actor id. `agents` is the reactive view; hosts/sessions are managed here only.
  type Agent = { conn: AgentConnection; state: HostState };
  let agents = $state<Agent[]>([]);
  /** Agent writes observed at each session boundary (agent-activity.ts), newest first. */
  let agentWrites = $state<AgentWrite[]>([]);
  /** Client-reported names (MCP initialize clientInfo); the engine's actor name is label, else this. */
  let clientNames = $state<Record<string, string>>({});
  const agentName = (conn: AgentConnection) => conn.label ?? clientNames[conn.id] ?? `Agent ${conn.id.slice(6, 12)}`;
  const agentStatus = $derived<AgentStatus>({
    connected: agents.filter((a) => a.state.status === "online").length,
    total: agents.length,
    agents: agents.map((a) => ({ id: a.conn.id, name: agentName(a.conn), status: a.state.status })),
    writes: agentWrites,
  });
  /** Saved channels (the library) and those held by another tab (Web Locks). */
  let library = $state<AgentConnection[]>(connections.list());
  connections.sweepInits(connections.list().map((c) => c.id));
  adoptRelays();
  let inUse = $state<Set<string>>(new Set());
  const refreshInUse = () => void channelsInUseElsewhere().then((s) => (inUse = s));
  /** The floating dock starts open only once a relay exists: with none it would sit over the page's own controls. */
  let dockOpen = $state(relays.list().length > 0);
  /** Go > Agents…: expand the dock and focus its first control. */
  async function openDock() {
    dockOpen = true;
    await tick();
    document.querySelector<HTMLElement>('.mcp-dock [data-testid="agent-panel"] button, .mcp-dock [data-testid="agent-panel"] input')?.focus();
  }
  /** The 15 s clock for "Connected 2 min ago" (EssayShell keeps its own). */
  let agentNow = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (agentNow = Date.now()), 15000);
    return () => clearInterval(t);
  });
  const panelAgents = $derived<PanelAgent[]>(
    library.map((conn) => ({
      conn,
      name: agentName(conn),
      relayLabel: relayList.find((r) => r.id === conn.relayId)?.label ?? "Relay missing",
      state: agents.find((a) => a.conn.id === conn.id)?.state ?? null,
      inUseElsewhere: inUse.has(conn.id),
    }))
  );
  const hosts = new Map<string, { host: RelayHost; session: McpSession | null }>();
  // Reopen after a reload (#418): ids mid-open (a Connect click must not duplicate them), and ids
  // allowed exactly one automatic takeover if the relay still holds the dead page's socket.
  const opening = new Set<string>();
  const autoTakeover = new Set<string>();
  const setAgentState = (id: string, state: HostState) => {
    if (state.status === "online") autoTakeover.delete(id);
    else if (state.status === "rejected" && autoTakeover.delete(id)) void hosts.get(id)?.host.takeover();
    if (state.status === "online" && agents.find((a) => a.conn.id === id)?.state.status !== "online")
      library = [...connections.touch(id)];
    agents = agents.map((a) => (a.conn.id === id ? { ...a, state } : a));
  };
  function hostFor(conn: AgentConnection): RelayHost {
    let h = hosts.get(conn.id);
    if (!h) {
      h = {
        host: new RelayHost({
          relayUrl: relays.get(conn.relayId)?.url ?? "",
          storageKey: credsKey(conn.id),
          onHandled: () => void syncDocument(),
          onChange: (s) => setAgentState(conn.id, s),
        }),
        session: null,
      };
      hosts.set(conn.id, h);
    }
    return h.host;
  }

  // The active shell declares the agent write guard (policy); the engine enforces it. Kept here
  // so it is also applied to a session attached after the guard was set.
  let agentGuard: AgentWriteGuard | null = null;
  // Tied to the repository it was declared for, so one repo's ids are never applied to another's session.
  let agentGuardRepo: SrsRepository | null = null;
  /** Fail closed: if the guard cannot be applied, detach the agent and surface the error. */
  function applyGuard(id: string): boolean {
    const h = hosts.get(id);
    try {
      // Read-only (#471): the core guard over the whole repository, in place of any shell's own.
      const guard = readOnlyHost && repo ? readOnlyGuard(repo) : agentGuard && agentGuardRepo === repo ? agentGuard : null;
      if (guard) h?.session?.set_write_guard(JSON.stringify(guard));
      else h?.session?.clear_write_guard();
      return true;
    } catch (e) {
      console.error("MCP write guard could not be applied", e);
      // fail closed; recovery is the next repo change (openAgentSession re-applies the guard)
      h?.host.detach();
      setAgentState(id, { status: "error", callerUrl: null, error: `Write guard failed: ${e instanceof Error ? e.message : String(e)}` });
      return false;
    }
  }
  const applyGuards = () => hosts.forEach((_, id) => applyGuard(id));

  /**
   * Agent actor (RFC-046): the host assigns the id; the name is the user's label if set, else
   * the engine fills it from the client's initialize clientInfo. Only on a revision-9 corpus:
   * below it an actor would refuse writes, so a repo whose migration was declined keeps its
   * agent writes unattributed.
   */
  function applyAgentActor(session: McpSession, forRepo: SrsRepository, conn: AgentConnection): void {
    try {
      if (neededMigrationIds(forRepo).includes(RFC046_MIGRATION_ID)) return;
    } catch (e) {
      console.error("Agent actor not set: migration state unknown", e);
      return;
    }
    session.set_actor(JSON.stringify({ kind: "ai", id: conn.id, ...(conn.label ? { name: conn.label } : {}) }));
  }

  /** The one place a connection's session is opened and configured (guard, actor) before attach. */
  function openAgentSession(conn: AgentConnection, current: SrsRepository | null): void {
    const h = hostFor(conn);
    const entry = hosts.get(conn.id) as { host: RelayHost; session: McpSession | null };
    h.detach();
    entry.session?.free(); // release the previous repo's WASM session
    entry.session = current ? current.open_mcp_session() : null;
    if (entry.session) {
      if (applyGuard(conn.id)) {
        applyAgentActor(entry.session, current as SrsRepository, conn);
        void h.attach(observeSession(entry.session, conn.id, {
          onWrite: (w) => (agentWrites = pushWrite(agentWrites, w)),
          // a replayed initialize only fills a missing name; it never flips one client's name to another's
          onClientName: (n, replayed) => { if (!replayed || !clientNames[conn.id]) clientNames = { ...clientNames, [conn.id]: n }; },
          relationTarget: (id) => listRelations(current as SrsRepository, {}).find((r) => r.relationId === id)?.targetInstanceId,
          initStore: {
            load: () => connections.loadInit(conn.id),
            save: (i) => connections.saveInit(conn.id, i),
            clear: () => connections.clearInit(conn.id),
          },
        }));
      }
    } else h.detach();
  }

  /** Open a saved channel in this tab, only if no other tab holds it. */
  async function openChannel(conn: AgentConnection, reopening = false): Promise<boolean> {
    if (agents.some((a) => a.conn.id === conn.id) || opening.has(conn.id)) return true;
    if (!relays.get(conn.relayId)) return true; // unbound or relay missing: cannot connect
    opening.add(conn.id);
    try {
      if (!(await acquireChannelLock(conn.id))) {
        refreshInUse();
        return false;
      }
      agents = [...agents, { conn, state: { status: "idle", callerUrl: null, error: null } }];
      if (repo) library = [...connections.setReopen(conn.id, repositoryId(repo))];
      if (reopening) autoTakeover.add(conn.id); // only a reopen that really opened may take over
      openAgentSession(conn, repo);
      return true;
    } finally {
      opening.delete(conn.id);
    }
  }
  function connectAgent(label: string | undefined, relayId: string) {
    library = [...connections.add(label, relayId)];
    void openChannel(library[library.length - 1]);
  }
  /** Disconnected agents only: the actor name is fixed when a session opens. */
  function renameAgent(id: string, label: string) {
    library = [...connections.rename(id, label)];
  }
  /** Detach in this tab; the channel and its credentials stay in the library. */
  async function disconnectAgent(id: string) {
    const h = hosts.get(id);
    h?.host.detach();
    h?.session?.free();
    library = [...connections.setReopen(id, null)];
    hosts.delete(id);
    autoTakeover.delete(id);
    const released = releaseChannelLock(id);
    agents = agents.filter((a) => a.conn.id !== id);
    await released; // the in-use query must not still see our own lock
    refreshInUse();
  }
  async function forgetAgent(id: string) {
    // Defence in depth: the menu disables Forget, but the in-use set can be stale. Ask the locks now.
    if ((await channelsInUseElsewhere()).has(id)) {
      refreshInUse();
      return;
    }
    disconnectAgent(id);
    library = [...connections.remove(id)];
    notify({ kind: "info", key: "agents", text: "Agent forgotten" });
  }

  $effect(() => {
    const current = repo;
    untrack(() => {
      agentWrites = []; // a new repository: earlier writes name instances that are gone
      const rid = current && agents.length ? repositoryId(current) : null;
      for (const { conn } of agents) {
        openAgentSession(conn, current);
        if (rid) library = [...connections.setReopen(conn.id, rid)];
      }
    });
  });

  // Once per page load, the first repository reopens the agents that were open on it. After a tick,
  // so the shell has declared its write guard before any agent can write.
  let reopened = false;
  $effect(() => {
    const r = repo;
    if (!r || reopened) return;
    reopened = true;
    void tick().then(() => {
      if (repo !== r) {
        reopened = false; // the repo effect reruns for the new repository
        return;
      }
      void reopenSaved(
        library,
        repositoryId(r),
        (c) => openChannel(c, true),
        { stillValid: () => repo === r }
      );
    });
  });

  // Another tab changed the stored lists: re-read what is displayed. Never touches open agents
  // (`agents`/`hosts` are separate state), and `storage` never fires in the tab that wrote.
  $effect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      if (relays.reload(e.key)) relayList = relays.list();
      if (connections.reload(e.key)) library = [...connections.list()];
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  });

  $effect(() => {
    if (library.length === 0) return;
    refreshInUse();
    window.addEventListener("focus", refreshInUse);
    document.addEventListener("visibilitychange", refreshInUse);
    return () => {
      window.removeEventListener("focus", refreshInUse);
      document.removeEventListener("visibilitychange", refreshInUse);
    };
  });

  // ---------------------------------------------------------------------------
  // WASM initialisation
  // ---------------------------------------------------------------------------

  $effect(() => {
    initWasm()
      .then(() => {
        const link = new URLSearchParams(location.search).get("open");
        if (link !== null) {
          void openFromLink(link);
          return;
        }
        const cached = loadWorkingCopy();
        if (cached !== null) {
          cachedSession = cached;
          editorMode = "generic";
        }
        appState = "idle";
      })
      .catch((e: unknown) => {
        errorMsg = `Failed to load WASM engine: ${e instanceof Error ? e.message : String(e)}`;
        appState = "error";
      });
  });

  // ---------------------------------------------------------------------------
  // Document loading
  // ---------------------------------------------------------------------------

  async function loadDocument(handle: DocumentHandle, fromHost: string | null = null): Promise<void> {
    errorMsg = null;
    readOnlyHost = fromHost;
    try {
      switch (handle.kind) {
        case "bytes": {
          if (!handle.readBytes) throw new Error("This storage provider does not support binary archive reads.");
          const bytes = await handle.readBytes();
          repo = loadRepoFromArchive(bytes);
          break;
        }
        case "tree": {
          const files = await (handle as DocumentHandle & RepoTreeAware).readTree();
          repo = loadRepoFromTree(files);
          break;
        }
        default: {
          const text = await handle.read();
          repo = loadRepo(text);
        }
      }
      const loaded = repo;
      gateOnMigration(loaded, handle.name, (dirty) => {
        repo = loaded;
        activeDocument = handle;
        beginDocument({ dirty });
        repoName = stripSrsExtension(handle.name);
        cachedSession = null;
        if (dirty) {
          saveToast("info", "Migrated to the current data model. Unsaved - Save to keep it.", 8000);
          if (!readOnlyHost) saveWorkingCopy(repoName, exportSrsj(loaded));
        }
        const catalog = collectCatalogDiagnostics(loaded);
        if (catalog.length) {
          pinNotice({
            key: "catalog",
            documentKey: repoName,
            kind: "warning",
            diagnostics: catalog.map(toUiDiagnostic),
            testid: "catalog-diagnostics",
          });
        }
        appState = "loaded";
      });
    } catch (e: unknown) {
      repo = null;
      activeDocument = null;
      readOnlyHost = null;
      throw new Error(
        `Failed to load repository: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }

  /**
   * Run the core's validation pass and keep the entries that mean "an object
   * in the tree was not catalogued as-authored". Presentation only — the core
   * decides what is a diagnostic; we only decide that the user sees it.
   */
  function collectCatalogDiagnostics(r: SrsRepository): { severity: string; message: string }[] {
    try {
      const report = r.validate();
      // Errors only: these are the objects the catalog refused ([R8]/[R13]
      // shape and resolution failures). Warnings are advisory about content
      // that did load, and belong to the per-record Diagnostics panel.
      return (report?.diagnostics ?? []).filter((d) => d.severity === "error");
    } catch (e: unknown) {
      // A validate() failure must not block opening the repository, but it is
      // itself the kind of thing that must not pass silently.
      return [{ severity: "error", message: `Could not validate repository: ${e instanceof Error ? e.message : String(e)}` }];
    }
  }

  /**
   * Install an unmet editor's packages through the write-observed repo (so the document is
   * marked unsaved), then open it. Packages installed before a failure stay (the user can
   * discard unsaved changes); a throw reaches the shell, which shows it beside the button.
   * Whether the editor is now usable is re-derived, never assumed: an editor that is still
   * unmet drops back to generic.
   */
  async function installEditor(id: string): Promise<void> {
    const offered = offeredEditors.find((o) => o.editor.id === id);
    if (!repo || !offered?.unmet?.install) throw new Error("Nothing to install for this editor.");
    try {
      installEditorPackages(repo, offered);
    } finally {
      syncDocument();
    }
    editorMode = id;
  }

  // ---------------------------------------------------------------------------
  // Package upgrade (srs-web#450): ONE flow for the pinned notice, Document > Packages… and an
  // outdated editor's Upgrade. Dry run first (the plan dialog), Apply through the write-observed repo.
  // The core decides what is outdated, what is safe to overwrite and what is a conflict (ADR-001).
  // ---------------------------------------------------------------------------

  /**
   * An upgrade writes, so it is not offered on a read-only document (`readOnlyHost`: opened from a link, writes
   * refused). A local file is not read-only: it edits in memory and exports, as package Install already does,
   * even though its handle cannot save back (`readOnlyReason`).
   */
  const canUpgrade = $derived(!!repo && !readOnlyHost);
  const bundledPackages = $derived.by(() => {
    void documentRevision; // an upgrade or install changes the answer
    if (!repo || !canUpgrade) return [];
    try {
      return installedPackages(repo);
    } catch (e: unknown) {
      console.warn("package check failed", e); // the offer is advisory; a failed check must not block the document
      return [];
    }
  });

  // The pinned offer: one notice per document while a bundled package installed here is outdated.
  $effect(() => {
    const outdated = bundledPackages.filter((p) => p.outdated);
    untrack(() => {
      if (outdated.length === 0) return unpinNotice("package-upgrade");
      pinNotice({
        key: "package-upgrade",
        documentKey: repoName,
        kind: "info",
        text: upgradeNoticeText(outdated),
        testid: "package-upgrade-notice",
        action: { label: "Review upgrade", onAction: () => reviewUpgrade(outdated.map((p) => p.packageId)) },
      });
    });
  });

  let packagesOpen = $state(false);
  let upgradeFlow = $state<{ ids: string[]; plans: UpgradePackageResult[]; openEditor?: string } | null>(null);
  /** Ids of the unproven definitions the user ticked in the plan dialog (default none). */
  let upgradeAdopt = $state<string[]>([]);
  let upgradeBusy = $state(false);
  let upgradeError = $state<string | null>(null);

  /** Dry-run `ids` and show the plan; writes nothing. `openEditor` = open it after Apply (an editor's Upgrade). */
  function reviewUpgrade(ids: string[], openEditor?: string): void {
    if (!repo || !canUpgrade) return;
    try {
      upgradeFlow = { ids, plans: upgradeBundles(repo, ids, { dryRun: true }), openEditor };
      upgradeAdopt = [];
      upgradeError = null;
      packagesOpen = false;
    } catch (e: unknown) {
      notify({ kind: "error", key: "upgrade", text: `Could not plan the upgrade: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  /**
   * Apply through the write-observed repo (the document is marked unsaved and saved normally). Whether an
   * editor is now usable is re-derived, never assumed: a still-unmet editor drops back to generic.
   */
  function applyUpgrade(): void {
    if (!repo || !upgradeFlow) return;
    const { ids, plans, openEditor } = upgradeFlow;
    upgradeBusy = true;
    try {
      upgradeBundles(repo, ids, { adopt: adoptByPackage(plans, upgradeAdopt) });
    } catch (e: unknown) {
      upgradeError = e instanceof Error ? e.message : String(e);
      return;
    } finally {
      upgradeBusy = false;
      syncDocument();
    }
    if (openEditor) editorMode = openEditor;
    upgradeFlow = null;
  }

  function reviewEditorUpgrade(id: string): void {
    const upgrade = offeredEditors.find((o) => o.editor.id === id)?.unmet?.upgrade;
    if (upgrade) reviewUpgrade(upgrade.map((r) => r.packageId), id);
  }

  // ---------------------------------------------------------------------------
  // Create new repository (srs-web#141, #341)
  // ---------------------------------------------------------------------------

  /**
   * Build a new repository in memory: the first chosen editor with a `seed` (transitional,
   * srs#390) or a blank repo, every other chosen editor's bundles installed, then each
   * editor's `create` hook. All semantics are in the WASM core. Nothing is persisted or
   * downloaded: the repo has no storage handle, so the first Save asks where to put it
   * (saveTo). A throw leaves the app idle with the error shown in the panel. The first
   * chosen editor (EDITORS order) opens.
   */
  async function createRepository(name: string, editorIds: string[]): Promise<void> {
    const chosen = EDITORS.filter((e) => editorIds.includes(e.id));
    const seeded = chosen.filter((e) => e.seed);
    if (seeded.length > 1) {
      throw new Error(`${seeded.map((e) => e.label).join(" and ")} cannot start the same repository.`);
    }
    const newRepo = seeded[0]?.seed?.(name) ?? createBlankRepository(name);
    installBundles(
      newRepo,
      chosen.filter((e) => !e.seed).flatMap((e) => e.requires.map((r) => r.packageId))
    );
    for (const editor of chosen) await editor.create?.(newRepo);

    repo = newRepo;
    activeDocument = null;
    readOnlyHost = null;
    beginDocument();
    repoName = name;
    editorMode = chosen[0]?.id ?? "generic";
    cachedSession = null;
    appState = "loaded";
  }

  // ---------------------------------------------------------------------------
  // Document loading — archive (.srs)
  // ---------------------------------------------------------------------------

  async function loadArchiveDocument(bytes: Uint8Array, name: string, fromHost: string | null = null): Promise<void> {
    errorMsg = null;
    readOnlyHost = fromHost;
    try {
      const loaded = loadRepoFromArchive(bytes);
      repo = loaded;
      gateOnMigration(loaded, name, (dirty) => {
        repo = loaded;
        beginDocument({ dirty });
        activeDocument = null;
        repoName = stripSrsExtension(name);
        cachedSession = null;
        if (dirty) {
          saveToast("info", "Migrated to the current data model. Unsaved - export to keep it.", 8000);
          if (!readOnlyHost) saveWorkingCopy(repoName, exportSrsj(loaded));
        }
        appState = "loaded";
      });
    } catch (e: unknown) {
      repo = null;
      readOnlyHost = null;
      throw new Error(
        `Failed to load archive: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Open from a link (?open=<https url>, #471)
  // ---------------------------------------------------------------------------

  /**
   * Fetch the archive and hand it to the same loaders as a file from this device, read-only. The
   * parameter is removed from the address bar first (success or not), so a refresh never re-fetches
   * by surprise: it lands on the picker, and a failed link is not retried in a loop.
   */
  async function openFromUrl(raw: string): Promise<void> {
    try {
      const url = parseOpenUrl(raw);
      openingHost = url.host;
      const file = await fetchArchiveFile(url);
      await openLocalFile(file, {
        onOpen: (handle) => loadDocument(handle, url.host),
        onOpenArchive: (bytes, name) => loadArchiveDocument(bytes, name, url.host),
      });
    } finally {
      openingHost = null;
    }
  }

  /** `?open=`: the one shared path, with a failure taking the whole page (the chooser shows it inline instead). */
  async function openFromLink(raw: string): Promise<void> {
    history.replaceState(history.state, "", withoutOpenParam(location.href));
    try {
      await openFromUrl(raw);
    } catch (e: unknown) {
      errorMsg = e instanceof Error ? e.message : String(e);
      appState = "error";
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  function handleExport() {
    if (!repo) return;
    const json = exportSrsj(repo);
    downloadDocument(json, `${repoName}.srsj`);
  }

  function handleExportArchive() {
    if (!repo) return;
    downloadArchive(exportArchive(repo), `${repoName}.srs`);
  }

  // ---------------------------------------------------------------------------
  // Save (write back to the opened cloud/git document)
  // ---------------------------------------------------------------------------

  /** The toast for a completed save: success, or info when newer changes remain unsaved. */
  function savedMessage(current: boolean, text = "Saved."): [NoticeKind, string] {
    return current ? ["success", text] : ["info", `${text} Newer changes remain unsaved.`];
  }

  function saveErrorMessage(e: unknown): string {
    const code =
      e instanceof StorageError
        ? e.code
        : typeof e === "object" && e !== null && "code" in e
          ? (e as { code?: string }).code
          : null;
    if (code === "conflict") {
      return "This file changed since you opened it. Use “Open another file” to reload the latest version, then re-apply your edits.";
    }
    return `Save failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  /**
   * Save the current repo back to its source document. Git-backed handles open a
   * dialog (branch choice + install hint); other cloud handles write directly.
   */
  async function handleSave(): Promise<void> {
    if (saving || !repo) return;
    if (!activeDocument) {
      // No storage handle yet (new repository or restored session): ask where to save.
      saveToError = null;
      saveToOpen = true;
      return;
    }
    if (!activeDocument.capabilities.write) return;
    if (isGitBranchAware(activeDocument)) {
      gitSaveError = null;
      gitSaveOpen = true;
      return;
    }
    await saveDirect();
  }

  /** Document > Save a copy… of a read-only repository: the same destination choice as a first save. */
  function saveCopy(): void {
    saveToError = null;
    saveToOpen = true;
  }

  /** First save of a handle-less document: download it, or create a file in a cloud provider. */
  async function saveTo(destination: "local" | "dropbox" | "google-drive"): Promise<void> {
    if (!repo) return;
    const repository = repo;
    syncDocument();
    const saveSnapshot = documentMutations.captureSave();
    const filename = `${slugifyFilename(repoName)}.srs`;
    saving = true;
    saveToError = null;
    try {
      if (destination === "local") {
        // The handle stays null, so the next Save offers the choice again.
        downloadArchive(exportArchive(repository), filename);
        saveToast(...savedMessage(completeDocumentSave(saveSnapshot)));
      } else {
        const provider = destination === "dropbox" ? storageProviders.dropbox : storageProviders.googleDrive;
        if (!provider.create) throw new Error(`${provider.label} cannot create new files.`);
        const handle = await provider.create(filename, exportArchive(repository));
        activeDocument = handle;
        // The copy is the user's own file: edit it from here on (a downloaded copy leaves this one read-only).
        if (readOnlyHost) {
          readOnlyHost = null;
          applyGuards();
        }
        saveToast(...savedMessage(completeDocumentSave(saveSnapshot), `Saved as ${handle.name}.`));
      }
      saveToOpen = false;
    } catch (e: unknown) {
      const code = typeof e === "object" && e !== null && "code" in e ? (e as { code?: string }).code : null;
      if (code !== "cancelled") saveToError = saveErrorMessage(e);
    } finally {
      saving = false;
    }
  }

  /** Direct revision-aware write for non-git cloud handles (Dropbox/Drive). */
  async function saveDirect(): Promise<void> {
    if (!repo || !activeDocument?.capabilities.write) return;
    const repository = repo;
    const handle = activeDocument;
    syncDocument();
    const saveSnapshot = documentMutations.captureSave();
    saving = true;
    try {
      if (handle.kind === "tree") {
        // A tree handle that is not GitBranchAware is an on-device folder
        // (srs-web#248) — write it straight back to disk. This branch must come
        // first: the provider fan-out below ends in GitHub, so a "local" handle
        // falling through would try to create a file on GitHub.
        await (handle as DocumentHandle & RepoTreeAware).commitTree(exportTree(repository));
        saveToast(...savedMessage(completeDocumentSave(saveSnapshot)));
      } else if (handle.kind === "bytes" && handle.writeBytes) {
        await handle.writeBytes(exportArchive(repository), handle.revision);
        saveToast(...savedMessage(completeDocumentSave(saveSnapshot)));
      } else {
        // Auto-upgrade: create a new .srs file and switch the active handle to it.
        const provider =
          handle.provider === "dropbox"
            ? storageProviders.dropbox
            : handle.provider === "google-drive"
              ? storageProviders.googleDrive
              : storageProviders.github;
        if (provider?.create) {
          const newName = toArchiveName(handle.name);
          const newHandle = await provider.create(newName, exportArchive(repository));
          activeDocument = newHandle;
          saveToast(...savedMessage(completeDocumentSave(saveSnapshot), `Saved as ${newHandle.name}.`));
        } else {
          await handle.write(exportSrsj(repository), handle.revision);
          saveToast(...savedMessage(completeDocumentSave(saveSnapshot)));
        }
      }
    } catch (e: unknown) {
      saveToast("error", saveErrorMessage(e));
    } finally {
      saving = false;
    }
  }

  /** Commit a git-backed document to the chosen (or newly created) branch. */
  async function confirmGitSave(opts: {
    mode: "current" | "new";
    newBranch: string;
    message: string;
  }): Promise<void> {
    if (!repo || !isGitBranchAware(activeDocument)) return;
    const repository = repo;
    const handle = activeDocument;
    syncDocument();
    const saveSnapshot = documentMutations.captureSave();
    saving = true;
    gitSaveError = null;
    try {
      const branch = opts.mode === "new" ? opts.newBranch : handle.branch;
      // "new" only truly branches when the name differs from the current branch.
      const branchedOff = opts.mode === "new" && branch !== handle.branch;
      const branchOpts = {
        branch,
        createFromCurrent: opts.mode === "new",
        message: opts.message,
      };
      switch (handle.kind) {
        case "text":
          await handle.saveToBranch(exportSrsj(repository), branchOpts);
          break;
        case "tree":
          await (handle as unknown as DocumentHandle & RepoTreeAware).commitTree(
            exportTree(repository),
            branchOpts
          );
          break;
        default:
          // Not reachable today (no "bytes" handle is also GitBranchAware — GitHub git
          // saves stay "text"-only per ADR-015), but guard explicitly rather than
          // silently falling through and corrupting a binary document.
          throw new Error("Git save is not supported for this document type yet.");
      }
      const saveIsCurrent = completeDocumentSave(saveSnapshot);
      if (branchedOff) {
        saveToast(
          "success",
          `Saved to new branch “${branch}”. Open a pull request on GitHub to merge it.${saveIsCurrent ? "" : " Newer changes remain unsaved."}`,
          8000
        );
      } else saveToast(...savedMessage(saveIsCurrent));
      gitSaveOpen = false;
    } catch (e: unknown) {
      // Keep the dialog open so the install hint stays visible on a permission error.
      gitSaveError = saveErrorMessage(e);
    } finally {
      saving = false;
    }
  }
</script>

<!-- =========================================================================
     Boot state
     ========================================================================= -->
{#if appState === "boot"}
  <div class="splash">
    <p class="splash__status">{openingHost ? `Opening from ${openingHost}…` : "Loading engine…"}</p>
  </div>

<!-- =========================================================================
     Error state
     ========================================================================= -->
{:else if appState === "error"}
  <div class="splash">
    <Notice kind="error">{errorMsg}</Notice>
    <button
      class="splash__retry"
      onclick={() => {
        errorMsg = null;
        appState = "idle";
      }}
    >Try again</button>
  </div>

<!-- =========================================================================
     Idle state — mode picker then file picker
     ========================================================================= -->
{:else if appState === "migrate" && pendingMigration}
  <div class="splash" data-testid="migration-prompt">
    <h1 class="splash__title">Update needed</h1>
    <p class="splash__sub">
      <strong>{pendingMigration.name}</strong> uses an older SRS data model and cannot be
      opened as-is. Migrating updates the working copy (<code>{pendingMigration.ids.join(", ")}</code>). Nothing is saved until you press Save.
    </p>
    {#if migrationError}<Notice kind="error" testid="migration-error">{migrationError}</Notice>{/if}
    <div class="restore-banner__actions">
      <button class="restore-banner__restore" data-testid="migration-apply" onclick={runPendingMigration}>Migrate and open</button>
      <button class="restore-banner__dismiss" data-testid="migration-cancel" onclick={cancelPendingMigration}>Cancel</button>
    </div>
  </div>

{:else if appState === "idle"}
  <div class="splash" data-testid="generic-file-picker">
    <div class="splash__brand"><SrsMark size={28} /><Wordmark size="sm" /></div>
    <h1 class="splash__title">SRS Viewer</h1>
    <p class="splash__sub">Open any <code>.srs</code> or <code>.srsj</code> repository to read its documents, structure, and records.</p>
    {#if cachedSession !== null}
      <div class="restore-banner" role="status">
        <p class="restore-banner__msg">Unsaved session: <strong>{cachedSession.name}</strong></p>
        {#if restoreError}<Notice kind="error">{restoreError}</Notice>{/if}
        <div class="restore-banner__actions">
          <button class="restore-banner__restore" onclick={() => {
            restoreError = null;
            const entry = cachedSession;
            if (!entry) return;
            try {
              const restored = loadRepo(entry.srsj);
              repo = restored;
              readOnlyHost = null;
              gateOnMigration(restored, entry.name, () => {
                repo = restored;
                beginDocument({ dirty: true });
                repoName = entry.name;
                activeDocument = null;
                appState = "loaded";
                editorMode = "generic";
                cachedSession = null;
                saveWorkingCopy(repoName, exportSrsj(restored));
              });
            } catch (e: unknown) {
              clearWorkingCopy();
              restoreError = `Could not restore session: ${e instanceof Error ? e.message : String(e)}`;
            }
          }}>Restore session</button>
          <button class="restore-banner__dismiss" onclick={() => { clearWorkingCopy(); cachedSession = null; restoreError = null; }}>Discard</button>
        </div>
      </div>
    {/if}
    <SourceChooser providers={storageProviders} onOpen={loadDocument} onOpenArchive={loadArchiveDocument} onOpenUrl={openFromUrl} />
    <p class="splash__divider">or start a new repository</p>
    <CreateRepositoryPanel onCreate={createRepository} />
  </div>

<!-- =========================================================================
     Loaded state — generic shell
     ========================================================================= -->
{:else if !activeEditor}
  <GenericSrsShell
    repo={repo!}
    packageEditors={offeredEditors}
    repoName={repoName}
    onExport={handleExportArchive}
    onSave={readOnlyHost ? undefined : activeDocument === null || activeDocument.capabilities.write ? handleSave : undefined}
    readOnly={readOnlyHost !== null}
    onSaveCopy={readOnlyHost ? saveCopy : undefined}
    readOnlyReason={readOnlyHost ? `Opened from ${readOnlyHost}, read-only. Use Document > Save a copy… to keep an editable copy.` : activeDocument?.readOnlyReason ?? null}
    {saving}
    documentDirty={documentDirty}
    documentRevision={documentRevision}
    onOpenEditor={(id) => { editorMode = id; }}
    onInstallEditor={installEditor}
    onReviewUpgrade={reviewEditorUpgrade}
    onOpenPackages={canUpgrade ? () => (packagesOpen = true) : undefined}
    onOpenAgents={openDock}
    onOpenAnother={() => {
      clearWorkingCopy();
      cachedSession = null;
      clearNotices();
      repo = null;
      activeDocument = null;
      appState = "idle";
    }}
  />

<!-- =========================================================================
     Loaded state — registered editor shell (src/lib/editors/registry.ts)
     ========================================================================= -->
{:else}
  {@const Shell = activeEditor!.component}
  <Shell
    repo={repo!}
    repoName={repoName}
    documentProvider={activeDocument?.provider ?? "local"}
    onExport={handleExportArchive}
    onExportSrsj={handleExport}
    onSave={activeDocument === null || activeDocument.capabilities.write ? handleSave : undefined}
    readOnlyReason={activeDocument?.readOnlyReason ?? null}
    saving={saving}
    documentDirty={documentDirty}
    documentRevision={documentRevision}
    onDocumentMutation={syncDocument}
    onAgentWriteGuard={(g, replacing) => {
      if (g === null && replacing && agentGuard !== replacing) return; // a newer guard owns it
      agentGuard = g;
      agentGuardRepo = repo;
      applyGuards();
    }}
    workingCopySaved={workingCopySaved}
    agentPanel={agentLibrary}
    agentStatus={relayList.length > 0 ? agentStatus : undefined}
    onOpenExplorer={() => { editorMode = "generic"; }}
    onOpenAgents={activeEditor!.hostsAgentPanel ? undefined : openDock}
    onOpenPackages={canUpgrade ? () => (packagesOpen = true) : undefined}
    onOpenAnother={() => {
      clearWorkingCopy();
      cachedSession = null;
      repo = null;
      beginDocument();
      activeDocument = null;
      editorMode = "generic";
      appState = "idle";
    }}
  />
{/if}

{#if packagesOpen}
  <PackagesDialog packages={bundledPackages} onUpgrade={(id) => reviewUpgrade([id])} onClose={() => (packagesOpen = false)} />
{/if}
{#if upgradeFlow}
  <UpgradePlan
    plans={upgradeFlow.plans}
    bind:adopt={upgradeAdopt}
    busy={upgradeBusy}
    error={upgradeError}
    onApply={applyUpgrade}
    onCancel={() => { if (!upgradeBusy) upgradeFlow = null; }}
  />
{/if}

{#snippet agentLibrary(ctx?: AgentPanelCtx)}
  <AgentPanel
    relays={relayList}
    agents={panelAgents}
    {ctx}
    now={agentNow}
    onAddRelay={addRelay}
    onUpdateRelay={updateRelay}
    onRemoveRelay={removeRelay}
    onSetDefault={setDefaultRelay}
    onConnectNew={connectAgent}
    onConnect={(id) => { const c = library.find((x) => x.id === id); if (c) void openChannel(c); }}
    onDisconnect={disconnectAgent}
    onForget={forgetAgent}
    onRename={renameAgent}
    onRotate={(id) => {
      // a new channel means new clients
      connections.clearInit(id);
      const { [id]: _gone, ...rest } = clientNames;
      clientNames = rest;
      void hosts.get(id)?.host.rotate();
    }}
    onTakeover={(id) => void hosts.get(id)?.host.takeover()}
    pair={async (id) => {
      const e = hosts.get(id);
      if (!e) throw new Error("No channel yet: connect the agent first.");
      return e.host.pair();
    }}
  />
{/snippet}

<!-- Shells that render `agentPanel` (the essay rail) own its placement; the rest get the floating dock. -->
{#if repo && !activeEditor?.hostsAgentPanel}
  <div class="mcp-dock">
    <Panel title="Agents" persistKey="dock.agents" bind:open={dockOpen}>
      {#snippet actions()}<AgentPresence status={agentStatus} />{/snippet}
      {#if dockOpen}{@render agentLibrary()}{/if}
    </Panel>
  </div>
{/if}

{#if gitSaveOpen && isGitBranchAware(activeDocument)}
  <GitSaveModal
    repoLabel={activeDocument.repoLabel}
    currentBranch={activeDocument.branch}
    installUrl={githubInstallUrl}
    busy={saving}
    error={gitSaveError}
    onSave={confirmGitSave}
    onCancel={() => {
      gitSaveOpen = false;
      gitSaveError = null;
    }}
  />
{/if}

{#if saveToOpen && (!activeDocument || readOnlyHost)}
  <SaveToModal
    providers={storageProviders}
    busy={saving}
    error={saveToError}
    onSave={saveTo}
    onCancel={() => {
      saveToOpen = false;
      saveToError = null;
    }}
  />
{/if}

<style>
  /* ---- Splash / idle ---- */
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    font-family: inherit;
  }

  .splash__brand {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
  }

  .splash__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .splash__sub {
    margin: 0;
    opacity: 0.65;
    max-width: 28rem;
  }

  .splash__divider {
    margin: 0.75rem 0 0;
    opacity: 0.45;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .splash__status {
    opacity: 0.55;
    margin: 0;
  }

  .splash__retry {
    margin-top: 0.5rem;
    cursor: pointer;
  }

  /* ---- Restore banner ---- */
  .restore-banner {
    border: 1px solid var(--accent, #0066cc);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    max-width: 28rem;
    width: 100%;
    text-align: left;
    background: var(--color-surface-2, #f0f6ff);
  }

  .restore-banner__msg {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
  }

  .restore-banner__actions {
    display: flex;
    gap: 0.5rem;
  }

  .restore-banner__restore {
    font-size: 0.8rem;
    padding: 0.3rem 0.75rem;
    background: var(--accent, #0066cc);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .restore-banner__dismiss {
    font-size: 0.8rem;
    padding: 0.3rem 0.75rem;
    background: none;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    cursor: pointer;
  }
</style>
