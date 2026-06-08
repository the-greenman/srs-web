<script lang="ts">
  interface Props {
    repoName: string;
    onOpenAnother: () => void;
  }
  let { repoName, onOpenAnother }: Props = $props();
</script>

<div class="guides-shell" data-testid="guides-shell">
  <header class="guides-shell__header">
    <span class="guides-shell__eyebrow">srs · guides</span>
    <h1 class="guides-shell__repo">{repoName}</h1>
    <button class="guides-shell__open-btn" onclick={onOpenAnother}>Open another file</button>
  </header>

  <main class="guides-shell__main">
    <p class="guides-shell__placeholder">
      Guides editor — coming in C8.
    </p>
  </main>
</div>

<style>
  .guides-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--font-sans, sans-serif);
  }
  .guides-shell__header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    background: var(--color-surface-1, #f5f5f5);
    border-bottom: 1px solid var(--color-border, #ddd);
  }
  .guides-shell__eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted, #888);
  }
  .guides-shell__repo {
    flex: 1;
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
  }
  .guides-shell__open-btn {
    font-size: 0.8rem;
    padding: 0.35rem 0.8rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  .guides-shell__main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .guides-shell__placeholder {
    color: var(--color-muted, #888);
    font-size: 0.9rem;
  }
</style>
