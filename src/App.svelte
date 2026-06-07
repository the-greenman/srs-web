<script lang="ts">
import { onMount } from "svelte";
import { type SrsClient, initWasm, loadRepo } from "./lib/srs-client.js";

type Status = "boot" | "idle" | "loaded" | "wasm-error" | "load-error";

let status = $state<Status>("boot");
let errorMsg = $state("");
let client = $state<SrsClient | null>(null);
let recordCount = $state(0);

onMount(async () => {
  try {
    await initWasm();
    status = "idle";
  } catch {
    status = "wasm-error";
    errorMsg =
      "WASM module not found. Build it first: cd srs-rust && wasm-pack build crates/srs-bindings --target web";
  }
});

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const c = loadRepo(text);
    client = c;
    recordCount = c.listRecords().length;
    status = "loaded";
  } catch (e) {
    status = "load-error";
    errorMsg = String(e);
  }
}
</script>

<div class="app">
  <nav class="app__nav">
    <div class="nav">
      <div class="nav__header">
        <span class="nav__wordmark">srs-web</span>
      </div>
      <div class="nav__body">
        <p class="nav__section-label">governance editor</p>
      </div>
    </div>
  </nav>

  <main class="app__main">
    <div class="topbar">
      <div class="topbar__crumb">
        <span class="topbar__crumb-current">governance</span>
      </div>
    </div>
    <div class="workspace">
      <div class="canvas">
        {#if status === 'boot'}
          <p class="t-muted">Loading…</p>

        {:else if status === 'wasm-error'}
          <div class="diag diag--error">
            <span class="diag__label">WASM unavailable</span>
            <p class="diag__message">{errorMsg}</p>
          </div>

        {:else if status === 'load-error'}
          <div class="diag diag--error">
            <span class="diag__label">Load failed</span>
            <p class="diag__message">{errorMsg}</p>
          </div>
          <label class="field" style="margin-top:var(--space-md)">
            <span class="field__label">Try another file</span>
            <input class="field__control" type="file" accept=".srsj,.json" onchange={handleFile} />
          </label>

        {:else if status === 'idle'}
          <div class="section-head">
            <h1 class="section-head__title">Import a governance repository</h1>
          </div>
          <label class="field">
            <span class="field__label">Select .srsj bundle</span>
            <input class="field__control" type="file" accept=".srsj,.json" onchange={handleFile} />
            <p class="field__help">Export a repository with: <code>srs repo copy --from &lt;dir&gt; --to repo.srsj</code></p>
          </label>

        {:else if status === 'loaded'}
          <div class="section-head">
            <h1 class="section-head__title">Repository</h1>
            <span class="section-head__count">{recordCount} records</span>
          </div>
          <p class="t-muted">Viewer and editor coming in B4/B5/B9.</p>
        {/if}
      </div>
    </div>
  </main>

  <aside class="app__inspector">
    <div class="inspector">
      {#if client}
        {@const report = client.validate() as { diagnostics?: Array<{ level: string; message: string }> }}
        <p class="inspector__section-label">Validation</p>
        {#if (report.diagnostics?.length ?? 0) === 0}
          <div class="diag diag--ok"><span class="diag__label">0 issues</span></div>
        {:else}
          {#each (report.diagnostics ?? []) as d}
            <div class="diag diag--{d.level}">
              <span class="diag__label">{d.level}</span>
              <p class="diag__message">{d.message}</p>
            </div>
          {/each}
        {/if}
      {:else}
        <p class="inspector__empty">No repository loaded.</p>
      {/if}
    </div>
  </aside>
</div>
