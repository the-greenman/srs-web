<!--
  EyeToggle — "hide in place" switch. A real <button aria-pressed>; pressed = hidden.
  Wraps .eye (src/styles/components/layers.css). Used by Block and LayersPanel.
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let {
    hidden = false,
    label = 'paragraph',
    ...rest
  }: { hidden?: boolean; label?: string } & HTMLButtonAttributes = $props();
</script>

<button
  type="button"
  class="eye"
  class:is-off={hidden}
  aria-pressed={hidden}
  aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
  title={hidden ? 'Show' : 'Hide'}
  {...rest}
>
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {#if hidden}<path d="M3 3l18 18" />{/if}
  </svg>
</button>
