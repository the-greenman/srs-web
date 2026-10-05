<!--
  Drawer — an off-canvas side panel (#424): the nav or the inspector on a narrow viewport. A native
  modal <dialog>: showModal() gives the focus trap, the inert background, Escape and focus return to
  the invoker for free. Its dismissal model is Popover's (ADR-020 e): Escape and an outside (backdrop)
  click close it and focus returns to the trigger. It is a dialog rather than a popover because it is
  MODAL (trap, inert), which a popover is not; it is the only showModal user (the z-index modals stay
  with #428). Children are rendered ONCE and shown or hidden with showModal/close, so state inside
  survives open and close. `closeOnPick` closes it after choosing a link or button (not a disclosure
  or a menu trigger, which carry aria-expanded, and not inside .nav__foot). happy-dom has no showModal:
  without it the dialog is toggled with a class and inline display. Parts: `scrim` (the dialog, the
  backdrop hit area), `panel`. Wraps .drawer (shell.css); tokens `--shell-*`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { supportsModal } from '../native-support.js';

  let {
    open = $bindable(false),
    side = 'start',
    label,
    id,
    testid,
    dark = false,
    closeOnPick = false,
    children,
  }: {
    open?: boolean;
    /** Which edge it slides from. */
    side?: 'start' | 'end';
    /** Accessible name. Required. */
    label: string;
    id?: string;
    testid?: string;
    /** The panel is the dark nav surface (so the safe-area padding matches). */
    dark?: boolean;
    closeOnPick?: boolean;
    children?: Snippet;
  } = $props();

  const native = supportsModal();
  let dlg = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dlg || !native) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  });

  // Native close (Escape, close()) syncs the bound state back.
  const onclose = () => (open = false);

  function onclick(e: MouseEvent) {
    if (e.target === dlg) {
      open = false; // the backdrop: a click whose target is the dialog itself
      return;
    }
    if (!closeOnPick) return;
    const t = (e.target as Element).closest('a, button, [role="button"], [role="menuitem"]');
    if (t && !t.hasAttribute('aria-expanded') && !t.closest('.nav__foot')) open = false;
  }

  // Fallback has no Escape from the platform.
  const onkeydown = (e: KeyboardEvent) => {
    if (!native && e.key === 'Escape') open = false;
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<dialog
  bind:this={dlg}
  {id}
  class="drawer drawer--{side}"
  class:drawer--open={!native && open}
  data-part="scrim"
  data-testid={testid}
  aria-label={label}
  style:display={native ? undefined : open ? 'block' : 'none'}
  {onclose}
  {onclick}
  {onkeydown}
>
  <div class="drawer__panel" class:drawer__panel--dark={dark} data-part="panel">
    {@render children?.()}
  </div>
</dialog>
