<!--
  ShellSpecimen — the page frame for /styleguide (#424). A real Toolbar (a long Breadcrumb title, the single Save primary) with the real NavTrigger and
  InspectorTrigger (a ShellState in drawer mode is provided here), the real Nav and Panels, and the
  drawer panel drawn statically over a scrim in a positioned frame: the live Drawer is a modal
  <dialog> (top layer, full viewport) and cannot sit inside a specimen frame. Specimens only.
  `wide` is a separate row: the content cap with Wide off and on (the cap is the --content-max token).
-->
<script lang="ts">
  import { Breadcrumb, Inspector, Nav, NavGroup, NavItem, Panel } from "$lib/components";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import InspectorTrigger from "$lib/components/InspectorTrigger.svelte";
  import NavTrigger from "$lib/components/NavTrigger.svelte";
  import { HEADER_GROUPS } from "$lib/essay/header-actions";
  import { ShellState, setShell } from "$lib/shell-context.svelte";
  import * as fx from "./fixtures";

  let { open }: { open: "none" | "nav" | "inspector" } = $props();

  const shell = new ShellState();
  shell.hasNav = true;
  shell.hasInspector = true;
  shell.navDrawer = true;
  shell.inspectorDrawer = true;
  shell.inspectorBadge = fx.shellFixture.badge;
  setShell(shell);
  const f = fx.shellFixture;
</script>

<div class="sg__shell" data-testid="sg-shell" data-open={open}>
  <Toolbar title={f.repo} groups={HEADER_GROUPS} actions={fx.toolbarActions} tier="narrow">
    {#snippet lead()}<NavTrigger />{/snippet}
    {#snippet titleSlot()}<Breadcrumb items={f.crumb} />{/snippet}
    {#snippet trail()}<InspectorTrigger />{/snippet}
  </Toolbar>
  <p class="sg__shell-main">{f.mainLine}</p>
  {#if open !== "none"}
    <div class="drawer drawer--{open === 'nav' ? 'start' : 'end'} sg__drawer">
      <div class="drawer__panel" class:drawer__panel--dark={open === "nav"} data-part="panel">
        {#if open === "nav"}
          <Nav repo={f.repo}>
            {#snippet children()}
              {#each f.navGroups as g}
                <NavGroup label={g.label}>
                  {#each g.items as i}<NavItem label={i.label} count={i.count} active={i.active} />{/each}
                </NavGroup>
              {/each}
            {/snippet}
          </Nav>
        {:else}
          <Inspector label="Inspector">
            {#each f.panels as p}<Panel title={p.title} aside={p.aside} collapsible={false}><p>{p.body}</p></Panel>{/each}
          </Inspector>
        {/if}
      </div>
    </div>
  {/if}
</div>
