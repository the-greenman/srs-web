<!--
  CreateRepositoryPanel — "New repository" onboarding (srs-web#141, #341).

  Presentation only (ADR-001): the caller owns scaffolding (WASM) and persistence;
  this panel collects a name and the editors to start with (none = a blank repository,
  where Install is offered later). Creating saves nothing: the repository lives in the
  browser and the first Save asks where to put it (SaveToModal).
-->
<script lang="ts">
  import Notice from './Notice.svelte';
  import Button from "./Button.svelte";
  import { creatableEditors } from "$lib/editors/registry.js";

  interface Props {
    onCreate: (name: string, editors: string[]) => Promise<void>;
  }

  let { onCreate }: Props = $props();

  const editors = creatableEditors();

  let name = $state("");
  let chosen = $state<string[]>([]);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const trimmedName = $derived(name.trim());

  async function run(): Promise<void> {
    if (trimmedName === "" || busy) return;
    busy = true;
    error = null;
    try {
      await onCreate(trimmedName, chosen);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }
</script>

<div class="create-panel" data-testid="create-panel">
  <input
    class="create-panel__name"
    data-testid="create-name"
    type="text"
    placeholder="Name your repository…"
    bind:value={name}
    disabled={busy}
    onkeydown={(e) => {
      if (e.key === "Enter") void run();
    }}
  />

  <fieldset class="create-panel__editors" disabled={busy}>
    <legend>Start with</legend>
    {#each editors as editor (editor.id)}
      <label title={editor.description}>
        <input type="checkbox" data-testid="create-editor-{editor.id}" value={editor.id} bind:group={chosen} />
        {editor.label}
      </label>
    {/each}
  </fieldset>

  <Button
    data-testid="create-repository"
    disabled={trimmedName === "" || busy}
    onclick={() => void run()}
  >{busy ? "Creating…" : "Create"}</Button>

  {#if error}
    <Notice kind="error">{error}</Notice>
  {/if}
</div>

<style>
  .create-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(38rem, calc(100vw - 2rem));
    margin-top: 0.5rem;
  }

  .create-panel__name {
    min-height: 3rem;
    padding: 0.75rem 1rem;
    box-sizing: border-box;
    border: 1px solid var(--color-text-strong);
    background: var(--color-bg);
    font-family: var(--font-sans);
    font-size: 1rem;
  }

  .create-panel__editors {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    margin: 0;
    padding: 0;
    border: 0;
    font-family: var(--font-sans);
  }

  .create-panel__editors legend {
    padding: 0;
    margin-bottom: 0.25rem;
    color: var(--color-text-muted, inherit);
  }
</style>
