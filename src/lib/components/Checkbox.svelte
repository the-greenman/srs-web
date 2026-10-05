<!--
  Checkbox — a labelled native checkbox. Bind `checked`, or `group` (with `value`) for a set.
  Native attributes (data-testid, disabled, value, ...) land on the <input>; `title` on the label.
  Wraps .checkbox (field.css); token `--checkbox-accent`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    checked = $bindable(false),
    group = $bindable(),
    title,
    children,
    ...rest
  }: {
    checked?: boolean;
    group?: string[];
    title?: string;
    children?: Snippet;
  } & Omit<HTMLInputAttributes, 'group' | 'checked' | 'title'> = $props();
</script>

<label class="checkbox" {title}>
  {#if group}
    <input type="checkbox" bind:group {...rest} />
  {:else}
    <input type="checkbox" bind:checked {...rest} />
  {/if}
  {@render children?.()}
</label>
