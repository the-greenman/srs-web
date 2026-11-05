<!--
  LoadProgress — how far along opening a repository is (srs-web#737). A native popover="manual"
  (top layer: above the source browser's modal, no z-index), bottom-centre of the viewport, faded in
  after a delay so a quick open never flashes it. `inline` draws it in flow for /styleguide. The phase
  is announced once (role="status"); the count is not, so a screen reader is not read every file.
  Wraps .load-progress (load-progress.css) on the .toast surface; tokens `--toast-*`.
-->
<script lang="ts">
  import type { LoadPhase } from '../load-progress.svelte.js';

  let {
    phase,
    done = 0,
    total = 0,
    inline = false,
  }: { phase: LoadPhase; done?: number; total?: number; inline?: boolean } = $props();

  const LABELS: Record<LoadPhase, string> = {
    finding: 'Finding files…',
    reading: 'Reading files…',
    preparing: 'Preparing repository…',
  };
  const count = $derived(
    phase === 'reading'
      ? `${done.toLocaleString()} of ${total.toLocaleString()}`
      : phase === 'finding' && done > 0
        ? done.toLocaleString()
        : ''
  );

  /** Native popover, called once on mount: the host exists only while something is loading. */
  function show(el: HTMLElement) {
    if (typeof el.showPopover === 'function') el.showPopover();
  }
</script>

{#snippet row()}
  <div class="toast load-progress__row">
    <span role="status" data-part="label">{LABELS[phase]}</span>
    <span aria-hidden="true" data-part="count" data-testid="load-progress-count">{count}</span>
    {#if phase === 'reading'}
      <progress aria-label={LABELS[phase]} value={done} max={total || 1}></progress>
    {:else}
      <progress aria-label={LABELS[phase]}></progress>
    {/if}
  </div>
{/snippet}

{#if inline}
  <div class="load-progress" data-testid="load-progress">{@render row()}</div>
{:else}
  <div class="load-progress" popover="manual" data-testid="load-progress" use:show>{@render row()}</div>
{/if}
