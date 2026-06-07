<!--
  NavItem — one section link with an optional sigil and record count.
  Wraps .nav__item (src/styles/components/nav.css).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
const {
  label,
  id,
  count,
  active = false,
  href = "#",
}: {
  label: string;
  /** Short sigil shown before the label (e.g. "A", "D", "▤"). */
  id?: string;
  count?: number;
  active?: boolean;
  href?: string;
} = $props();
</script>

<a class="nav__item" class:nav__item--active={active} {href}>
  {#if id}<span class="nav__item-id">{id}</span>{/if}
  {label}
  {#if count != null}<span class="nav__item-count">{count}</span>{/if}
</a>
