<script lang="ts">
  import type {
    DocumentHandle,
    StorageEntry,
    StorageProvider,
    StorageProviders,
  } from "$lib/storage/index.js";
  import {
    genericScanForSrs,
    isOpenableName,
    isSrsArchiveName,
    isSrsDocumentName,
    LocalDocumentHandle,
    type ScanMode,
    type ScanOutcome,
    StorageError,
  } from "$lib/storage/index.js";
  import Button from "./Button.svelte";
  import SrsMark from "./SrsMark.svelte";

  interface Props {
    providers: StorageProviders;
    onOpen: (handle: DocumentHandle) => Promise<void>;
    onOpenArchive?: (bytes: Uint8Array, name: string) => Promise<void>;
  }

  let { providers, onOpen, onOpenArchive }: Props = $props();

  type Busy = "local" | "dropbox" | "google-drive" | "github";
  /** Providers that browse a folder tree in the shared modal (list + open). */
  type BrowseId = "dropbox" | "github";
  const BROWSE_LABEL: Record<BrowseId, string> = { dropbox: "Dropbox", github: "GitHub" };

  let busy = $state<Busy | null>(null);
  let error = $state<string | null>(null);

  // Provider-agnostic folder browser, shared by Dropbox and GitHub. The `path`
  // string is opaque to the modal (Dropbox: "/folder"; GitHub: "owner/repo/dir").
  let browsing = $state<BrowseId | null>(null);
  let entries = $state<StorageEntry[] | null>(null);
  let path = $state("");
  let parents = $state<string[]>([]);
  let filter = $state("");
  let showAll = $state(false);

  // Default filter (folders, repositories, and SRS-openable files — providers
  // return complete listings per ADR-018), then the case-insensitive name filter.
  const visibleEntries = $derived.by(() => {
    if (entries === null) return null;
    const relevant = showAll
      ? entries
      : entries.filter((entry) => entry.kind !== "file" || isOpenableName(entry.name));
    const needle = filter.trim().toLowerCase();
    return needle === ""
      ? relevant
      : relevant.filter((entry) => entry.name.toLowerCase().includes(needle));
  });

  // Discovery scan (ADR-018): auto after each listing, explicit via "Scan for SRS".
  // In-flight scans are ignored (not aborted) when the user navigates — `scanRun`
  // is the staleness token.
  let scanOutcome = $state<ScanOutcome | null>(null);
  let scanning = $state(false);
  let scanFailed = $state(false);
  let lastScanMode = $state<ScanMode>("auto");
  let scanRun = 0;

  // Scan results not already on screen, subject to the same name filter.
  const discoveredEntries = $derived.by(() => {
    if (!scanOutcome || entries === null) return [];
    const listedIds = new Set(entries.map((entry) => entry.id));
    const found = scanOutcome.entries.filter((entry) => !listedIds.has(entry.id));
    const needle = filter.trim().toLowerCase();
    return needle === ""
      ? found
      : found.filter((entry) =>
          (entry.displayPath ?? entry.name).toLowerCase().includes(needle)
        );
  });

  // Offer the explicit scan whenever a bigger scan could find more: auto skipped,
  // or auto stopped early. An explicit partial re-run would hit the same budgets.
  const showScanButton = $derived(
    !scanning &&
      scanOutcome !== null &&
      (scanOutcome.status === "skipped" ||
        (scanOutcome.status === "partial" && lastScanMode === "auto"))
  );

  function startScan(mode: ScanMode): void {
    const id = browsing;
    const provider = id ? browseProvider(id) : undefined;
    const seed = entries;
    if (!id || !provider || seed === null) return;
    const token = ++scanRun;
    scanning = true;
    scanFailed = false;
    lastScanMode = mode;
    const request = provider.scanForSrs
      ? provider.scanForSrs(path, mode, seed)
      : genericScanForSrs(provider, path, mode, seed);
    request.then(
      (outcome) => {
        if (token !== scanRun) return; // navigated away — stale result
        scanOutcome = outcome;
        scanning = false;
      },
      () => {
        if (token !== scanRun) return;
        scanFailed = true; // quiet degradation — scanning never blocks browsing
        scanning = false;
      }
    );
  }

  function resetScan(): void {
    scanRun += 1; // invalidate any in-flight scan
    scanOutcome = null;
    scanning = false;
    scanFailed = false;
  }

  function browseProvider(id: BrowseId): StorageProvider | undefined {
    return id === "dropbox" ? providers.dropbox : providers.github;
  }

  async function run(source: Busy, operation: () => Promise<void>): Promise<void> {
    busy = source;
    error = null;
    try {
      await operation();
    } catch (caught) {
      const code = caught instanceof StorageError
        ? caught.code
        : typeof caught === "object" && caught !== null && "code" in caught
          ? caught.code
          : null;
      if (code !== "cancelled") {
        error = caught instanceof Error ? caught.message : String(caught);
      }
    } finally {
      busy = null;
    }
  }

  function handleLocalFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (isSrsArchiveName(file.name) && onOpenArchive) {
      void run("local", async () => {
        const buf = await file.arrayBuffer();
        await onOpenArchive(new Uint8Array(buf), file.name);
      });
    } else {
      void run("local", () => onOpen(new LocalDocumentHandle(file)));
    }
    input.value = "";
  }

  function openBrowser(id: BrowseId): void {
    void run(id, async () => {
      const provider = browseProvider(id);
      if (!provider) return;
      await provider.authenticate();
      // Fetch before mutating view state so a failed list() leaves it untouched.
      const listed = (await provider.list?.("")) ?? [];
      browsing = id;
      path = "";
      parents = [];
      filter = "";
      showAll = false;
      entries = listed;
      resetScan();
      startScan("auto");
    });
  }

  function chooseEntry(entry: StorageEntry): void {
    const id = browsing;
    const provider = id ? browseProvider(id) : undefined;
    if (!id || !provider) return;
    if (entry.kind === "folder") {
      const nextPath = entry.path ?? "";
      void run(id, async () => {
        const listed = (await provider.list?.(nextPath)) ?? [];
        parents = [...parents, path];
        path = nextPath;
        filter = "";
        entries = listed;
        resetScan();
        startScan("auto");
      });
      return;
    }
    if (entry.kind === "repository") {
      void run(id, async () => {
        const handle = await provider.openTree?.(entry);
        if (!handle) return;
        closeBrowser();
        await onOpen(handle);
      });
      return;
    }
    void run(id, async () => {
      const handle = await provider.open(entry);
      closeBrowser();
      await onOpen(handle);
    });
  }

  function goUp(): void {
    const id = browsing;
    const provider = id ? browseProvider(id) : undefined;
    if (!id || !provider) return;
    const next = [...parents];
    const parent = next.pop() ?? "";
    void run(id, async () => {
      const listed = (await provider.list?.(parent)) ?? [];
      parents = next;
      path = parent;
      filter = "";
      entries = listed;
      resetScan();
      startScan("auto");
    });
  }

  function closeBrowser(): void {
    entries = null;
    browsing = null;
    filter = "";
    showAll = false;
    resetScan();
  }

  function openGoogleDrive(): void {
    void run("google-drive", async () => {
      const handle = await providers.googleDrive.select?.();
      if (handle) await onOpen(handle);
    });
  }
