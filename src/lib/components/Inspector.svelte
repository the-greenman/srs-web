<!--
  Inspector — the right rail container holding stacked InspectorSections.
  Includes a drag handle at the left edge to resize the inspector width, and
  supports an `open` prop to override the responsive hide rule (used by
  GuidesShell's narrow-screen toggle).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
  srs-web#39: resizable + narrow-screen toggle
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label = 'Inspector',
    open = false,
    children,
  }: {
    label?: string;
    /** Force-show on narrow screens (overrides the responsive hide). */
    open?: boolean;
    children?: Snippet;
  } = $props();

  let aside: HTMLElement;

  function onDragStart(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = aside.offsetWidth;
    const app = aside.closest<HTMLElement>('.app');

    function onMove(ev: PointerEvent) {
      const delta = startX - ev.clientX;
      const w = Math.max(200, Math.min(640, startW + delta));
      app?.style.setProperty('--inspector-width', `${w}px`);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
</script>

<aside
  class="inspector app__inspector"
  class:inspector--open={open}
  aria-label={label}
  bind:this={aside}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="inspector__drag-handle" onpointerdown={onDragStart} aria-hidden="true"></div>
  {@render children?.()}
</aside>
