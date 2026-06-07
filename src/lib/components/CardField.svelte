<!--
  CardField — one label/value row inside a Card. Renders a quiet placeholder
  when `empty`. Wraps .card__field (src/styles/components/card.css).
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    required = false,
    empty = false,
    emptyText = 'Not recorded',
    children,
  }: {
    label: string;
    required?: boolean;
    empty?: boolean;
    emptyText?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="card__field">
  <div class="card__field-label">
    {label}{#if required}<span class="req">required</span>{/if}
  </div>
  {#if empty}
    <div class="card__field-value card__field-value--empty">{emptyText}</div>
  {:else}
    <div class="card__field-value">{@render children?.()}</div>
  {/if}
</div>
