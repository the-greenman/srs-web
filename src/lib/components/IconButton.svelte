<!--
  IconButton — the one small icon control. A Lucide icon component in a real <button>; `label` is
  required and becomes both the accessible name and the tooltip. Wraps .icon-btn
  (src/styles/components/icon-button.css). Icons are imported per file from
  "@lucide/svelte/icons/<name>" (ADR-020 a). Native button attributes (onclick, data-*, popovertarget,
  aria-*) are forwarded.
-->
<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconComponent } from './icon.js';

  let {
    icon: Icon,
    label,
    size = 'md',
    variant = 'plain',
    pressed,
    ref = $bindable(),
    class: klass = '',
    ...rest
  }: {
    icon: IconComponent;
    /** Accessible name and tooltip. Required. */
    label: string;
    size?: 'sm' | 'md';
    variant?: 'plain' | 'outline';
    /** Renders aria-pressed (a toggle); omit for a plain action. */
    pressed?: boolean;
    /** The underlying <button>, for focus management. */
    ref?: HTMLButtonElement;
    class?: string;
  } & HTMLButtonAttributes = $props();
</script>

<button
  bind:this={ref}
  type="button"
  class={`icon-btn icon-btn--${size} icon-btn--${variant} ${klass}`}
  data-part="icon-btn"
  aria-label={label}
  title={label}
  aria-pressed={pressed}
  {...rest}
>
  <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" />
</button>
