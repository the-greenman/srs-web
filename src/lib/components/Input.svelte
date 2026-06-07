<!--
  Input — single-line control (valueType string/number/date/url). bindable value.
  Wraps .input (src/styles/components/field.css).
  B9 generated edit forms: https://github.com/the-greenman/srs-web/issues/5
-->
<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";

let {
  value = $bindable(""),
  class: klass = "",
  ...rest
}: {
  value?: string;
  class?: string;
} & HTMLInputAttributes = $props();
</script>

<input class={`input ${klass}`} bind:value {...rest} />
