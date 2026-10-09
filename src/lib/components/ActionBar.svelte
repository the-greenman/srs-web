<!--
  ActionBar — the visible decisions of a detail panel. Takes the same MenuAction list as ActionMenu:
  the first action is the primary Button (order marks the recommended one), the next `visible - 1` are
  secondary Buttons, the rest go in an ActionMenu ⋯ (only when any remain). Disabled actions stay
  visible with their reason as the title, as in ActionMenu. Wraps on narrow widths.
  Wraps .action-bar (src/styles/components/action-bar.css). Story: srs-web#532.
-->
<script lang="ts">
  import ActionMenu from './ActionMenu.svelte';
  import Button from './Button.svelte';
  import type { MenuAction } from './menu-action.js';

  let {
    actions,
    visible = 2,
    label,
    testid = 'action-bar',
  }: {
    actions: MenuAction[];
    /** How many actions show as buttons; the rest go in the ⋯. */
    visible?: number;
    /** Names the target for the ⋯ menu's accessible name. */
    label: string;
    testid?: string;
  } = $props();

  const shown = $derived(actions.slice(0, visible));
  const rest = $derived(actions.slice(visible));
</script>

<div class="action-bar" data-testid={testid}>
  {#each shown as a, i (a.id)}
    <Button
      size="sm"
      variant={i === 0 ? 'primary' : 'secondary'}
      disabled={!a.enabled}
      title={a.enabled ? undefined : a.reason}
      data-testid={`${testid}-${a.id}`}
      onclick={a.run}
    >{a.label}</Button>
  {/each}
  {#if rest.length}
    <ActionMenu actions={rest} {label} title="More actions" testid={`${testid}-more`} data-part="more" />
  {/if}
</div>
