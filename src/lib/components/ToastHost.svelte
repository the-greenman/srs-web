<!--
  ToastHost — the VISUAL toast surface (#441, ADR-020 j), mounted once by Main. A native
  popover="manual" (top layer, out of flow: it never shifts layout and needs no z-index) positioned
  bottom-centre of its own .app__main (placeBottomCentre, bottom edge from visualViewport so it clears the
  mobile keyboard). It carries NO live role: screen readers hear a toast once, from LiveRegions, so
  each row's text is aria-hidden (never the row: it holds the focusable close button).
  Re-stack: a new toast, and a drawer opening, do hidePopover() then showPopover() so the host re-enters
  the top layer above the modal Drawer and its scrim (the live regions are outside, so nothing is
  re-announced). Limitation: while a MODAL drawer is open the toast is visible but inert, so its close
  button cannot be clicked; a sticky error stays until the drawer closes and it is dismissed, or the
  next save (same "save" key) replaces it. Unmount clears the timers (resetNotices). Parts: `host`.
  Wraps .toast (toast.css); tokens `--toast-*`.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { dismiss, toasts } from '../notices.svelte.js';
  import { getShell } from '../shell-context.svelte.js';
  import { isShown, placeBottomCentre } from './popover-position.js';
  import Toast from './Toast.svelte';

  const shell = getShell();
  let host = $state<HTMLDivElement>();

  const show = () => {
    if (host && typeof host.showPopover === 'function' && !isShown(host)) host.showPopover();
  };
  const hide = () => {
    if (host && typeof host.hidePopover === 'function' && isShown(host)) host.hidePopover();
  };
  const restack = () => {
    hide();
    show();
  };

  function place() {
    if (!host || !isShown(host)) return;
    const frame = host.closest('.app__main')?.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewport = {
      width: vv?.width ?? window.innerWidth,
      height: vv?.height ?? window.innerHeight,
      offsetTop: vv?.offsetTop ?? 0,
    };
    const rect = frame ?? { top: 0, left: 0, right: viewport.width, bottom: viewport.height };
    const size = host.getBoundingClientRect();
    const { top, left } = placeBottomCentre(rect, size, viewport);
    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
  }

  // Show while any toast exists. A new toast re-stacks (above any drawer opened since).
  let seen = 0;
  $effect(() => {
    const ids = toasts.map((t) => `${t.id}${t.text}`).join(',');
    const latest = toasts.length ? toasts[toasts.length - 1].id : 0;
    void ids;
    untrack(() => {
      if (!toasts.length) {
        hide();
        return;
      }
      if (latest !== seen) restack();
      else show();
      seen = latest;
      tick().then(place);
    });
  });

  // A drawer opening re-enters the top layer above its dialog and scrim.
  $effect(() => {
    if (shell?.navOpen || shell?.inspectorOpen) {
      tick().then(() => {
        if (toasts.length) {
          restack();
          place();
        }
      });
    }
  });

  onMount(() => {
    const frame = host?.closest('.app__main');
    const ro = typeof ResizeObserver === 'function' && frame ? new ResizeObserver(place) : undefined;
    if (frame) ro?.observe(frame);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
    };
  });
</script>

<div bind:this={host} class="toast-host" popover="manual" data-part="host">
  {#each toasts as t (t.id)}
    <Toast kind={t.kind} text={t.text} testid={t.testid} onDismiss={() => dismiss(t.id)} />
  {/each}
</div>
