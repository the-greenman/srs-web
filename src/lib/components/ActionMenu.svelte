<!--
  ActionMenu — an ellipsis button opening a small menu of MenuAction rows (menu-action.ts; paragraph and header lists).
  Rows are >=44px; Arrow keys move, Escape / outside click close, focus returns to the trigger
  (selecting a row focuses it first, so the shell's focus restore lands on it). No dependency.
  Wraps .action-menu (src/styles/components/action-menu.css). Story: srs-web#382 (epic #224).
-->
<script lang="ts">
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import IconButton from './IconButton.svelte';
  import type { MenuAction } from './menu-action.js';

  let {
    actions,
    label,
    testid = 'paragraph-menu',
    title = 'Actions',
    focusKey,
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
    class?: string;
  } & Record<`data-${string}`, string | undefined> = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  const rows = () => Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  function close(refocus = true) {
    open = false;
    if (refocus) trigger?.focus();
  }

  function toggle() {
    open = !open;
    if (open) queueMicrotask(() => rows()[0]?.focus());
  }

  function pick(a: MenuAction) {
    close();
    a.run();
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const r = rows();
      const at = r.indexOf(document.activeElement as HTMLButtonElement);
      r[(at + (e.key === 'ArrowDown' ? 1 : -1) + r.length) % r.length]?.focus();
    } else if (open && e.key === 'Tab') close(false);
  }
</script>

<svelte:window onpointerdown={(e) => open && !root?.contains(e.target as Node) && close(false)} />

<div class={`action-menu ${klass}`} bind:this={root} onkeydown={keydown} role="presentation" {...rest}>
  <IconButton
    class="action-menu__trigger"
    icon={Ellipsis}
    bind:ref={trigger}
    aria-haspopup="menu"
    aria-expanded={open}
    label={`${title} for ${label}`}
    data-testid={testid}
    data-focus-key={focusKey}
    onclick={toggle}
  />
  {#if open}
    <div class="action-menu__list" role="menu" aria-label={`${title} for ${label}`}>
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
    </div>
  {/if}
</div>
