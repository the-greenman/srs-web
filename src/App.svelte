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
    repositoryHasAttachments,
    observeWrites,
    exportTree,
    createBlankRepository,
    installBundles,
    neededMigrationIds,
    applyMigration,
    migrationNotice,
    acceptMigration,
  } from "$lib/srs-client.js";
  import { applyActor, onActorChange, refreshSignedInActor } from "$lib/actor.js";
  import type { AgentPanelCtx } from "$lib/agent-activity.js";
  import { AgentLibrary } from "$lib/agent-library.svelte.js";
  import { fetchArchiveFile, parseNewLink, parseOpenUrl, parseRepoLink, withoutBootLinks, type RepoLink } from "$lib/open-url.js";
  import type { GitHubProvider } from "$lib/storage/github.js";
  import { mayKeepWorkingCopy, readOnlyGuard, readOnlyRepo } from "$lib/read-only.js";
  import { listTypes, resolveRepositoryTitle, type AgentWriteGuard, type MigrationNotice, type SrsRepository, type UpgradePackageResult, upgradeBundles } from "$lib/srs-client.js";
    import { loadWorkingCopy, clearWorkingCopy, saveWorkingCopy, workingCopyScheduler } from "$lib/browser-cache.js";
  import {
    describeHandle, loadRecent, recordOpened, removeRecent, saveRecent, toggleStar,
    type RecentRepo,
  } from "$lib/recent-repos.js";
  import type { WorkingCopyEntry } from "$lib/browser-cache.js";
  import { DocumentMutationTracker } from "$lib/document-mutations.js";

  import { EDITORS, availableEditors, creatableEditors, installEditor as installEditorPackages, isBuiltInView, usableEditor, type EditorDefinition } from "$lib/editors/registry.js";
  import { type Address, parseAddress, replaceAddress } from "$lib/address.js";
  import LensShell from "$lib/lens/LensShell.svelte";
  import UpgradePlan from "$lib/components/UpgradePlan.svelte";
  import PackagesDialog from "$lib/components/PackagesDialog.svelte";
  import { installedPackages, upgradeNoticeText } from "$lib/package-upgrade.js";
  import { adoptByPackage } from "$lib/upgrade-plan.js";
  import GenericSrsShell from "$lib/generic/GenericSrsShell.svelte";
  import Landing from "$lib/components/Landing.svelte";
  import LandingFrame from "$lib/components/LandingFrame.svelte";
  import Button from "$lib/components/Button.svelte";
  import GitSaveModal from "$lib/components/GitSaveModal.svelte";
  import SaveToModal from "$lib/components/SaveToModal.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import AgentPresence from "$lib/components/AgentPresence.svelte";
  import AgentPanel from "$lib/components/AgentPanel.svelte";
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
  /** A built-in view ("generic", "lenses": BUILT_IN_VIEWS) or an EditorDefinition id from $lib/editors/registry. */
  type EditorMode = string;

  let appState = $state<AppState>("boot");
  let errorMsg = $state<string | null>(null);
  let editorMode = $state<EditorMode>("generic");

  let repoName = $state<string>("Untitled repository");
  /**
   * The title shown to the user (Toolbar/Nav/breadcrumbs) — srs-web#480: prefers the
   * manifest root container's title or the identity record's label over the opened
   * file/URL name. Deliberately separate from `repoName`, which stays file-derived:
   * `repoName` is also the export/download base name and the working-copy cache key,
   * neither of which should change shape because a record happens to have a title.
   */
  let documentTitle = $state<string>("Untitled repository");
  const storageProviders = createStorageProvidersFromEnv();
  let activeDocument = $state<DocumentHandle | null>(null);
  /**
   * Set (to the source host) while the open repository came from a link and may not be edited (#471).
   * Cleared by every other load path, and by saving a copy to the user's own storage.
   */
  let readOnlyHost = $state<string | null>(null);
  /** `?repo=` deep link (srs-web#530) waiting for the user's click: GitHub sign-in is a popup, so it needs a gesture. */
  let repoLink = $state<RepoLink | null>(null);
  let repoLinkBusy = $state(false);
  let repoLinkError = $state<string | null>(null);
  /** A `?new=` link held back because a recovery copy is waiting (#640): the landing offers both. */
  let pendingNew = $state<EditorDefinition | null>(null);
  let newLinkError = $state<string | null>(null);
  /** Editor to select once the next document has loaded (a deep link's `editor`); dropped if not usable. */
  let pendingEditor = $state<string | null>(null);
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
    if (!activeEditor && !isBuiltInView(editorMode)) editorMode = "generic";
  });

  /**
   * The one hash address and its one listener (ADR-023). Back, Forward, a pasted link and a script
   * writing location.hash all fire popstate; App keeps the parsed address and history.state (the link
   * trail) and chooses the shell: a `lens` key selects Lenses, none leaves Lenses for the explorer.
   * Shells receive both as props and add no listener of their own (Essay's onpopstate is the one
   * stated exception until #426).
   */
  let address = $state<Address>(parseAddress(location.hash));
  let addressState = $state<unknown>(history.state);
  function readAddress(): void {
    address = parseAddress(location.hash);
    addressState = history.state;
  }
  function chooseShellForAddress(): void {
    if (address.lens) editorMode = "lenses";
    else if (editorMode === "lenses") editorMode = "generic";
  }
  function onPopState(): void {
    readAddress();
    if (appState !== "loaded") return;
    chooseShellForAddress();
  }
  /** Opening another repository: a stale lens never applies to a different one. */
  function clearLensAddress(): void {
    const { essayId, paragraphId, zoomId } = parseAddress(location.hash);
    replaceAddress({ essayId, paragraphId, zoomId });
    readAddress();
  }
  // The same lens check runs once after every successful load.
  let addressCheckedFor: SrsRepository | null = null;
  $effect(() => {
    if (appState !== "loaded" || !repo || repo === addressCheckedFor) return;
    addressCheckedFor = repo;
    untrack(() => {
      if (address.lens) editorMode = "lenses";
    });
  });
  $effect(() => {
    if (appState !== "loaded" || !pendingEditor) return;
    editorMode = pendingEditor;
    pendingEditor = null;
  });

  /**
   * Catalog diagnostics from the load-time `validate()` pass (RFC-038 [R24]).
   * Under tree-authoritative storage a malformed or duplicate object is a
   * diagnostic, not a silent omission — the repository still opens, so the
   * only way the user learns an object was rejected is if we show it.
   */

  /** Cached working copy loaded from localStorage on WASM init. */
  let cachedSession = $state<WorkingCopyEntry | null>(null);
  /** Recently opened repositories, starred first (srs-web#661). */
  let recent = $state<RecentRepo[]>([]);
  let recentError = $state<string | null>(null);
  // Edits wait for the stored list to load, so an early open (a ?repo= boot link) is never overwritten by it.
  const recentLoaded = loadRecent().then((list) => {
    recent = list;
  });
  function editRecent(edit: (list: RecentRepo[]) => RecentRepo[]): void {
    void recentLoaded.then(() => {
      recent = edit(recent);
      void saveRecent(recent);
    });
  }
  let restoreError = $state<string | null>(null);

  /**
   * Revision gate (srs-web#334, #583, #611). Two shapes, one prompt:
   * - a tree (folder, GitHub, Dropbox) below the engine's revision loads but the engine refuses
   *   every read until the revision migrations are applied (`ids`);
   * - a pre-10 .srsj/.srs is migrated in memory on open and carries a `migrationNotice`
   *   (`sourceRevision` set): reads work, every write is refused until `acceptMigration`.
   * The load is held here and the user is asked. `finish(dirty)` is the load path's own
   * completion step; it runs after migrate (dirty=true, the migrated working copy is unsaved
   * until Save), after "open read-only" (dirty=false) or immediately when nothing is needed.
   */
  type MigrationOffer = { repo: SrsRepository; name: string; ids: string[]; sourceRevision?: number; finish: (dirty: boolean) => void };
  let pendingMigration = $state<MigrationOffer | null>(null);
  let migrationError = $state<string | null>(null);
  /** The open document's unanswered in-memory offer (declined, or not yet answered): offered again on a refused write. */
  let migrationOffer: MigrationOffer | null = null;
  /** `readOnlyHost` for a document whose in-memory migration was declined. */
  const MIGRATION_DECLINED = "migration-declined";
  const readOnlyText = $derived(
    readOnlyHost === MIGRATION_DECLINED
      ? "Not migrated: this document uses an older SRS data model, so it is read-only. Open (or restore) it again and choose Migrate to edit it, or save a copy."
      : readOnlyHost
        ? `Opened from ${readOnlyHost}, read-only. Use Document > Save a copy… to keep an editable copy.`
        : null
  );

  function gateOnMigration(loaded: SrsRepository, name: string, finish: (dirty: boolean) => void): void {
    migrationOffer = null; // a new document: an earlier one's offer never applies to it
    // rfc043 (7 -> 8), rfc046 (8 -> 9), rfc052 (9 -> 10) and rfc051 (10 -> 11).
    let ids: string[];
    let notice: MigrationNotice | null;
    try {
      ids = neededMigrationIds(loaded);
      notice = ids.length ? null : migrationNotice(loaded);
    } catch (e) {
      // Unknown revision state: do not open (no actor, no writes) and say why.
      repo = null;
      errorMsg = `Could not determine whether this repository needs migration: ${e instanceof Error ? e.message : String(e)}`;
      appState = "error";
      return;
    }
    if (notice && readOnlyHost) {
      // Opened from a link: nowhere to save it back, so migrate silently in memory, never dirty (#478).
      acceptMigration(loaded);
      finish(false);
    } else if (ids.length || notice) {
      offerMigration({ repo: loaded, name, ids: notice?.migrations ?? ids, sourceRevision: notice?.sourceRevision, finish });
    } else {
      finish(false);
    }
  }

  function offerMigration(offer: MigrationOffer): void {
    pendingMigration = offer;
    if (offer.sourceRevision !== undefined) migrationOffer = offer;
    repo = null; // not opened (no MCP session etc.) until the user answers
    migrationError = null;
    appState = "migrate";
  }

  /** A write refused with `migration-required-before-write` (srs-rust#1454): ask instead of failing. */
  function onMigrationRequired(): void {
    if (migrationOffer) offerMigration(migrationOffer);
  }

  function runPendingMigration(): void {
    const pending = pendingMigration;
    if (!pending) return;
    try {
      if (pending.sourceRevision !== undefined) {
        acceptMigration(pending.repo);
        migrationOffer = null;
        if (readOnlyHost === MIGRATION_DECLINED) readOnlyHost = null;
      } else {
        // Each id is re-checked after the previous one (rfc046 requires rfc043 first).
        for (const id of pending.ids) {
          if (neededMigrationIds(pending.repo).includes(id)) applyMigration(pending.repo, id);
        }
      }
    } catch (e: unknown) {
      // All-or-nothing in the engine: nothing was written. Keep the prompt up.
      migrationError = `Migration failed: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    pendingMigration = null;
    // Read-only: migrate silently in memory, never dirty — there is nowhere to save it (#478).
    pending.finish(!readOnlyHost);
  }

  /** Decline an in-memory migration: open the document unchanged and read-only, no write attempted. */
  function openPendingReadOnly(): void {
    const pending = pendingMigration;
    if (!pending) return;
    pendingMigration = null;
    readOnlyHost = MIGRATION_DECLINED;
    pending.finish(false);
  }

  function cancelPendingMigration(): void {
    pendingMigration = null;
    migrationOffer = null;
    pendingEditor = null;
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
    pendingNew = null; // a document opened: a held ?new offer, and any ?new error, are spent
    newLinkError = null;
    // Every load path passes through here: from now on each engine write reports itself.
    if (repo) {
      if (readOnlyHost) repo = readOnlyRepo(repo, () => readOnlyHost !== null);
      repo = observeWrites(repo, syncDocument, onMigrationRequired);
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
    const r = repo;
    if (r && mayKeepWorkingCopy(readOnlyHost, documentMutations.dirty)) {
      void saveWorkingCopy(repoName, () => exportArchive(r)).then((ok) => {
        if (r === repo) workingCopySaved = ok;
      });
    }
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
      void clearWorkingCopy();
    }
    return savedCurrentRevision;
  }

  // ---------------------------------------------------------------------------
  // MCP relay (srs-web#307). Enabled only when a relay origin is configured.
  // The Rust/WASM McpSession owns all MCP semantics; this only hosts it. MCP
  // writes mark the document unsaved via syncDocument and never call
  // a storage provider — persistence stays an explicit Save/Export.
  // ---------------------------------------------------------------------------

  // The active shell declares the agent write guard (policy); the engine enforces it. Kept here
  // so it is also applied to a session attached after the guard was set.
  let agentGuard: AgentWriteGuard | null = null;
  // Tied to the repository it was declared for, so one repo's ids are never applied to another's session.
  let agentGuardRepo: SrsRepository | null = null;
  /** The guard in force now: the core's read-only guard, else the active shell's, for this repository only. */
  const currentGuard = (): AgentWriteGuard | null =>
    readOnlyHost && repo ? readOnlyGuard(repo) : agentGuard && agentGuardRepo === repo ? agentGuard : null;
  // Relays, saved agents and their sessions (srs-web#603): one controller in $lib for every app.
  const agentLib = new AgentLibrary({ guard: currentGuard, onHandled: () => void syncDocument() });
  $effect(() => {
    const current = repo;
    untrack(() => agentLib.setRepository(current));
  });
  /** The floating dock starts open only once a relay exists: with none it would sit over the page's own controls. */
  let dockOpen = $state(agentLib.relayList.length > 0);
  /** Go > Agents…: expand the dock and focus its first control. */
  async function openDock() {
    dockOpen = true;
    await tick();
    document.querySelector<HTMLElement>('.mcp-dock [data-testid="agent-panel"] button, .mcp-dock [data-testid="agent-panel"] input')?.focus();
  }

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
        const newId = parseNewLink(location.search);
        if (newId === null) {
          try {
            repoLink = parseRepoLink(location.search);
          } catch (e: unknown) {
            repoLinkError = e instanceof Error ? e.message : String(e);
          }
        }
        // Every boot link is read once: none survives to act again on a reload.
        history.replaceState(history.state, "", withoutBootLinks(location.href));
        return loadWorkingCopy().then((cached) => {
          if (cached !== null) {
            cachedSession = cached;
            editorMode = "generic";
          }
          if (newId !== null) {
            // ?new=<editor> (#640): start at once, unless a recovery copy is waiting (never replaced unasked).
            const editor = creatableEditors().find((e) => e.id === newId);
            if (!editor) newLinkError = `"${newId}" is not an editor that can start a new document.`;
            else if (cached === null) return startNew(editor);
            else pendingNew = editor;
          }
          appState = "idle";
        });
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
      gateOnMigration(loaded, handle.name, (migrated) => {
        // A handle that cannot save back (e.g. a folder from <input webkitdirectory>) is never dirty.
        const dirty = migrated && !handle.readOnlyReason;
        repo = loaded;
        activeDocument = handle;
        const remembered = describeHandle(handle);
        if (remembered) editRecent((list) => recordOpened(list, remembered.source, remembered.label, new Date().toISOString()));
        beginDocument({ dirty });
        repoName = stripSrsExtension(handle.name);
        documentTitle = resolveRepositoryTitle(loaded, repoName);
        cachedSession = null;
        if (dirty) {
          saveToast("info", "Migrated to the current data model. Unsaved - Save to keep it.", 8000);
          if (!readOnlyHost) void saveWorkingCopy(repoName, () => exportArchive(loaded));
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
    migrationOffer = null;
    beginDocument();
    repoName = name;
    documentTitle = name;
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
        documentTitle = resolveRepositoryTitle(loaded, repoName);
        cachedSession = null;
        if (dirty) {
          saveToast("info", "Migrated to the current data model. Unsaved - export to keep it.", 8000);
          if (!readOnlyHost) void saveWorkingCopy(repoName, () => exportArchive(loaded));
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
  // Start from a link (?new=<editor>, #640)
  // ---------------------------------------------------------------------------

  /** A new, unsaved document in `editor`, as Start new makes it; a failure lands on the picker with a notice. */
  async function startNew(editor: EditorDefinition): Promise<void> {
    newLinkError = null; // a held offer stays until a document opens (beginDocument), so a failure can be retried
    try {
      await createRepository(`Untitled ${editor.label.toLowerCase()}`, [editor.id]);
    } catch (e: unknown) {
      newLinkError = `Could not start a new ${editor.label.toLowerCase()}: ${e instanceof Error ? e.message : String(e)}`;
      appState = "idle";
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
    history.replaceState(history.state, "", withoutBootLinks(location.href));
    try {
      await openFromUrl(raw);
    } catch (e: unknown) {
      errorMsg = e instanceof Error ? e.message : String(e);
      appState = "error";
    }
  }

  /** Reopen a Recent entry (srs-web#661): GitHub as `openRepoLink` does, sign-in first when needed. */
  async function openRecent(entry: RecentRepo): Promise<void> {
    recentError = null;
    try {
      const github = storageProviders.github as GitHubProvider | undefined;
      if (!github?.configured) throw new Error("GitHub is not configured on this site.");
      await github.authenticate();
      const [repoPart = ""] = entry.source.where.split(":");
      const handle = await github.openTree({
        id: `${entry.source.where}#repo`,
        name: repoPart.split("/").pop() ?? repoPart,
        kind: "repository",
        path: entry.source.where,
        revision: null,
      });
      await loadDocument(handle);
    } catch (e: unknown) {
      recentError = `Could not reopen ${entry.label}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /**
   * `?repo=owner/name[&ref][&path][&editor]` (srs-web#530): the GitHub exploded-tree open, as the picker's
   * "Open as SRS repository" does, with sign-in first when needed; then the named editor if usable.
   */
  async function openRepoLink(link: RepoLink): Promise<void> {
    const github = storageProviders.github as GitHubProvider | undefined;
    if (!github?.configured) {
      repoLinkError = "GitHub is not configured on this site.";
      return;
    }
    repoLinkBusy = true;
    repoLinkError = null;
    try {
      await github.authenticate();
      const branch = link.ref || (await github.defaultBranchOf(link.owner, link.name));
      const where = `${link.owner}/${link.name}:${branch}:${link.path}`;
      const handle = await github.openTree({ id: `${where}#repo`, name: link.name, kind: "repository", path: where, revision: null });
      pendingEditor = link.editor || null;
      await loadDocument(handle);
      repoLink = null;
    } catch (e: unknown) {
      pendingEditor = null;
      repoLinkError = e instanceof Error ? e.message : String(e);
    } finally {
      repoLinkBusy = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  function handleExport() {
    if (!repo) return;
    if (repositoryHasAttachments(repo)) {
      // .srsj is JSON and cannot carry attachment bytes — auto-upgrade to the
      // archive format, the same fallback saveDirect() uses for cloud handles.
      downloadArchive(exportArchive(repo), toArchiveName(repoName));
      saveToast("info", "Exported as .srs — attachments require the archive format.");
      return;
    }
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
          // A declined in-memory migration: the copy was exported current, so the open document is too.
          if (migrationOffer) {
            acceptMigration(repository);
            migrationOffer = null;
          }
          agentLib.applyGuards();
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
          if (repositoryHasAttachments(repository)) {
            // GitHub single-file commits stay .srsj-only (ADR-015, pending Epic 09) —
            // .srsj cannot carry attachment bytes, so tell the user plainly instead
            // of letting export_srsj() throw a raw WASM error.
            throw new StorageError(
              "unsupported",
              "This repository has attachments, which GitHub commits to a single file can't store yet. Keep this repository as an exploded folder (one file per record, so attachments are stored with it) to commit it to GitHub, or use “Export .srs” (Document menu) to download it, or save a copy to Dropbox or Google Drive instead."
            );
          }
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

<svelte:window onpopstate={onPopState} />

<!-- =========================================================================
     Boot state
     ========================================================================= -->
{#if appState === "boot"}
  <LandingFrame>
    <p class="landing__status">{openingHost ? `Opening from ${openingHost}…` : "Loading engine…"}</p>
  </LandingFrame>

<!-- =========================================================================
     Error state
     ========================================================================= -->
{:else if appState === "error"}
  <LandingFrame title="Something went wrong.">
    {#snippet notices()}<Notice kind="error">{errorMsg}</Notice>{/snippet}
    <div class="landing__actions">
      <Button
        onclick={() => {
          errorMsg = null;
          appState = "idle";
        }}
      >Try again</Button>
    </div>
  </LandingFrame>

<!-- =========================================================================
     Migrate state
     ========================================================================= -->
{:else if appState === "migrate" && pendingMigration}
  <LandingFrame
    title="Update needed"
    standfirst="This repository uses an older SRS data model and cannot be opened as-is."
    data-testid="migration-prompt"
  >
    {#snippet notices()}
      {#if migrationError}<Notice kind="error" testid="migration-error">{migrationError}</Notice>{/if}
    {/snippet}
    <p class="landing__status">
      {#if pendingMigration.sourceRevision !== undefined}
        <strong>{pendingMigration.name}</strong> is stored at data-model revision <span data-testid="migration-source-revision">{pendingMigration.sourceRevision}</span>.
        Migrating it (<code>{pendingMigration.ids.join(", ")}</code>) lets you edit it; nothing is saved until you press Save. Or open it read-only, unchanged.
      {:else}
        <strong>{pendingMigration.name}</strong>: migrating updates the working copy (<code>{pendingMigration.ids.join(", ")}</code>). Nothing is saved until you press Save.
      {/if}
    </p>
    <div class="landing__actions">
      <Button variant="primary" data-testid="migration-apply" onclick={runPendingMigration}>Migrate and open</Button>
      {#if pendingMigration.sourceRevision !== undefined}
        <Button data-testid="migration-read-only" onclick={openPendingReadOnly}>Open read-only</Button>
      {/if}
      <Button data-testid="migration-cancel" onclick={cancelPendingMigration}>Cancel</Button>
    </div>
  </LandingFrame>

<!-- =========================================================================
     Idle state — open a repository or start one
     ========================================================================= -->
{:else if appState === "idle"}
  <Landing
    data-testid="generic-file-picker"
    providers={storageProviders}
    onOpen={loadDocument}
    onOpenArchive={loadArchiveDocument}
    onOpenUrl={openFromUrl}
    onCreate={createRepository}
    {recent}
    onOpenRecent={openRecent}
    onToggleStar={(key) => editRecent((list) => toggleStar(list, key))}
    onRemoveRecent={(key) => {
      recentError = null;
      editRecent((list) => removeRecent(list, key));
    }}
    {recentError}
  >
    {#snippet notices()}
      {#if cachedSession !== null}
        <Notice kind="info" testid="restore-notice">
          Unsaved session: <strong>{cachedSession.name}</strong>
          <div class="landing__actions">
            <Button size="sm" variant="primary" data-testid="restore-session" onclick={() => {
            restoreError = null;
            const entry = cachedSession;
            if (!entry) return;
            try {
              const restored = entry.bytes ? loadRepoFromArchive(entry.bytes) : loadRepo(entry.srsj ?? "");
              repo = restored;
              readOnlyHost = null;
              gateOnMigration(restored, entry.name, () => {
                // A restored session is unsaved work, unless its migration was declined (read-only, #611):
                // then it is neither dirty nor written back, so the stored copy stays as it was.
                const editable = !readOnlyHost;
                repo = restored;
                beginDocument({ dirty: editable });
                repoName = entry.name;
                documentTitle = resolveRepositoryTitle(restored, repoName);
                activeDocument = null;
                appState = "loaded";
                editorMode = "generic";
                cachedSession = null;
                if (editable) void saveWorkingCopy(repoName, () => exportArchive(restored));
              });
            } catch (e: unknown) {
              void clearWorkingCopy();
              restoreError = `Could not restore session: ${e instanceof Error ? e.message : String(e)}`;
            }
          }}>Restore session</Button>
            <Button size="sm" data-testid="restore-discard" onclick={() => { void clearWorkingCopy(); cachedSession = null; restoreError = null; pendingNew = null; }}>Discard</Button>
          </div>
        </Notice>
        {#if restoreError}<Notice kind="error" testid="restore-error">{restoreError}</Notice>{/if}
      {/if}
      {#if repoLink}
        {@const link = repoLink}
        <Notice kind="info" testid="repo-link">
          Open <strong>{link.owner}/{link.name}</strong>{link.ref ? ` (${link.ref})` : ""} from GitHub. You sign in to GitHub first if you have not already.
          <div class="landing__actions">
            <Button size="sm" variant="primary" data-testid="repo-link-open" disabled={repoLinkBusy} onclick={() => void openRepoLink(link)}>{repoLinkBusy ? "Opening…" : "Open from GitHub"}</Button>
            <Button size="sm" onclick={() => { repoLink = null; repoLinkError = null; }}>Dismiss</Button>
          </div>
        </Notice>
      {/if}
      {#if pendingNew}
        {@const editor = pendingNew}
        <Notice kind="info" testid="new-link">
          You followed a link to start a new {editor.label.toLowerCase()}. You also have unsaved work in this browser: restore it above, or start the new {editor.label.toLowerCase()} (the unsaved work is replaced once you edit it).
          <div class="landing__actions">
            <Button size="sm" variant="primary" data-testid="new-link-start" onclick={() => void startNew(editor)}>Start a new {editor.label.toLowerCase()}</Button>
            <Button size="sm" onclick={() => { pendingNew = null; }}>Dismiss</Button>
          </div>
        </Notice>
      {/if}
      {#if newLinkError}
        <Notice kind="error" testid="new-link-error">{newLinkError}</Notice>
      {/if}
      {#if repoLinkError}
        <Notice kind="error" testid="repo-link-error">{repoLinkError}</Notice>
      {/if}
    {/snippet}
  </Landing>

<!-- =========================================================================
     Loaded state — the built-in Lenses view (ADR-022, ADR-025)
     ========================================================================= -->
{:else if editorMode === "lenses"}
  <LensShell
    repo={repo!}
    repoName={repoName}
    documentTitle={documentTitle}
    documentProvider={activeDocument?.provider ?? "local"}
    onExport={handleExportArchive}
    onExportSrsj={handleExport}
    onSave={readOnlyHost ? undefined : activeDocument === null || activeDocument.capabilities.write ? handleSave : undefined}
    readOnly={readOnlyHost !== null}
    onSaveCopy={readOnlyHost ? saveCopy : undefined}
    readOnlyReason={readOnlyText ?? activeDocument?.readOnlyReason ?? null}
    {saving}
    documentDirty={documentDirty}
    documentRevision={documentRevision}
    onDocumentMutation={syncDocument}
    onOpenAgents={openDock}
    onOpenPackages={canUpgrade ? () => (packagesOpen = true) : undefined}
    onOpenExplorer={() => {
      readAddress();
      editorMode = "generic";
    }}
    onOpenAnother={() => {
      void clearWorkingCopy();
      cachedSession = null;
      clearNotices();
      clearLensAddress();
      repo = null;
      activeDocument = null;
      editorMode = "generic";
      appState = "idle";
    }}
    {address}
    {addressState}
  />

<!-- =========================================================================
     Loaded state — generic shell
     ========================================================================= -->
{:else if !activeEditor}
  <GenericSrsShell
    repo={repo!}
    packageEditors={offeredEditors}
    repoName={repoName}
    documentTitle={documentTitle}
    onExport={handleExportArchive}
    onSave={readOnlyHost ? undefined : activeDocument === null || activeDocument.capabilities.write ? handleSave : undefined}
    readOnly={readOnlyHost !== null}
    onSaveCopy={readOnlyHost ? saveCopy : undefined}
    readOnlyReason={readOnlyText ?? activeDocument?.readOnlyReason ?? null}
    {saving}
    documentDirty={documentDirty}
    documentRevision={documentRevision}
    onOpenEditor={(id) => { editorMode = id; }}
    onInstallEditor={installEditor}
    onReviewUpgrade={canUpgrade ? reviewEditorUpgrade : undefined}
    onOpenPackages={canUpgrade ? () => (packagesOpen = true) : undefined}
    onOpenAgents={openDock}
    onOpenLenses={() => {
      readAddress();
      editorMode = "lenses";
    }}
    onOpenAnother={() => {
      void clearWorkingCopy();
      cachedSession = null;
      clearNotices();
      clearLensAddress();
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
    documentTitle={documentTitle}
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
      agentLib.applyGuards();
    }}
    workingCopySaved={workingCopySaved}
    agentPanel={agentLibrary}
    agentStatus={agentLib.relayList.length > 0 ? agentLib.status : undefined}
    onOpenExplorer={() => { editorMode = "generic"; }}
    onOpenAgents={activeEditor!.hostsAgentPanel ? undefined : openDock}
    onOpenPackages={canUpgrade ? () => (packagesOpen = true) : undefined}
    onOpenAnother={() => {
      void clearWorkingCopy();
      cachedSession = null;
      clearLensAddress();
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
    relays={agentLib.relayList}
    agents={agentLib.panelAgents}
    {ctx}
    now={agentLib.now}
    onAddRelay={agentLib.addRelay}
    onUpdateRelay={agentLib.updateRelay}
    onRemoveRelay={agentLib.removeRelay}
    onSetDefault={agentLib.setDefaultRelay}
    onConnectNew={agentLib.connectNew}
    onConnect={agentLib.connect}
    onDisconnect={agentLib.disconnect}
    onForget={agentLib.forget}
    onRename={agentLib.rename}
    onRotate={agentLib.rotate}
    onTakeover={agentLib.takeover}
    pair={agentLib.pair}
  />
{/snippet}

<!-- Shells that render `agentPanel` (the essay rail) own its placement; the rest get the floating dock. -->
{#if repo && !activeEditor?.hostsAgentPanel}
  <div class="mcp-dock">
    <Panel title="Agents" persistKey="dock.agents" bind:open={dockOpen}>
      {#snippet actions()}<AgentPresence status={agentLib.status} />{/snippet}
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
