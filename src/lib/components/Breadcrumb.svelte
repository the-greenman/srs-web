<script lang="ts">
  import type { BreadcrumbItem } from "$lib/types.js";

  let { items }: { items: BreadcrumbItem[] } = $props();
</script>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol>
    {#each items as item, i (i)}
      <li>
        {#if i > 0}<span class="breadcrumb__sep" aria-hidden="true">›</span>{/if}
        {#if i === items.length - 1}
          <span class="breadcrumb__current" aria-current="page" title={item.title}>{item.label}</span>
        {:else if item.onclick}
          <button class="breadcrumb__link" title={item.title} onclick={item.onclick}>{item.label}</button>
        {:else}
          <span title={item.title}>{item.label}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
