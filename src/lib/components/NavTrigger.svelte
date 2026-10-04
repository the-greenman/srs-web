<!--
  NavTrigger — the hamburger that opens the nav drawer (#424). Reads the shell context and renders
  only while the nav is a drawer (a shell without a nav, or a standalone bar, renders nothing).
  A Toolbar puts it in `lead`; Topbar renders it itself. Wraps IconButton.
-->
<script lang="ts">
  import Menu from '@lucide/svelte/icons/menu';
  import { getShell } from '../shell-context.svelte.js';
  import IconButton from './IconButton.svelte';

  const shell = getShell();
</script>

{#if shell?.hasNav && shell.navDrawer}
  <IconButton
    icon={Menu}
    label="Open navigation"
    data-testid="nav-trigger"
    aria-controls="shell-drawer-nav"
    aria-expanded={shell.navOpen}
    onclick={() => (shell.navOpen = true)}
  />
{/if}
