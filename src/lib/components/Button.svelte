<!--
  Button — action control. Thin wrapper over .btn / .btn--<variant>
  (src/styles/components/button.css). Forwards native button attributes
  (onclick, type, disabled, ...).
  Foundation B1: https://github.com/the-greenman/srs-web/issues/2
  Import/export actions use variant="mono" — B10:
    https://github.com/the-greenman/srs-web/issues/6
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { ButtonVariant } from '../types';

  let {
    variant = 'secondary',
    size = 'md',
    onDark = false,
    active = false,
    class: klass = '',
    children,
    ...rest
  }: {
    variant?: ButtonVariant;
    /** `sm` is the compact control for rails, trays and panels (wraps its label). */
    size?: 'md' | 'sm';
    /** Style for placement on the dark nav rail / ink header. */
    onDark?: boolean;
    /** Pressed state for the mono toggle variant. */
    active?: boolean;
    class?: string;
    children?: Snippet;
  } & HTMLButtonAttributes = $props();
</script>

<button
  class={`btn btn--${variant} ${klass}`}
  class:btn--sm={size === 'sm'}
  class:btn--on-dark={onDark}
  class:is-active={active}
  {...rest}
>
  {@render children?.()}
</button>
