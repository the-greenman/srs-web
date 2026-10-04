<!--
  TrayRow — one row of a tray (DraftTray, BinTray): a label that truncates with an ellipsis and an
  `actions` snippet that wraps. `labelProps` is spread on the label (DraftTray puts the drag handle
  there); native attributes (data-testid) go to the row. Wraps .tray__row (draft-tray.css).
  Issue: https://github.com/the-greenman/srs-web/issues/421
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    label,
    labelProps = {},
    actions,
    ...rest
  }: {
    label: string;
    labelProps?: Record<string, unknown>;
    actions?: Snippet;
  } & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class="tray__row" data-part="row" {...rest}>
  <span class="tray__label" data-part="label" title={label} {...labelProps}>{label}</span>
  {#if actions}<div class="tray__actions" data-part="actions">{@render actions()}</div>{/if}
</div>
