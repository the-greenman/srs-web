<!--
  AppShell — the one page frame (#424): a 100dvh grid `nav | main | inspector` where each column
  scrolls itself and the window never does. Nav and inspector are optional snippets; their widths are
  resizable (ResizeHandle) and persisted (columns.ts). Wraps .app (src/styles/layout.css).
  It creates (or receives, `shell`) the ShellState during script init, so every child, a Topbar or a
  trigger, finds it with getShell(). `data-margin` on .app is the ONE Wide carrier: "expanded" only when
  the shell has the Wide capability (`wide`) AND the stored Wide is on.
  B4 viewer shell: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ShellState, setShell } from '../shell-context.svelte.js';

  let {
    nav,
    main,
    inspector,
    wide = false,
    shell: given,
  }: {
    nav?: Snippet;
    main: Snippet;
    inspector?: Snippet;
    /** The shell has the Wide toggle (default false: a stored Wide never changes it). */
    wide?: boolean;
    /** A ShellState made by the shell that builds the Wide action (Essay, Generic). */
    shell?: ShellState;
  } = $props();

  // svelte-ignore state_referenced_locally
  const shell = given ?? new ShellState({ wideEnabled: wide });
  setShell(shell);
  // svelte-ignore state_referenced_locally
  shell.hasNav = !!nav;
  // svelte-ignore state_referenced_locally
  shell.hasInspector = !!inspector;
</script>

<div
  class="app"
  class:app--no-nav={!nav}
  class:app--no-inspector={!inspector}
  data-margin={shell.wideEnabled && shell.wide ? 'expanded' : 'compact'}
  style:--nav-width="{shell.navWidth}px"
  style:--inspector-width="{shell.inspectorWidth}px"
>
  {#if nav}{@render nav()}{/if}
  {@render main()}
  {#if inspector}{@render inspector()}{/if}
</div>
