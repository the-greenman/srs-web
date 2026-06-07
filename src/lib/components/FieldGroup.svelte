<!--
  FieldGroup — labelled cluster of related fields (ext:field-groups). Nests
  Field / Repeatable children under one legend. Wraps .field-group
  (src/styles/components/field-group.css).
  B9 field-group editing:  https://github.com/the-greenman/srs-web/issues/5
  B5 field-group rendering: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
import type { Snippet } from "svelte";

const {
  legend,
  help,
  children,
}: {
  legend: string;
  help?: string;
  children?: Snippet;
} = $props();
</script>

<fieldset class="field-group">
  <legend class="field-group__legend">{legend}</legend>
  {#if help}<p class="field-group__help">{help}</p>{/if}
  <div class="field-group__body">{@render children?.()}</div>
</fieldset>
