<!--
  ActionMenu — an ellipsis IconButton opening a small menu of MenuAction rows (menu-action.ts; paragraph and header lists).
  A Popover role="menu": rows are >=44px; Arrow keys move, Escape / outside click close, focus returns to the trigger
  (selecting a row focuses the trigger first, so the shell's focus restore lands on it). No dependency.
  Wraps .action-menu (src/styles/components/action-menu.css). Story: srs-web#382 (epic #224).
-->
<script lang="ts">
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import IconButton from './IconButton.svelte';
  import Popover from './Popover.svelte';
  import type { MenuAction } from './menu-action.js';
  import type { Placement } from './popover-position.js';

  let {
    actions,
    label,
    testid = 'paragraph-menu',
    title = 'Actions',
    focusKey,
    placement,
    class: klass = '',
    ...rest
  }: {
    actions: MenuAction[];
    /** Names the target, e.g. the paragraph title. */
    label: string;
    testid?: string;
    /** Trigger label; the accessible name is `${title} for ${label}`. */
    title?: string;
    focusKey?: string;
    /** Defaults to the `action-menu--end` modifier: bottom-end when present, else bottom-start. */
    placement?: Placement;
    class?: string;
  } & Record<`data-${string}`, string | undefined> = $props();

  let open = $state(false);
  let triggerBtn = $state<HTMLButtonElement>();
  const place = $derived(placement ?? (klass.includes('action-menu--end') ? 'bottom-end' : 'bottom-start'));
  const name = $derived(`${title} for ${label}`);

  function pick(a: MenuAction) {
    open = false;
    triggerBtn?.focus();
    a.run();
  }
</script>

<div class={`action-menu ${klass}`} {...rest}>
  <Popover bind:open role="menu" label={name} placement={place} class="action-menu__list">
    {#snippet trigger({ props })}
      <IconButton
        class="action-menu__trigger"
        icon={Ellipsis}
        bind:ref={triggerBtn}
        aria-haspopup="menu"
        label={name}
        data-testid={testid}
        data-focus-key={focusKey}
        {...props}
      />
    {/snippet}
    {#if open}
    {#each actions as a (a.id)}
      <button
        type="button"
        role="menuitem"
        class="action-menu__item"
        data-testid={`${testid}-${a.id}`}
        disabled={!a.enabled}
        onclick={() => pick(a)}
      >{#if a.icon}{@const Icon = a.icon}<span class="action-menu__icon" aria-hidden="true"><Icon size={16} aria-hidden="true" /></span>{/if}{a.label}</button>
    {/each}
    {/if}
  </Popover>
</div>
