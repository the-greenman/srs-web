<!--
  CreateRepositoryPanel — "Start new" onboarding (srs-web#141, #341, #534).

  Presentation only (ADR-001): the caller owns scaffolding (WASM) and persistence;
  this panel collects a name and the editors to start with. "Blank" (no editor, where
  Install is offered later) is checked while nothing else is, and choosing it clears the
  selection. Creating saves nothing: the repository lives in the browser and the first Save
  asks where to put it (SaveToModal). Wraps .create-panel (create-panel.css).
-->
<script lang="ts">
  import Notice from './Notice.svelte';
  import Button from "./Button.svelte";
  import Input from "./Input.svelte";
  import Checkbox from "./Checkbox.svelte";
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
  const blank = $derived(chosen.length === 0);

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
  <Input
    data-testid="create-name"
    type="text"
    aria-label="Repository name"
    placeholder="Name your repository…"
    bind:value={name}
    disabled={busy}
    onkeydown={(e) => {
      if (e.key === "Enter") void run();
    }}
  />

  <fieldset class="create-panel__editors" disabled={busy}>
    <legend>Start with</legend>
    <Checkbox
      data-testid="create-blank"
      checked={blank}
      onclick={(e) => {
        if (blank) e.preventDefault();
        else chosen = [];
      }}
    >
      <span data-part="text">
        <span data-part="label">Blank</span>
        <span data-part="description">An empty repository. Install an editor later.</span>
      </span>
    </Checkbox>
    {#each editors as editor (editor.id)}
      <Checkbox data-testid="create-editor-{editor.id}" value={editor.id} bind:group={chosen}>
        <span data-part="text">
          <span data-part="label">{editor.label}</span>
          <span data-part="description">{editor.description}</span>
        </span>
      </Checkbox>
    {/each}
  </fieldset>

  <Button
    variant="primary"
    data-testid="create-repository"
    disabled={trimmedName === "" || busy}
    onclick={() => void run()}
  >{busy ? "Creating…" : "Create"}</Button>
  <p class="create-panel__help">Lives in the browser until you save.</p>

  {#if error}
    <Notice kind="error">{error}</Notice>
  {/if}
</div>
