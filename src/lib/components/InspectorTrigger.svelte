<!--
  InspectorTrigger — the button that opens the inspector drawer (#424), with an activity badge
  (`shell.inspectorBadge`, set by the shell that has such a signal; the shell clears it, this only
  shows it). Renders only while the inspector is a drawer. A Toolbar puts it in `trail`. Wraps IconButton.
-->
<script lang="ts">
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import { getShell } from '../shell-context.svelte.js';
  import IconButton from './IconButton.svelte';

  const shell = getShell();
</script>

{#if shell?.hasInspector && shell.inspectorDrawer}
  <span class="shell-trigger">
    <IconButton
      icon={PanelRight}
      label="Open inspector"
      data-testid="inspector-trigger"
      aria-controls="shell-drawer-inspector"
      aria-expanded={shell.inspectorOpen}
      onclick={() => (shell.inspectorOpen = true)}
    />
    {#if shell.inspectorBadge > 0}
      <span class="shell-trigger__badge" data-testid="inspector-badge" role="status" aria-label="{shell.inspectorBadge} new">{shell.inspectorBadge}</span>
    {/if}
  </span>
{/if}
