<!--
  Toolbar — the generic document bar (#423): a context row (title, status, the primary action) plus
  grouped menus, rendered ONCE from one registry of ToolbarAction (menu-action.ts), whatever the width.
  Tiers (one matchMedia each, from breakpoints.ts; only the active tier's DOM exists, so no action is
  ever rendered twice):
    full    (> rail)   Document / View / Go as labelled menu triggers; a one-action group is an icon.
    compact (<= rail)  the same menus with icon-only triggers (accessible name = group name).
    narrow  (<= phone) title, primary, then ONE overflow menu holding every group as a labelled section.
  That overflow is the toolbar's own; a shell's nav hamburger goes in the `lead` snippet (#424).
  A group with a single action renders as an icon button (it keeps popovertarget/aria-expanded when the
  action carries them), never as a menu. Checkable actions are View-style toggles (menuitemcheckbox); on
  the full and compact tiers choosing one leaves the menu open, in the narrow overflow it closes.
  `tier` forces a tier. The Toolbar never imports from essay/.
  Tokens `--toolbar-*`; parts `bar lead title status primary menu overflow`. Wraps .toolbar (toolbar.css).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { NARROW, RAIL, tierOf } from '../breakpoints.js';
  import type { Tier } from '../breakpoints.js';
  import ActionMenu from './ActionMenu.svelte';
  import Button from './Button.svelte';
  import type { IconComponent } from './icon.js';
  import IconButton from './IconButton.svelte';
  import type { MenuAction, ToolbarAction } from './menu-action.js';

  let {
    title,
    titleSlot,
    status,
    lead,
    actions,
    groups,
    tier: forced,
    root = $bindable(),
  }: {
    /** Document name; the text of the title part unless `titleSlot` replaces it. */
    title: string;
    /** Replaces the title text (an essay picker today, #425's picker later). */
    titleSlot?: Snippet;
    /** Status text/spans (role="status" is the caller's, with its own testids). */
    status?: Snippet;
    /** First in the bar; empty here, #424 places its nav-drawer trigger in it. */
    lead?: Snippet;
    actions: ToolbarAction[];
    /** Menu groups in order: id, label, icon (compact trigger / lone-action icon). */
    groups: { id: string; label: string; icon?: IconComponent }[];
    /** @internal Force a tier; only src/styleguide/ToolbarSpecimen.svelte sets it. */
    tier?: Tier;
    /** The root element, e.g. as a popover anchor. */
    root?: HTMLElement;
  } = $props();

  const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : undefined);
  let narrow = $state(mq(NARROW)?.matches ?? false);
  let rail = $state(mq(RAIL)?.matches ?? false);
  $effect(() => {
    const n = mq(NARROW);
    const r = mq(RAIL);
    const sn = () => (narrow = !!n?.matches);
    const sr = () => (rail = !!r?.matches);
    n?.addEventListener('change', sn);
    r?.addEventListener('change', sr);
    return () => {
      n?.removeEventListener('change', sn);
      r?.removeEventListener('change', sr);
    };
  });
  const tier = $derived<Tier>(forced ?? tierOf(narrow, rail));

  const primary = $derived(actions.filter((a) => a.kind === 'primary'));
  const sections = $derived(
    groups
      .map((g) => ({ ...g, items: actions.filter((a) => a.kind !== 'primary' && a.group === g.id) }))
      .filter((g) => g.items.length > 0),
  );
  const itemTestid = (a: MenuAction) => (a as ToolbarAction).testid ?? `toolbar-${a.id}`;
</script>

<header class="toolbar" data-testid="toolbar" data-tier={tier} bind:this={root}>
  {#if lead}<div class="toolbar__lead" data-part="lead">{@render lead()}</div>{/if}
  <div class="toolbar__title" data-part="title">
    {#if titleSlot}{@render titleSlot()}{:else}<span class="toolbar__name">{title}</span>{/if}
  </div>
  {#if status}<div class="toolbar__status" data-part="status">{@render status()}</div>{/if}
  <div class="toolbar__actions">
    {#each primary as a (a.id)}
      <Button
        class="toolbar__primary"
        size="sm"
        variant="primary"
        data-part="primary"
        data-testid={itemTestid(a)}
        disabled={!a.enabled}
        onclick={a.run}
      >{a.label}</Button>
    {/each}
    {#if tier === 'narrow'}
      <ActionMenu
        class="toolbar__overflow"
        data-part="overflow"
        placement="bottom-end"
        testid="header-menu"
        title="Document actions"
        label={title}
        {sections}
        {itemTestid}
      />
    {:else}
      {#each sections as g (g.id)}
        {#if g.items.length === 1 && g.items[0].kind !== 'toggle'}
          {@const a = g.items[0]}
          {@const Icon = a.icon ?? g.icon}
          {#if Icon}
            <IconButton
              class="toolbar__menu"
              data-part="menu"
              icon={Icon}
              label={a.label}
              disabled={!a.enabled}
              data-testid={itemTestid(a)}
              popovertarget={a.popovertarget}
              popovertargetaction={a.popovertarget ? 'toggle' : undefined}
              aria-expanded={a.popovertarget ? a.expanded : undefined}
              onclick={a.popovertarget ? undefined : a.run}
            />
          {:else}
            <Button class="toolbar__menu" size="sm" variant="ghost" data-part="menu" disabled={!a.enabled} data-testid={itemTestid(a)} onclick={a.run}>{a.label}</Button>
          {/if}
        {:else}
          <ActionMenu
            class="toolbar__menu"
            data-part="menu"
            placement="bottom-end"
            testid={`toolbar-menu-${g.id}`}
            title={g.label}
            label=""
            triggerLabel={tier === 'full' ? g.label : undefined}
            triggerIcon={tier === 'compact' ? g.icon : undefined}
            keepOpenOnCheck
            actions={g.items}
            {itemTestid}
          />
        {/if}
      {/each}
    {/if}
  </div>
</header>
