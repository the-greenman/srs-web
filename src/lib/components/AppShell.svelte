<!--
  AppShell — the one page frame (#424): a 100dvh grid `nav | main | inspector` where each column
  scrolls itself and the window never does. Nav and inspector are optional snippets; their widths are
  resizable (ResizeHandle) and persisted (columns.ts). Wraps .app (src/styles/layout.css).
  At or below DRAWER_NAV the nav, and at or below DRAWER_INSPECTOR the inspector, leave the grid and
  render inside a Drawer (shell-drawer-nav / shell-drawer-inspector); NavTrigger / InspectorTrigger,
  placed by the bar, open them. Crossing a breakpoint remounts that region's content (it moves between
  the column and the dialog); Panels keep their state through persistKey.
  It creates (or receives, `shell`) the ShellState during script init, so every child, a Toolbar or a
  trigger, finds it with getShell(). `data-margin` on .app is the ONE Wide carrier: "expanded" only when
  the shell has the Wide capability (`wideEnabled`) AND the stored Wide is on; otherwise it is set to
  "compact". `shell` takes precedence: a given ShellState carries its own `wideEnabled`, and `wide` only
  applies to a shell that passes none.
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { DRAWER_INSPECTOR, DRAWER_NAV } from '../breakpoints.js';
  import { ShellState, setShell } from '../shell-context.svelte.js';
  import Drawer from './Drawer.svelte';

  let {
    nav,
    main,
    inspector,
    wide = false,
    navLabel = 'Navigation',
    inspectorLabel = 'Inspector',
    shell: given,
  }: {
    nav?: Snippet;
    main: Snippet;
    inspector?: Snippet;
    /** Wide capability, only for a shell that passes no `shell` (a given ShellState has its own `wideEnabled`). Default false: a stored Wide never changes it. */
    wide?: boolean;
    navLabel?: string;
    inspectorLabel?: string;
    /** A ShellState made by the shell that builds the Wide action (Essay, Generic). Takes precedence over `wide`. */
    shell?: ShellState;
  } = $props();

  // svelte-ignore state_referenced_locally
  const shell = given ?? new ShellState({ wideEnabled: wide });
  setShell(shell);
  // Set at init so the bar's triggers are right on first paint, then kept in step (a shell may add or
  // drop its inspector, e.g. the essay once it has something to show).
  // svelte-ignore state_referenced_locally
  shell.hasNav = !!nav;
  // svelte-ignore state_referenced_locally
  shell.hasInspector = !!inspector;
  $effect.pre(() => {
    shell.hasNav = !!nav;
    shell.hasInspector = !!inspector;
  });

  // One matchMedia each, read synchronously (no first-paint flash; this is a SPA, nothing to hydrate).
  const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : undefined);
  const navMq = mq(DRAWER_NAV);
  const inspMq = mq(DRAWER_INSPECTOR);
  shell.navDrawer = !!navMq?.matches;
  shell.inspectorDrawer = !!inspMq?.matches;
  $effect(() => {
    const sn = () => {
      shell.navDrawer = !!navMq?.matches;
      if (!shell.navDrawer) shell.navOpen = false;
    };
    const si = () => {
      shell.inspectorDrawer = !!inspMq?.matches;
      if (!shell.inspectorDrawer) shell.inspectorOpen = false;
    };
    navMq?.addEventListener('change', sn);
    inspMq?.addEventListener('change', si);
    return () => {
      navMq?.removeEventListener('change', sn);
      inspMq?.removeEventListener('change', si);
    };
  });
</script>

<div
  class="app"
  class:app--no-nav={!nav || shell.navDrawer}
  class:app--no-inspector={!inspector || shell.inspectorDrawer}
  data-testid="app-shell"
  data-margin={shell.wideEnabled && shell.wide ? 'expanded' : 'compact'}
  style:--nav-width="{shell.navWidth}px"
  style:--inspector-width="{shell.inspectorWidth}px"
>
  {#if nav}
    {#if shell.navDrawer}
      <Drawer bind:open={shell.navOpen} side="start" dark closeOnPick id="shell-drawer-nav" testid="shell-drawer-nav" label={navLabel}>
        {@render nav()}
      </Drawer>
    {:else}
      {@render nav()}
    {/if}
  {/if}
  {@render main()}
  {#if inspector}
    {#if shell.inspectorDrawer}
      <Drawer bind:open={shell.inspectorOpen} side="end" id="shell-drawer-inspector" testid="shell-drawer-inspector" label={inspectorLabel}>
        {@render inspector()}
      </Drawer>
    {:else}
      {@render inspector()}
    {/if}
  {/if}
</div>
