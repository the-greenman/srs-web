<!--
  UiSpot — an agent pointing at the writer's screen (ui_highlight, srs-web#643): an outline that follows
  `target` (through the scroll that brought it into view, scrolling and reflow) and the agent's short
  message beside it, for 8 s or until Escape or a click on the message. The outline lets clicks through,
  so the writer can use what it points at. The message is plain text (an agent's words, never markup).
  `rect` with `inline` places a static one for the styleguide specimen. Wraps .ui-spot (ui-spot.css).
-->
<script lang="ts">
  type Rect = { top: number; left: number; width: number; height: number };
  let {
    target,
    rect,
    message,
    onclose,
    inline = false,
  }: {
    target?: HTMLElement;
    rect?: Rect;
    message?: string;
    onclose: () => void;
    inline?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally -- a spot is remounted per highlight; `rect` is the specimen's fixed box
  let box = $state<Rect>(rect ?? { top: 0, left: 0, width: 0, height: 0 });
  $effect(() => {
    if (!target) return;
    let raf = 0;
    const follow = () => {
      const b = target.getBoundingClientRect();
      box = { top: b.top, left: b.left, width: b.width, height: b.height };
      raf = requestAnimationFrame(follow);
    };
    follow();
    const timer = setTimeout(onclose, 8000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<div
  class="ui-spot"
  class:ui-spot--inline={inline}
  data-testid="ui-spot"
  style:top={inline ? undefined : `${box.top}px`}
  style:left={inline ? undefined : `${box.left}px`}
  style:width={`${box.width}px`}
  style:height={`${box.height}px`}
>
  {#if message}
    <button type="button" class="ui-spot__message" data-part="message" aria-label={`${message} (close)`} onclick={onclose}>{message}</button>
  {/if}
</div>
