<script lang="ts">
  import type { BreadcrumbItem } from "$lib/types.js";

  let { items }: { items: BreadcrumbItem[] } = $props();
</script>

{#each items as item, i (i)}
  {#if i > 0}<span class="topbar__crumb-sep">›</span>{/if}
  {#if i === items.length - 1}
    <span class="topbar__crumb-current" title={item.title}>{item.label}</span>
  {:else if item.onclick}
    <button class="topbar__crumb-link" title={item.title} onclick={item.onclick}>{item.label}</button>
  {:else}
    <span title={item.title}>{item.label}</span>
  {/if}
{/each}
