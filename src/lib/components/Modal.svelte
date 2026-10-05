<!--
  Modal — a titled dialog on the native <dialog>: showModal() on mount gives Escape, the focus trap,
  the inert background and ::backdrop. Escape fires onCancel with the default prevented, so the
  parent decides whether to close (it unmounts the Modal). `inline` renders `<dialog open>` statically
  (no top layer, no trap) for the styleguide specimen. Parts: `title`, `body`, `actions`.
  Wraps .modal (modal.css); tokens `--modal-*`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';
  import { supportsModal } from '../native-support.js';

  let {
    title,
    children,
    actions,
    onCancel,
    testid,
    inline = false,
    ...rest
  }: {
    title: string;
    children?: Snippet;
    actions?: Snippet;
    onCancel?: () => void;
    testid?: string;
    /** Specimen mode: shown statically in the page flow instead of modally. */
    inline?: boolean;
  } & HTMLDialogAttributes = $props();

  const titleId = $props.id();
  let dlg = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dlg || inline) return;
    if (supportsModal()) dlg.showModal();
    else dlg.setAttribute('open', ''); // happy-dom has no showModal
  });
</script>

<dialog
  bind:this={dlg}
  class="modal"
  class:modal--inline={inline}
  open={inline || undefined}
  data-testid={testid}
  aria-labelledby={titleId}
  oncancel={(e) => {
    e.preventDefault();
    onCancel?.();
  }}
  {...rest}
>
  <h2 id={titleId} data-part="title">{title}</h2>
  <div data-part="body">{@render children?.()}</div>
  {#if actions}<div data-part="actions">{@render actions()}</div>{/if}
</dialog>
