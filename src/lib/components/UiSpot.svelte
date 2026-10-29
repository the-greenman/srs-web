<!--
  UiSpot — an agent pointing at the writer's screen (ui_highlight, srs-web#643): an outline over the
  element's box and the agent's short message beside it. The message is plain text (an agent's
  words, never markup). Click or Escape closes it. `inline` places it in the page flow for the
  styleguide specimen. Wraps .ui-spot (ui-spot.css).
-->
<script lang="ts">
  let {
    rect,
    message,
    onclose,
    inline = false,
  }: {
    rect: { top: number; left: number; width: number; height: number };
    message?: string;
    onclose: () => void;
    inline?: boolean;
  } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="ui-spot"
  class:ui-spot--inline={inline}
  data-testid="ui-spot"
  style:top={inline ? undefined : `${rect.top}px`}
  style:left={inline ? undefined : `${rect.left}px`}
  style:width={`${rect.width}px`}
  style:height={`${rect.height}px`}
  onclick={onclose}
>
  {#if message}<p class="ui-spot__message" role="status" data-part="message">{message}</p>{/if}
</div>
