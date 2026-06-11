<script lang="ts">
  import type { DocumentHandle, StorageEntry, StorageProviders } from "$lib/storage/index.js";
  import { LocalDocumentHandle, StorageError } from "$lib/storage/index.js";
  import Button from "./Button.svelte";

  interface Props {
    providers: StorageProviders;
    onOpen: (handle: DocumentHandle) => Promise<void>;
  }

  let { providers, onOpen }: Props = $props();

  let busy = $state<"local" | "dropbox" | "google-drive" | null>(null);
  let error = $state<string | null>(null);
  let dropboxEntries = $state<StorageEntry[] | null>(null);
  let dropboxPath = $state("");
  let dropboxParents = $state<string[]>([]);

  async function run(
    source: NonNullable<typeof busy>,
    operation: () => Promise<void>,
  ): Promise<void> {
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

  function openDropbox(): void {
    void run("dropbox", async () => {
      await providers.dropbox.authenticate();
      dropboxPath = "";
      dropboxParents = [];
      dropboxEntries = await providers.dropbox.list?.("") ?? [];
    });
  }

  function chooseDropboxEntry(entry: StorageEntry): void {
    if (entry.kind === "folder") {
      void run("dropbox", async () => {
        dropboxParents = [...dropboxParents, dropboxPath];
        dropboxPath = entry.path ?? "";
        dropboxEntries = await providers.dropbox.list?.(dropboxPath) ?? [];
      });
      return;
    }
    void run("dropbox", async () => {
      const handle = await providers.dropbox.open(entry);
      dropboxEntries = null;
      await onOpen(handle);
    });
  }

  function goUpDropbox(): void {
    const parents = [...dropboxParents];
    const parent = parents.pop() ?? "";
    void run("dropbox", async () => {
      dropboxParents = parents;
      dropboxPath = parent;
      dropboxEntries = await providers.dropbox.list?.(parent) ?? [];
    });
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
    onclick={openDropbox}
  >{busy === "dropbox" ? "Connecting…" : "Dropbox"}</Button>

  <Button
    variant="secondary"
    data-testid="source-google-drive"
    disabled={!providers.googleDrive.configured || busy !== null}
    title={providers.googleDrive.configured ? "Open from Google Drive" : "Google Drive is not configured"}
    onclick={openGoogleDrive}
  >{busy === "google-drive" ? "Connecting…" : "Google Drive"}</Button>
</div>

{#if error}
  <p class="source-chooser__error" role="alert">{error}</p>
{/if}

{#if dropboxEntries}
  <div class="cloud-browser" role="dialog" aria-modal="true" aria-labelledby="dropbox-browser-title">
    <div class="cloud-browser__panel">
      <header class="cloud-browser__header">
        <div>
          <span class="cloud-browser__eyebrow">Dropbox</span>
          <h2 id="dropbox-browser-title">Choose a repository</h2>
        </div>
        <button
          class="cloud-browser__close"
          aria-label="Close Dropbox browser"
          onclick={() => { dropboxEntries = null; }}
        >×</button>
      </header>

      <div class="cloud-browser__path">{dropboxPath || "All files"}</div>
      <div class="cloud-browser__list">
        {#if dropboxParents.length > 0}
          <button class="cloud-browser__entry" onclick={goUpDropbox}>
            <span class="cloud-browser__kind">↑</span>
            <span>Parent folder</span>
          </button>
        {/if}
        {#each dropboxEntries as entry (entry.id)}
          <button class="cloud-browser__entry" onclick={() => chooseDropboxEntry(entry)}>
            <span class="cloud-browser__kind">{entry.kind === "folder" ? "Folder" : "SRSJ"}</span>
            <span>{entry.name}</span>
          </button>
        {:else}
          <p class="cloud-browser__empty">No .srsj or .json files in this folder.</p>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .source-chooser {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
