<!--
  NavItem — one section link with an optional sigil and record count.
  Renders .nav__item as <a> (href) or <button> (src/styles/components/nav.css).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  let {
    label,
    id,
    count,
    active = false,
    href,
    onclick,
    testid,
  }: {
    label: string;
    /** Short sigil shown before the label (e.g. "A", "D", "▤"). */
    id?: string;
    count?: number;
    active?: boolean;
    /** With an href it is a link; without, a button (a nav item that changes view state, not the URL). */
    href?: string;
    onclick?: () => void;
    testid?: string;
  } = $props();
</script>

{#snippet content()}
  {#if id}<span class="nav__item-id">{id}</span>{/if}
  {label}
  {#if count != null}<span class="nav__item-count">{count}</span>{/if}
{/snippet}

{#if href}
  <a class="nav__item" class:nav__item--active={active} {href} {onclick} data-testid={testid} aria-current={active ? 'page' : undefined}>{@render content()}</a>
{:else}
  <button type="button" class="nav__item" class:nav__item--active={active} {onclick} data-testid={testid} aria-current={active ? 'page' : undefined}>{@render content()}</button>
{/if}
