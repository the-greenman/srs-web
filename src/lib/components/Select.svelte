<!--
  Select — enum control (valueType select). Options come from the field's
  allowedValues. bindable value. Wraps .select (src/styles/components/field.css).
  B9 generated edit forms: https://github.com/the-greenman/srs-web/issues/5
-->
<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    options,
    class: klass = '',
    ...rest
  }: {
    value?: string;
    /** The field's allowedValues. */
    options: string[];
    class?: string;
  } & HTMLSelectAttributes = $props();
</script>

<select class={`select ${klass}`} bind:value {...rest}>
  {#each options as opt}
    <option value={opt}>{opt}</option>
  {/each}
</select>
