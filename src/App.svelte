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
    createGovernanceDocument,
    neededMigrationIds,
    RFC046_MIGRATION_ID,
    applyMigration,
  } from "$lib/srs-client.js";
  import { applyActor, onActorChange, refreshSignedInActor } from "$lib/actor.js";
  import { acquireChannelLock, releaseChannelLock, channelsInUseElsewhere, connections, credsKey, type AgentConnection } from "$lib/agent-connections.js";
  import { relays } from "$lib/relay-library.js";
  import { observeSession, pushWrite, type AgentPanelCtx, type AgentStatus, type AgentWrite } from "$lib/agent-activity.js";
  import { listRelations, listTypes, type AgentWriteGuard, type McpSession, type SrsRepository } from "$lib/srs-client.js";
    import { loadWorkingCopy, clearWorkingCopy, saveWorkingCopy, workingCopyScheduler } from "$lib/browser-cache.js";
  import type { WorkingCopyEntry } from "$lib/browser-cache.js";
  import { DocumentMutationTracker } from "$lib/document-mutations.js";

  import { availableEditors, usableEditor } from "$lib/editors/registry.js";
  import GenericSrsShell from "$lib/generic/GenericSrsShell.svelte";
  import SourceChooser from "$lib/components/SourceChooser.svelte";
  import CreateGovernanceDocumentPanel from "$lib/components/CreateGovernanceDocumentPanel.svelte";
  import GitSaveModal from "$lib/components/GitSaveModal.svelte";
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
    stripSrsExtension,
    toArchiveName,
    StorageError,
    type DocumentHandle,
    type RepoTreeAware,
    type StorageProviderId,
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

  /** Document-level Save (write-capable cloud/git handles only). */
  let saving = $state(false);
  /** Git Save dialog (branch choice + install hint) state. */
  let gitSaveOpen = $state(false);
  let gitSaveError = $state<string | null>(null);

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
    return repo ? availableEditors(repo, listTypes(repo)) : [];
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
    if (repo && documentMutations.dirty) workingCopySaved = saveWorkingCopy(repoName, exportSrsj(repo));
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
  const setAgentState = (id: string, state: HostState) => {
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
      if (agentGuard && agentGuardRepo === repo) h?.session?.set_write_guard(JSON.stringify(agentGuard));
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
        void h.attach(observeSession(entry.session, conn.id, (w) => (agentWrites = pushWrite(agentWrites, w)), (n) => (clientNames = { ...clientNames, [conn.id]: n }), (id) => listRelations(current as SrsRepository, {}).find((r) => r.relationId === id)?.targetInstanceId));
      }
    } else h.detach();
  }

  /** Open a saved channel in this tab, only if no other tab holds it. */
  async function openChannel(conn: AgentConnection) {
    if (agents.some((a) => a.conn.id === conn.id)) return;
    if (!relays.get(conn.relayId)) return; // unbound or relay missing: cannot connect
    if (!(await acquireChannelLock(conn.id))) return refreshInUse();
    agents = [...agents, { conn, state: { status: "idle", callerUrl: null, error: null } }];
    openAgentSession(conn, repo);
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
  function disconnectAgent(id: string) {
    const h = hosts.get(id);
    h?.host.detach();
    h?.session?.free();
    hosts.delete(id);
    releaseChannelLock(id);
    agents = agents.filter((a) => a.conn.id !== id);
    refreshInUse();
  }
  function forgetAgent(id: string) {
    disconnectAgent(id);
    library = [...connections.remove(id)];
    notify({ kind: "info", key: "agents", text: "Agent forgotten" });
  }

  $effect(() => {
    const current = repo;
    untrack(() => {
      agentWrites = []; // a new repository: earlier writes name instances that are gone
      for (const { conn } of agents) openAgentSession(conn, current);
    });
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

  async function loadDocument(handle: DocumentHandle): Promise<void> {
    errorMsg = null;
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
          saveWorkingCopy(repoName, exportSrsj(loaded));
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

  // ---------------------------------------------------------------------------
  // Create new governance document (srs-web#141)
  // ---------------------------------------------------------------------------

  /**
   * Scaffold a new governance document (all semantics in the WASM
   * `scaffold_new_repository` binding) and persist it to the chosen backend.
   * Throws on failure — the create panel renders the error and the app stays
   * idle; no half-created state is entered.
   */
  async function createDocument(name: string, destination: StorageProviderId): Promise<void> {
    const { repo: newRepo } = createGovernanceDocument(name);
    const filename = `${slugifyFilename(name)}.srs`;

    if (destination === "local") {
      downloadArchive(exportArchive(newRepo), filename);
      activeDocument = null;
    } else {
      // Resolve explicitly so a new provider id can never silently misroute here.
      const provider =
        destination === "dropbox"
          ? storageProviders.dropbox
          : destination === "google-drive"
            ? storageProviders.googleDrive
            : storageProviders.github;
      if (!provider?.create) {
        throw new Error(`${provider?.label ?? destination} cannot create new files.`);
      }
      activeDocument = await provider.create(filename, exportArchive(newRepo));
    }

    repo = newRepo;
    beginDocument();
    repoName = name;
    cachedSession = null;
    appState = "loaded";
  }

  // ---------------------------------------------------------------------------
  // Document loading — archive (.srs)
  // ---------------------------------------------------------------------------

  async function loadArchiveDocument(bytes: Uint8Array, name: string): Promise<void> {
    errorMsg = null;
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
          saveWorkingCopy(repoName, exportSrsj(loaded));
        }
        appState = "loaded";
      });
    } catch (e: unknown) {
      repo = null;
      throw new Error(
        `Failed to load archive: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
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
    if (saving || !repo || !activeDocument?.capabilities.write) return;
    if (isGitBranchAware(activeDocument)) {
      gitSaveError = null;
      gitSaveOpen = true;
      return;
    }
    await saveDirect();
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
    <p class="splash__status">Loading engine…</p>
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
    <SourceChooser providers={storageProviders} onOpen={loadDocument} onOpenArchive={loadArchiveDocument} />
    <p class="splash__divider">or start a governance repository</p>
    <CreateGovernanceDocumentPanel providers={storageProviders} onCreate={createDocument} />
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
    onSave={activeDocument?.capabilities.write ? handleSave : undefined}
    readOnlyReason={activeDocument?.readOnlyReason ?? null}
    {saving}
    documentDirty={documentDirty}
    documentRevision={documentRevision}
    onOpenEditor={(id) => { editorMode = id; }}
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
    onSave={activeDocument?.capabilities.write ? handleSave : undefined}
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
    onRotate={(id) => void hosts.get(id)?.host.rotate()}
    onTakeover={(id) => void hosts.get(id)?.host.takeover()}
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
