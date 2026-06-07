<!--
  Textarea — multi-line control (valueType text). bindable value.
  Wraps .textarea (src/styles/components/field.css).
  B9 generated edit forms: https://github.com/the-greenman/srs-web/issues/5
-->
<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    class: klass = '',
    ...rest
  }: {
    value?: string;
    class?: string;
  } & HTMLTextareaAttributes = $props();
</script>

<textarea class={`textarea ${klass}`} bind:value {...rest}></textarea>
