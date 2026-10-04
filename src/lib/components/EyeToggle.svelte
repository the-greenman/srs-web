<!--
  EyeToggle — "hide in place" switch. A real <button aria-pressed>; pressed = hidden.
  Wraps .eye (src/styles/components/layers.css); Lucide eye / eye-off. Used by Block and LayersPanel.
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let {
    hidden = false,
    inherited = false,
    label = 'paragraph',
    ...rest
  }: { hidden?: boolean; /** Hidden only by an ancestor: shown greyed, not toggleable. */ inherited?: boolean; label?: string } & HTMLButtonAttributes = $props();
</script>

<button
  type="button"
  class="eye"
  class:is-off={hidden || inherited}
  class:eye--inherited={inherited}
  aria-pressed={hidden || inherited}
  aria-label={inherited ? `${label} is hidden by a parent` : hidden ? `Show ${label}` : `Hide ${label}`}
  title={inherited ? 'Hidden by parent' : hidden ? 'Show' : 'Hide'}
  disabled={inherited}
  {...rest}
>
  {#if hidden || inherited}<EyeOff size={16} aria-hidden="true" />{:else}<Eye size={16} aria-hidden="true" />{/if}
</button>
