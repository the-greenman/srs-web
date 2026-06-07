<script lang="ts">
  import { initWasm, loadRepo, countRecords } from "$lib/srs-client.js";
  import type { SrsRepository } from "$lib/srs-client.js";

  // ---------------------------------------------------------------------------
  // State (Svelte 5 runes)
  // ---------------------------------------------------------------------------

  let repo = $state<SrsRepository | null>(null);
  let recordCount = $state<number | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let wasmReady = $state(false);

  // ---------------------------------------------------------------------------
  // WASM initialisation
  // ---------------------------------------------------------------------------

  $effect(() => {
    initWasm()
      .then(() => {
        wasmReady = true;
      })
      .catch((e: unknown) => {
        error = `Failed to load WASM module: ${e instanceof Error ? e.message : String(e)}`;
      });
  });

  // ---------------------------------------------------------------------------
  // File picker handler
  // ---------------------------------------------------------------------------

  async function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    error = null;
    repo = null;
    recordCount = null;
    loading = true;

    try {
      const text = await file.text();
      const loaded = loadRepo(text);
      repo = loaded;
      recordCount = countRecords(loaded);
    } catch (e: unknown) {
      error = `Failed to load repository: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      loading = false;
    }
  }
</script>

<main>
  <header>
    <h1>SRS Web</h1>
    <p>Open a <code>.srsj</code> file to inspect a repository.</p>
  </header>

  <section class="file-picker">
    <label for="srsj-file">Repository file (.srsj)</label>
    <input
      id="srsj-file"
      type="file"
      accept=".srsj,.json"
      disabled={!wasmReady || loading}
      onchange={onFileChange}
    />
    {#if !wasmReady && !error}
      <p class="status status--loading">Loading WASM engine…</p>
    {/if}
  </section>

  {#if loading}
    <p class="status status--loading">Loading repository…</p>
  {/if}

  {#if error}
    <p class="status status--error" role="alert">{error}</p>
  {/if}

  {#if repo !== null && recordCount !== null}
    <section class="repo-summary">
      <p class="record-count">
        <strong>{recordCount}</strong>
        {recordCount === 1 ? "record" : "records"}
      </p>
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 40rem;
    margin: 4rem auto;
    padding: 0 1rem;
    font-family: inherit;
  }

  header {
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0 0 0.5rem;
  }

  .file-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .status {
    margin: 0;
    font-size: 0.875rem;
  }

  .status--loading {
    opacity: 0.6;
  }

  .status--error {
    color: #c00;
  }

  .repo-summary {
    border-top: 1px solid currentColor;
    padding-top: 1rem;
  }

  .record-count {
    margin: 0;
    font-size: 1.125rem;
  }
</style>
