<!--
  GitSaveModal.svelte — Save dialog for git-backed documents (GitHub).

  Reuses the SuccessorModal popup pattern. Lets the Clerk commit to the current
  branch or create a new one (handy when the default branch is protected), set a
  commit message, and — since a GitHub App must be *installed* to write — surfaces
  an install/manage link. Presentation only (ADR-001); the write happens in the
  provider's saveToBranch().
-->
<script lang="ts">
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

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="git-save-title" data-testid="git-save-modal">
  <div class="modal-dialog">
    <h2 class="modal-dialog__title" id="git-save-title">Save to GitHub</h2>
    <p class="modal-dialog__body">
      Committing to <strong>{repoLabel}</strong>.
    </p>

    <fieldset class="git-save__branch">
      <label class="git-save__option">
        <input type="radio" name="git-save-mode" value="current" bind:group={mode} data-testid="git-save-mode-current" />
        <span>Commit to <code>{currentBranch}</code></span>
      </label>
      <label class="git-save__option">
        <input type="radio" name="git-save-mode" value="new" bind:group={mode} data-testid="git-save-mode-new" />
        <span>Create a new branch</span>
      </label>
      {#if mode === "new"}
        <input
          class="git-save__input"
          type="text"
          bind:value={newBranch}
          placeholder="new-branch-name"
          aria-label="New branch name"
          data-testid="git-save-branch-input"
        />
      {/if}
    </fieldset>

    <input
      class="git-save__input"
      type="text"
      bind:value={message}
      placeholder="Commit message (optional)"
      aria-label="Commit message"
      data-testid="git-save-message-input"
    />

    {#if installUrl}
      <p class="git-save__hint">
        Save failing with a permission error? The GitHub App must be <strong>installed</strong> on the
        repository's account with Contents write access.
        <a href={installUrl} target="_blank" rel="noopener noreferrer" data-testid="git-save-install-link">
          Install / manage on GitHub →
        </a>
      </p>
    {/if}

    {#if error}
      <p class="git-save__error" role="alert" data-testid="git-save-error">{error}</p>
    {/if}

    <div class="modal-dialog__actions">
      <button class="modal-btn modal-btn--cancel" onclick={onCancel} disabled={busy}>Cancel</button>
      <button
        class="modal-btn modal-btn--primary"
        onclick={submit}
        disabled={!canSave}
        data-testid="git-save-confirm"
      >{busy ? "Saving…" : "Save"}</button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-dialog {
    background: var(--color-surface, #fff);
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 1.5rem;
    max-width: 30rem;
    width: 90vw;
  }

  .modal-dialog__title {
    font-weight: 600;
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .modal-dialog__body {
    font-size: 0.875rem;
    margin: 0 0 1rem;
    opacity: 0.75;
  }

  .git-save__branch {
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    padding: 0.75rem;
    margin: 0 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .git-save__option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .git-save__input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.65rem;
    margin: 0 0 0.75rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 3px;
    font-size: 0.85rem;
    font-family: inherit;
  }

  .git-save__branch .git-save__input {
    margin: 0.25rem 0 0;
  }

  .git-save__hint {
    font-size: 0.75rem;
    margin: 0 0 0.75rem;
    opacity: 0.8;
    line-height: 1.5;
  }

  .git-save__hint a {
    font-weight: 600;
    white-space: nowrap;
  }

  .git-save__error {
    font-size: 0.8rem;
    color: var(--error, #c0392b);
    margin: 0 0 0.75rem;
  }

  .modal-dialog__actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .modal-btn {
    font-size: 0.75rem;
    background: none;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0.3rem 0.65rem;
    cursor: pointer;
    opacity: 0.75;
  }

  .modal-btn:hover {
    opacity: 1;
  }

  .modal-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .modal-btn--primary {
    font-weight: 600;
  }

  .modal-btn--cancel {
    opacity: 0.5;
  }
</style>