</script>

<div class="source-chooser" data-testid="source-chooser">
  <label class="source-chooser__local" class:is-busy={busy === "local"}>
    <span>{busy === "local" ? "Opening…" : "From this device"}</span>
    <input
      id="srsj-file"
      type="file"
      accept=".srsj,.json,.srs"
      onchange={handleLocalFile}
      disabled={busy !== null}
    />
  </label>

  <Button
    variant="secondary"
    data-testid="source-dropbox"
    disabled={!providers.dropbox.configured || busy !== null}
    title={providers.dropbox.configured ? "Open from Dropbox" : "Dropbox is not configured"}
    onclick={() => openBrowser("dropbox")}
  >{busy === "dropbox" ? "Connecting…" : "Dropbox"}</Button>

  <Button
    variant="secondary"
    data-testid="source-google-drive"
    disabled={!providers.googleDrive.configured || busy !== null}
    title={providers.googleDrive.configured ? "Open from Google Drive" : "Google Drive is not configured"}
    onclick={openGoogleDrive}
  >{busy === "google-drive" ? "Connecting…" : "Google Drive"}</Button>

  <Button
    variant="secondary"
    data-testid="source-github"
    disabled={!providers.github?.configured || busy !== null}
    title={providers.github?.configured ? "Open from GitHub" : "GitHub is not configured"}
    onclick={() => openBrowser("github")}
  >{busy === "github" ? "Connecting…" : "GitHub"}</Button>
