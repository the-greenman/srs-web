<!--
  SourceRow — one full-width hairline row that opens a source: icon, label, optional mono hint,
  trailing arrow. States: ready; `busy` (shows `busyLabel`); `unavailable` (muted, disabled, a mono
  "Not set up" tag, `title` says why). `disabled` is for "another source is busy".
  A <button> by default; `as="label"` wraps a hidden file input given as the `control` snippet
  (the webkitdirectory fallback), so the whole row is the picker. Native button attributes
  (data-testid, onclick) land on the button. Wraps .source-row (source-row.css); tokens
  `--source-row-*`; parts `icon label hint tag arrow`.
-->
<script lang="ts">
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconComponent } from './icon.js';

  let {
    icon: Icon,
    label,
    hint,
    busy = false,
    busyLabel = 'Opening…',
    unavailable = false,
    disabled = false,
    as = 'button',
    title,
    control,
    ...rest
  }: {
    icon: IconComponent;
    label: string;
    hint?: string;
    busy?: boolean;
    busyLabel?: string;
    unavailable?: boolean;
    disabled?: boolean;
    as?: 'button' | 'label';
    title?: string;
    /** `as="label"` only: the hidden <input type="file">. */
    control?: Snippet;
  } & Omit<HTMLButtonAttributes, 'title'> = $props();

  const off = $derived(unavailable || disabled);
</script>

{#snippet inner()}
  <span data-part="icon"><Icon size={18} aria-hidden="true" /></span>
  <span data-part="label">{busy ? busyLabel : label}</span>
  {#if unavailable}
    <span data-part="tag">Not set up</span>
  {:else if hint}
    <span data-part="hint">{hint}</span>
  {/if}
  <span data-part="arrow"><ArrowRight size={16} aria-hidden="true" /></span>
{/snippet}

{#if as === 'label'}
  <label class="source-row" class:is-busy={busy} class:is-disabled={off} class:is-unavailable={unavailable} {title}>
    {@render inner()}
    {@render control?.()}
  </label>
{:else}
  <button
    type="button"
    class="source-row"
    class:is-busy={busy}
    class:is-disabled={off}
    class:is-unavailable={unavailable}
    disabled={off}
    {title}
    {...rest}
  >{@render inner()}</button>
{/if}
