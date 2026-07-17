<!--
  Migrations — renders the migration registry for the open repository.
  Calls available_migrations() on mount, shows status badges, and provides
  Apply buttons that invoke apply_migration(id). ADR-001: no SRS semantics here —
  all logic delegated to WASM; this component renders and routes calls only.
  ADR-013: surfaced via the "Repository" NavGroup in GovernanceShell.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    availableMigrations,
    applyMigration,
    type SrsRepository,
    type MigrationSummary,
    type MigrationApplyResult,
  } from '../srs-client.js';

  let {
    repo,
    onMigrationApplied,
  }: {
    repo: SrsRepository;
    onMigrationApplied: () => void;
  } = $props();

  let migrations = $state<MigrationSummary[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let applying = $state<string | null>(null);
  let applyResults = $state<
    Map<string, { ok: true; result: MigrationApplyResult } | { ok: false; error: string }>
  >(new Map());

  onMount(() => {
    loadMigrations();
  });

  async function loadMigrations(): Promise<void> {
    loading = true;
    loadError = null;
    // Yield to the microtask queue so the loading state is rendered before the WASM call.
    await Promise.resolve();
    try {
      migrations = availableMigrations(repo);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handleApply(id: string): Promise<void> {
    applying = id;
    await Promise.resolve();
    try {
      const result = applyMigration(repo, id);
      applyResults = new Map(applyResults).set(id, { ok: true, result });
      onMigrationApplied();
      await loadMigrations();
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      applyResults = new Map(applyResults).set(id, { ok: false, error });
    } finally {
      applying = null;
    }
  }
</script>

<div class="migrations">
  <h2 class="migrations__heading">Migrations</h2>
  {#if loading}
    <p class="migrations__loading">Loading migrations…</p>
  {:else if loadError}
    <p class="migrations__error" role="alert">{loadError}</p>
  {:else if migrations.length === 0}
    <p class="migrations__empty">No migrations available.</p>
  {:else}
    {#each migrations as m (m.id)}
      <div class="migration-row">
        <div class="migration-row__info">
          <span class="migration-row__title">{m.title}</span>
          <span class="migration-row__desc">{m.description}</span>
        </div>
        <div class="migration-row__status">
          {#if m.status.needed}
            <span class="migration-badge migration-badge--needed">Needed</span>
          {:else if m.status.alreadyApplied}
            <span class="migration-badge migration-badge--applied">Applied</span>
          {:else}
            <span class="migration-badge migration-badge--na">N/A</span>
          {/if}
        </div>
        <div class="migration-row__actions">
          <button
            class="migration-row__apply"
            disabled={!m.status.needed || applying !== null}
            onclick={() => handleApply(m.id)}
          >{applying === m.id ? 'Applying…' : 'Apply'}</button>
        </div>
        {#if applyResults.has(m.id)}
          {@const r = applyResults.get(m.id)!}
          {#if r.ok}
            <div class="migration-result migration-result--ok" role="status">
              Applied. <pre class="migration-result__payload">{JSON.stringify(r.result.payload, null, 2)}</pre>
            </div>
          {:else}
            <p class="migration-result migration-result--error" role="alert">Error: {r.error}</p>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .migrations {
    padding: 1.5rem;
  }

  .migrations__heading {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 1rem;
    color: var(--color-fg, inherit);
  }

  .migrations__loading,
  .migrations__empty {
    color: var(--color-muted, #767676);
    font-style: italic;
  }

  .migrations__error {
    color: var(--color-error, #c0392b);
  }

  .migration-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    grid-template-rows: auto auto;
    gap: 0.25rem 0.75rem;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--color-border, #e0e0e0);
  }

  .migration-row__info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .migration-row__title {
    font-weight: 500;
  }

  .migration-row__desc {
    font-size: 0.875rem;
    color: var(--color-muted, #767676);
  }

  .migration-badge {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .migration-badge--needed {
    background: var(--color-warn, #c8a000);
    color: #fff;
  }

  .migration-badge--applied {
    background: var(--color-success, #2a7a2a);
    color: #fff;
  }

  .migration-badge--na {
    background: var(--color-surface-1, #f0f0f0);
    color: var(--color-muted, #767676);
  }

  .migration-row__apply {
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--color-border, #ccc);
    border-radius: 4px;
    cursor: pointer;
    background: var(--color-surface-1, #f5f5f5);
    font-size: 0.875rem;
  }

  .migration-row__apply:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .migration-result {
    grid-column: 1 / -1;
    font-size: 0.875rem;
    padding: 0.4rem 0;
  }

  .migration-result--ok {
    color: var(--color-success, #2a7a2a);
  }

  .migration-result--error {
    color: var(--color-error, #c0392b);
    margin: 0;
  }

  .migration-result__payload {
    display: inline;
    font-family: monospace;
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
