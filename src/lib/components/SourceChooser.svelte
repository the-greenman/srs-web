<script lang="ts">
  import type {
    DocumentHandle,
    StorageEntry,
    StorageProvider,
    StorageProviders,
  } from "$lib/storage/index.js";
  import { LocalDocumentHandle, StorageError } from "$lib/storage/index.js";
  import Button from "./Button.svelte";

  interface Props {
    providers: StorageProviders;
    onOpen: (handle: DocumentHandle) => Promise<void>;
  }

  let { providers, onOpen }: Props = $props();

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

  // Case-insensitive name filter over the current folder's entries.
  const visibleEntries = $derived(
    entries === null
      ? null
      : filter.trim() === ""
        ? entries
        : entries.filter((entry) =>
            entry.name.toLowerCase().includes(filter.trim().toLowerCase())
          )
  );

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
    void run("local", () => onOpen(new LocalDocumentHandle(file)));
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
      entries = listed;
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
    });
  }

  function closeBrowser(): void {
    entries = null;
    browsing = null;
    filter = "";
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
      accept=".srsj,.json"
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
      <input
        class="cloud-browser__filter"
        data-testid="cloud-browser-filter"
        type="text"
        placeholder={browsing === "github" && path === "" ? "Filter repositories…" : "Filter…"}
        bind:value={filter}
        aria-label="Filter this folder"
      />
      <div class="cloud-browser__list">
        {#if parents.length > 0}
          <button class="cloud-browser__entry" onclick={goUp}>
            <span class="cloud-browser__kind">↑</span>
            <span>Parent folder</span>
          </button>
        {/if}
        {#each visibleEntries ?? [] as entry (entry.id)}
          <button class="cloud-browser__entry" onclick={() => chooseEntry(entry)}>
            <span class="cloud-browser__kind">{entry.kind === "folder" ? "Folder" : "SRSJ"}</span>
            <span>{entry.name}</span>
          </button>
        {:else}
          <p class="cloud-browser__empty">
            {filter.trim() === ""
              ? "No .srsj or .json files in this folder."
              : `Nothing matches “${filter.trim()}”.`}
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

  .cloud-browser__filter {
    width: 100%;
    box-sizing: border-box;
    padding: 0.625rem 1.5rem;
    border: 0;
    border-bottom: 1px solid var(--grey-2);
    background: var(--paper);
    font-family: var(--font-sans);
    font-size: 0.9rem;
  }

  .cloud-browser__filter:focus {
    outline: 2px solid var(--black);
    outline-offset: -2px;
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
