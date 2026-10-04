<!--
  ActionMenu — a button opening a small menu of MenuAction rows (menu-action.ts; paragraph and header lists).
  The trigger is the ellipsis IconButton, or (Toolbar group menus) a small Button with a chevron
  (`triggerLabel`) or an icon-only IconButton (`triggerIcon`). A Popover role="menu": rows are >=44px;
  Arrow/Home/End move, Escape / outside click close, focus returns to the trigger (selecting a row focuses
  the trigger first, so the shell's focus restore lands on it).
  Rows with `checked` are `menuitemcheckbox` (aria-checked true|false|mixed) with a Check/Minus/Square (unchecked) slot of fixed
  width; with `keepOpenOnCheck` choosing one runs it and leaves the menu open and focus where it was, so the
  reader sees the state change. `sections` (group label + rows) replaces `actions` where a menu holds several
  groups. `itemTestid` overrides the default `${testid}-${id}`.
  Wraps .action-menu (src/styles/components/action-menu.css). Story: srs-web#382 (epic #224), #423.
-->
<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Minus from '@lucide/svelte/icons/minus';
  import Square from '@lucide/svelte/icons/square';
  import Button from './Button.svelte';
  import type { IconComponent } from './icon.js';
  import IconButton from './IconButton.svelte';
  import Popover from './Popover.svelte';
  import type { MenuAction } from './menu-action.js';
  import type { Placement } from './popover-position.js';

  let {
    actions = [],
    sections,
    label,
    testid = 'paragraph-menu',
    itemTestid,
    title = 'Actions',
    triggerLabel,
    triggerIcon,
    keepOpenOnCheck = false,
    focusKey,
    placement,
    class: klass = '',
    ...rest
  }: {
    actions?: MenuAction[];
    /** Several labelled groups in one menu; replaces `actions` when given. */
    sections?: { label: string; items: MenuAction[] }[];
    /** Names the target, e.g. the paragraph title. May be empty (group menus). */
    label: string;
    testid?: string;
    itemTestid?: (a: MenuAction) => string;
    /** Trigger label; the accessible name is `${title} for ${label}` (just `title` when label is empty). */
    title?: string;
    /** A small labelled Button with a chevron instead of the ellipsis. */
    triggerLabel?: string;
    /** An icon-only trigger instead of the ellipsis (when `triggerLabel` is omitted). */
    triggerIcon?: IconComponent;
    keepOpenOnCheck?: boolean;
    focusKey?: string;
    placement?: Placement;
    class?: string;
  } & Record<`data-${string}`, string | undefined> = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  const place = $derived(placement ?? 'bottom-start');
  const name = $derived(label ? `${title} for ${label}` : title);
  const groups = $derived(sections ?? [{ label: '', items: actions }]);
  const tid = (a: MenuAction) => itemTestid?.(a) ?? `${testid}-${a.id}`;

  function pick(a: MenuAction) {
    if (a.checked !== undefined && keepOpenOnCheck) {
      a.run();
      return;
    }
    open = false;
    root?.querySelector<HTMLElement>('.action-menu__trigger')?.focus();
    a.run();
  }
</script>

<div class={`action-menu ${klass}`} bind:this={root} {...rest}>
  <Popover bind:open role="menu" label={name} placement={place} class="action-menu__list">
    {#snippet trigger({ props })}
      {#if triggerLabel}
        <Button
          class="action-menu__trigger"
          size="sm"
          variant="ghost"
          aria-haspopup="menu"
          data-testid={testid}
          data-focus-key={focusKey}
          {...props}
        >{triggerLabel}<ChevronDown size={14} aria-hidden="true" /></Button>
      {:else}
        <IconButton
          class="action-menu__trigger"
          icon={triggerIcon ?? Ellipsis}
          aria-haspopup="menu"
          label={name}
          data-testid={testid}
          data-focus-key={focusKey}
          {...props}
        />
      {/if}
    {/snippet}
    {#if open}
    {#each groups as g, gi (g.label || gi)}
      {#if g.label}<div class="action-menu__heading" role="presentation" data-part="heading">{g.label}</div>{/if}
      {#each g.items as a (a.id)}
        {#if a.checked !== undefined}
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={a.checked === 'mixed' ? 'mixed' : a.checked}
            class="action-menu__item"
            data-testid={tid(a)}
            disabled={!a.enabled}
            onclick={() => pick(a)}
          ><span class="action-menu__icon" aria-hidden="true">{#if a.checked === 'mixed'}<Minus size={16} aria-hidden="true" />{:else if a.checked}<Check size={16} aria-hidden="true" />{:else}<Square size={16} aria-hidden="true" />{/if}</span>{a.label}</button>
        {:else}
          <button
            type="button"
            role="menuitem"
            class="action-menu__item"
            data-testid={tid(a)}
            disabled={!a.enabled}
            onclick={() => pick(a)}
          >{#if a.icon}{@const Icon = a.icon}<span class="action-menu__icon" aria-hidden="true"><Icon size={16} aria-hidden="true" /></span>{/if}{a.label}</button>
        {/if}
      {/each}
    {/each}
    {/if}
  </Popover>
</div>
