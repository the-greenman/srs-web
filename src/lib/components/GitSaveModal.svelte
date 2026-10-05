<!--
  GitSaveModal.svelte — Save dialog for git-backed documents (GitHub).

  Reuses the SuccessorModal popup pattern. Lets the Clerk commit to the current
  branch or create a new one (handy when the default branch is protected), set a
  commit message, and — since a GitHub App must be *installed* to write — surfaces
  an install/manage link. Presentation only (ADR-001); the write happens in the
  provider's saveToBranch().
-->
<script lang="ts">
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";
  import Input from "./Input.svelte";
  import Notice from "./Notice.svelte";

  interface Props {
    repoLabel: string;
    currentBranch: string;
    /** Link to install/manage the GitHub App, or null when unknown. */
    installUrl: string | null;
    busy: boolean;
    error: string | null;
    onSave: (opts: { mode: "current" | "new"; newBranch: string; message: string }) => void;
    onCancel: () => void;
  }

  const { repoLabel, currentBranch, installUrl, busy, error, onSave, onCancel }: Props = $props();

  let mode = $state<"current" | "new">("current");
  let newBranch = $state("srs-web-edit");
  let message = $state("");

  const canSave = $derived(!busy && (mode === "current" || newBranch.trim() !== ""));

  function submit(): void {
    if (!canSave) return;
    onSave({ mode, newBranch: newBranch.trim(), message: message.trim() });
  }
</script>

<Modal title="Save to GitHub" testid="git-save-modal" {onCancel}>
  <p>Committing to <strong>{repoLabel}</strong>.</p>

  <fieldset>
    <label class="checkbox">
      <input type="radio" name="git-save-mode" value="current" bind:group={mode} data-testid="git-save-mode-current" />
      <span>Commit to <code>{currentBranch}</code></span>
    </label>
    <label class="checkbox">
      <input type="radio" name="git-save-mode" value="new" bind:group={mode} data-testid="git-save-mode-new" />
      <span>Create a new branch</span>
    </label>
    {#if mode === "new"}
      <Input
        bind:value={newBranch}
        placeholder="new-branch-name"
        aria-label="New branch name"
        data-testid="git-save-branch-input"
      />
    {/if}
  </fieldset>

  <Input
    bind:value={message}
    placeholder="Commit message (optional)"
    aria-label="Commit message"
    data-testid="git-save-message-input"
  />

  {#if installUrl}
    <p>
      Save failing with a permission error? The GitHub App must be <strong>installed</strong> on the
      repository's account with Contents write access.
      <a href={installUrl} target="_blank" rel="noopener noreferrer" data-testid="git-save-install-link">
        Install / manage on GitHub →
      </a>
    </p>
  {/if}

  {#if error}
    <Notice kind="error" testid="git-save-error">{error}</Notice>
  {/if}

  {#snippet actions()}
    <Button size="sm" onclick={onCancel} disabled={busy}>Cancel</Button>
    <Button size="sm" variant="primary" onclick={submit} disabled={!canSave} data-testid="git-save-confirm">{busy ? "Saving…" : "Save"}</Button>
  {/snippet}
</Modal>
