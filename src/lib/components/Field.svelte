<!--
  Field — the label/help/error frame around a form control. The control itself
  (Input / Textarea / Select / Repeatable) is passed as children, so one frame
  serves every valueType. Adds .field--invalid when `error` is set.
  Wraps .field (src/styles/components/field.css).
  B9 generated edit forms: https://github.com/the-greenman/srs-web/issues/5
  B13 validate-on-save:    https://github.com/the-greenman/srs-web/issues/9
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    required = false,
    typeHint,
    help,
    error,
    id,
    children,
  }: {
    label: string;
    required?: boolean;
    /** e.g. "string", "text", "select". */
    typeHint?: string;
    help?: string;
    /** Inline validation message; presence flags the field invalid. */
    error?: string;
    /** Wire to the control's id for label association. */
    id?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="field" class:field--invalid={!!error}>
  <label class="field__label" for={id}>
    {label}{#if required}<span class="req">required</span>{/if}
    {#if typeHint}<span class="field__type-hint">{typeHint}</span>{/if}
  </label>
  {#if help}<p class="field__help">{help}</p>{/if}
  {@render children?.()}
  {#if error}<span class="field__error">{error}</span>{/if}
</div>
