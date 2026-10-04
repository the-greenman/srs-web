<!--
  Popover — the one floating-surface primitive (ADR-020 e). The surface is a native HTML `popover`
  (top layer: never clipped by an overflow ancestor, needs no z-index), always rendered and shown or
  hidden with showPopover()/hidePopover(). `mode="auto"` (menus, help): native light-dismiss and
  Escape. `mode="manual"` (hover previews): the host decides when to show or hide.
  Positioning, written once in popover-position.ts: CSS anchor positioning where supported, else
  a small JS placement (below, flip above, clamp; repositions on scroll and resize).
  A trigger never toggles `open` itself: `trigger` receives real `popovertarget` invoker props, the
  browser handles the click, and `open` follows the surface's `toggle` event (so light-dismiss on
  pointerdown cannot be undone by the click that follows it). Focus return relies on the browser's
  native popover focus restoration, plus one fallback for role="menu" (focus ends on <body> when an
  outside click lands on non-focusable text). Where the popover API is missing (happy-dom) the
  surface falls back to an `is-open` class and inline display, and the trigger props carry an onclick.
  Wraps .popover (src/styles/components/popover.css).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { anchorSurfaceStyle, isShown, placeNextTo, supportsAnchor, supportsPopover } from './popover-position.js';
  import type { Placement } from './popover-position.js';

  let {
    open = $bindable(false),
    placement = 'bottom-start',
    mode = 'auto',
    label,
    role = 'dialog',
    onclose,
    anchor,
    id,
    trigger,
    children,
    class: klass = '',
  }: {
    open?: boolean;
    placement?: Placement;
    mode?: 'auto' | 'manual';
    /** Accessible name of the surface. */
    label: string;
    role?: 'menu' | 'dialog' | 'region' | 'tooltip';
    /** Notification only: the surface closed (light-dismiss, Escape or the host). */
    onclose?: () => void;
    /** Position against this element instead of the trigger. */
    anchor?: HTMLElement;
    /** The surface id (invoker target). Generated when omitted. */
    id?: string;
    trigger?: Snippet<[{ open: boolean; toggle: () => void; props: Record<string, unknown> }]>;
    children: Snippet;
    /** Classes on the surface (the wrapper is only an inline-flex shell). */
    class?: string;
  } = $props();

  const uid = $props.id();
  const surfaceId = $derived(id ?? `popover-${uid}`);
  const anchorName = $derived(`--popover-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`);

  let wrap = $state<HTMLElement>();
  let surface = $state<HTMLElement>();
  const native = $derived(supportsPopover(surface));
  const useAnchor = supportsAnchor();
  const anchorEl = $derived(anchor ?? wrap);

  const toggle = () => (open = !open);
  // Native invokers handle the click; only the no-API fallback needs an onclick.
  const triggerProps = $derived({
    popovertarget: surfaceId,
    popovertargetaction: 'toggle',
    'aria-controls': surfaceId,
    'aria-expanded': open,
    ...(native ? {} : { onclick: toggle }),
  });

  const rows = () => Array.from(surface?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
  const triggerEl = () => (anchor ?? (wrap?.firstElementChild as HTMLElement | null) ?? null);

  // Anchor positioning: name the anchor element; the surface refers to it.
  $effect(() => {
    const el = anchorEl;
    if (!useAnchor || !el) return;
    el.style.setProperty('anchor-name', anchorName);
    return () => el.style.removeProperty('anchor-name');
  });
  const surfaceStyle = $derived(
    useAnchor
      ? Object.entries(anchorSurfaceStyle(anchorName, placement)).map(([k, v]) => `${k}:${v}`).join(';')
      : '',
  );

  // Open/close, idempotent: the browser may already have shown it (native invoker, light-dismiss).
  $effect(() => {
    const s = surface;
    if (!s) return;
    if (!supportsPopover(s)) return;
    if (open && !isShown(s)) {
      try {
        s.showPopover();
      } catch {
        /* not connected yet, or already open */
      }
    } else if (!open && isShown(s)) {
      try {
        s.hidePopover();
      } catch {
        /* already hidden */
      }
    }
  });

  // While open: JS placement fallback, and moving focus into the surface.
  $effect(() => {
    const s = surface;
    if (!open || !s) return;
    let stop: (() => void) | undefined;
    const target = anchorEl;
    if (!useAnchor && target && supportsPopover(s)) {
      const place = () => {
        const { top, left } = placeNextTo(
          target.getBoundingClientRect(),
          { width: s.offsetWidth, height: s.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
          placement,
        );
        s.style.top = `${top}px`;
        s.style.left = `${left}px`;
      };
      place();
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);
      stop = () => {
        window.removeEventListener('scroll', place, true);
        window.removeEventListener('resize', place);
      };
    }
    queueMicrotask(() => {
      if (role === 'menu') rows()[0]?.focus({ preventScroll: true });
      else s.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    });
    return stop;
  });

  function ontoggle(e: Event) {
    const next = (e as ToggleEvent).newState === 'open';
    if (next === open) return;
    open = next;
    if (next) return;
    onclose?.();
    // Native restoration only fires when focus was inside; an outside click on text leaves it on <body>.
    if (role === 'menu') {
      const a = document.activeElement;
      if (!a || a === document.body || surface?.contains(a)) triggerEl()?.focus();
    }
  }

  function keydown(e: KeyboardEvent) {
    // Native popovers close on Escape themselves; this is the fallback where the API is missing.
    if (!native && open && e.key === 'Escape') {
      open = false;
      triggerEl()?.focus();
      return;
    }
    if (role !== 'menu' || !open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const r = rows();
      const at = r.indexOf(document.activeElement as HTMLElement);
      r[(at + (e.key === 'ArrowDown' ? 1 : -1) + r.length) % r.length]?.focus();
    } else if (e.key === 'Tab') open = false;
  }
</script>

<div class="popover" bind:this={wrap} data-part="popover">
  {@render trigger?.({ open, toggle, props: triggerProps })}
  <div
    class={`popover__surface ${klass}`}
    class:is-open={open}
    style={surfaceStyle}
    style:display={!native && !open ? 'none' : undefined}
    id={surfaceId}
    popover={mode}
    {role}
    aria-label={label}
    data-part="surface"
    bind:this={surface}
    {ontoggle}
    onkeydown={keydown}
  >
    {@render children()}
  </div>
</div>