</div>

{#if error}
  <p class="source-chooser__error" role="alert">{error}</p>
{/if}

{#if entries && browsing}
  <div class="cloud-browser" role="dialog" aria-modal="true" aria-labelledby="cloud-browser-title">
    <div class="cloud-browser__panel">
      <header class="cloud-browser__header">
        <div>
          <span class="cloud-browser__eyebrow">{BROWSE_LABEL[browsing]}</span>
          <h2 id="cloud-browser-title">Choose a repository</h2>
        </div>
        <button
          class="cloud-browser__close"
          aria-label="Close browser"
          onclick={closeBrowser}
        >×</button>
      </header>

      <div class="cloud-browser__path">
        {path || (browsing === "github" ? "All repositories" : "All files")}
      </div>
      <div class="cloud-browser__controls">
        <input
          class="cloud-browser__filter"
          data-testid="cloud-browser-filter"
          type="text"
          placeholder={browsing === "github" && path === "" ? "Filter repositories…" : "Filter…"}
          bind:value={filter}
          aria-label="Filter this folder"
        />
        <label class="cloud-browser__show-all">
          <input type="checkbox" data-testid="cloud-browser-show-all" bind:checked={showAll} />
          Show all files
        </label>
      </div>
      <div class="cloud-browser__scanbar" data-testid="cloud-browser-scanbar">
        {#if scanning}
          <span class="cloud-browser__scan-status">Scanning subfolders…</span>
        {:else if scanFailed}
          <span class="cloud-browser__scan-status">Subfolder scan unavailable.</span>
        {:else if scanOutcome?.status === "partial"}
          <span class="cloud-browser__scan-status">Showing what was found before the scan budget ran out.</span>
        {/if}
        {#if showScanButton}
          <button
            type="button"
            class="cloud-browser__scan-btn"
            data-testid="cloud-browser-scan"
            onclick={() => startScan("explicit")}
          >Scan for SRS</button>
        {/if}
      </div>
      <div class="cloud-browser__list">
        {#if parents.length > 0}
          <button class="cloud-browser__entry" onclick={goUp}>
            <span class="cloud-browser__kind">↑</span>
            <span>Parent folder</span>
          </button>
        {/if}
        {#if discoveredEntries.length > 0}
          <p class="cloud-browser__section" data-testid="cloud-browser-discovered">
            Found in subfolders
          </p>
          {#each discoveredEntries as entry (entry.id)}
            <button
              class="cloud-browser__entry cloud-browser__entry--found"
              onclick={() => chooseEntry(entry)}
            >
              <span class="cloud-browser__kind">{entry.kind === "repository" ? "Repo" : isSrsArchiveName(entry.name) ? "SRS" : "SRSJ"}</span>
              <span class="cloud-browser__name">
                {#if entry.kind === "repository"}<SrsMark />{/if}
                {entry.displayPath ?? entry.name}
              </span>
            </button>
          {/each}
          <p class="cloud-browser__section">In this folder</p>
        {/if}
        {#each visibleEntries ?? [] as entry (entry.id)}
          <button class="cloud-browser__entry" onclick={() => chooseEntry(entry)}>
            <span class="cloud-browser__kind">{entry.kind === "folder" ? "Folder" : entry.kind === "repository" ? "Repo" : isSrsArchiveName(entry.name) ? "SRS" : isSrsDocumentName(entry.name) ? "SRSJ" : "File"}</span>
            <span class="cloud-browser__name">
              {#if entry.kind === "repository"}<SrsMark />{/if}
              {entry.name}
            </span>
          </button>
        {:else}
          <p class="cloud-browser__empty">
            {filter.trim() !== ""
              ? `Nothing matches “${filter.trim()}”.`
              : showAll
                ? "This folder is empty."
                : "No .srs, .srsj, or .json files in this folder."}
          </p>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .source-chooser {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
    gap: 0.75rem;
    width: min(38rem, calc(100vw - 2rem));
    margin-top: 1.5rem;
  }

  .source-chooser :global(.btn),
  .source-chooser__local {
    min-height: 3.25rem;
    display: grid;
    place-items: center;
    padding: 0.75rem 1rem;
    box-sizing: border-box;
  }

  .source-chooser__local {
    border: 1px solid var(--black);
    background: var(--black);
    color: var(--paper);
    cursor: pointer;
    font-family: var(--font-sans);
  }

  .source-chooser__local:hover {
    background: var(--grey-4);
  }

  .source-chooser__local.is-busy {
    opacity: 0.5;
  }

  .source-chooser__local input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .source-chooser__error {
    color: #a22b1f;
    max-width: 38rem;
    margin: 0.75rem 0 0;
    font-size: 0.875rem;
  }

  .cloud-browser {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 1rem;
    background:
      linear-gradient(135deg, rgb(10 20 28 / 82%), rgb(32 22 12 / 78%)),
      repeating-linear-gradient(90deg, transparent 0 24px, rgb(255 255 255 / 3%) 24px 25px);
  }

  .cloud-browser__panel {
    width: min(42rem, 100%);
    max-height: min(42rem, calc(100vh - 2rem));
    overflow: hidden;
    background: var(--paper);
    border: 1px solid var(--black);
    box-shadow: 12px 12px 0 rgb(0 0 0 / 25%);
  }

  .cloud-browser__header {
    display: flex;
    justify-content: space-between;
    gap: 2rem;
    padding: 1.25rem 1.5rem;
    color: var(--paper);
    background: var(--black);
  }

  .cloud-browser__header h2 {
    margin: 0.2rem 0 0;
    font-size: 1.25rem;
  }

  .cloud-browser__eyebrow,
  .cloud-browser__kind,
  .cloud-browser__path {
    font-family: var(--font-mono);
    font-size: var(--size-xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .cloud-browser__close {
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 1.75rem;
    cursor: pointer;
  }

  .cloud-browser__path {
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--grey-2);
    color: var(--grey-3);
  }

  .cloud-browser__controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-bottom: 1px solid var(--grey-2);
  }

  .cloud-browser__filter {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 0.625rem 1.5rem;
    border: 0;
    background: var(--paper);
    font-family: var(--font-sans);
    font-size: 0.9rem;
  }

  .cloud-browser__show-all {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding-right: 1.5rem;
    white-space: nowrap;
    color: var(--grey-3);
    font-family: var(--font-mono);
    font-size: var(--size-xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    cursor: pointer;
  }

  .cloud-browser__filter:focus {
    outline: 2px solid var(--black);
    outline-offset: -2px;
  }

  .cloud-browser__scanbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 1.5rem;
    padding: 0.5rem 1.5rem;
    border-bottom: 1px solid var(--grey-2);
  }

  .cloud-browser__scanbar:empty {
    display: none;
  }

  .cloud-browser__scan-status {
    color: var(--grey-3);
    font-family: var(--font-mono);
    font-size: var(--size-xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .cloud-browser__scan-btn {
    margin-left: auto;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--black);
    background: var(--paper);
    font-family: var(--font-mono);
    font-size: var(--size-xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    cursor: pointer;
  }

  .cloud-browser__scan-btn:hover {
    background: var(--grey-1);
  }

  .cloud-browser__section {
    margin: 0;
    padding: 0.5rem 1.5rem;
    background: var(--grey-1);
    color: var(--grey-3);
    font-family: var(--font-mono);
    font-size: var(--size-xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .cloud-browser__entry--found {
    background: color-mix(in srgb, var(--grey-1) 60%, transparent);
  }

  .cloud-browser__name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .cloud-browser__list {
    max-height: 28rem;
    overflow: auto;
  }

  .cloud-browser__entry {
    width: 100%;
    display: grid;
    grid-template-columns: 5rem 1fr;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border: 0;
    border-bottom: 1px solid var(--grey-2);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .cloud-browser__entry:hover {
    background: var(--grey-1);
  }

  .cloud-browser__kind {
    color: var(--grey-3);
  }

  .cloud-browser__empty {
    padding: 2rem 1.5rem;
    color: var(--grey-3);
  }

  @media (max-width: 640px) {
    .source-chooser {
      grid-template-columns: 1fr;
    }
  }
</style>
