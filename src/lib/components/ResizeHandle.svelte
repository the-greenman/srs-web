<!--
  ResizeHandle — the one column resizer (#424), used by Nav (right edge) and Inspector (left edge).
  A vertical `separator` you drag, or focus and use the arrow keys: the arrow points the way the
  edge moves, so ArrowRight widens the nav and ArrowLeft widens the inspector (Shift = 64px, else
  16px); Home/End jump to min/max; double-click resets the default. `onchange` fires live, `oncommit`
  once on release or key (persist there). Limits come from the --shell-* tokens (columns.ts).
  Parts: `grip`. Wraps .resize-handle (shell.css).
-->
<script lang="ts">
  import { type Column, clampColumn, limits } from '../columns.js';

  let {
    kind,
    value,
    controls,
    onchange,
    oncommit,
  }: {
    kind: Column;
    /** Current width in px. */
    value: number;
    /** Id of the column element it sizes. */
    controls: string;
    onchange: (px: number) => void;
    oncommit: () => void;
  } = $props();

  // +1: dragging right widens the nav; dragging left widens the inspector.
  const dir = $derived(kind === 'nav' ? 1 : -1);
  const bounds = $derived(limits(kind));
  const label = $derived(kind === 'nav' ? 'Resize navigation' : 'Resize inspector');

  const set = (px: number) => onchange(clampColumn(kind, px));

  function onpointerdown(e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const start = value;
    const move = (ev: PointerEvent) => set(start + dir * (ev.clientX - startX));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      oncommit();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function onkeydown(e: KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16;
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = value + dir * step;
    else if (e.key === 'ArrowLeft') next = value - dir * step;
    else if (e.key === 'Home') next = bounds.min;
    else if (e.key === 'End') next = bounds.max;
    if (next === undefined) return;
    e.preventDefault();
    set(next);
    oncommit();
  }

  function ondblclick() {
    set(bounds.def);
    oncommit();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div
  class="resize-handle resize-handle--{kind}"
  data-part="grip"
  data-testid="{kind}-resize"
  role="separator"
  tabindex="0"
  aria-orientation="vertical"
  aria-label={label}
  aria-controls={controls}
  aria-valuenow={Math.round(value)}
  aria-valuemin={Math.round(bounds.min)}
  aria-valuemax={Math.round(bounds.max)}
  {onpointerdown}
  {onkeydown}
  {ondblclick}
></div>
