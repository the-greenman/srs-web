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
    description,
    instructions,
    error,
    id,
    children,
  }: {
    label: string;
    required?: boolean;
    /** e.g. "string", "text", "select". */
    typeHint?: string;
    help?: string;
    /** The field's own short caption; shown inline as help unless it equals the label. */
    description?: string;
    /** Fuller "how to complete this field" guidance; revealed via the info toggle. */
    instructions?: string;
    /** Inline validation message; presence flags the field invalid. */
    error?: string;
    /** Wire to the control's id for label association. */
    id?: string;
    children?: Snippet;
  } = $props();

  // The field's description doubles as its label when no displayLabel is set
  // (srs-rust ADR-026: type-schema `title` falls back to `description`). Suppress
  // the inline help in that case so we don't print the same string twice.
  const helpText = $derived(help ?? (description && description !== label ? description : undefined));
  const instructionsId = $derived(id ? `${id}-instructions` : undefined);
  let showInstructions = $state(false);
</script>

<div class="field" class:field--invalid={!!error}>
  <div class="field__header">
    <label class="field__label" for={id}>
      {label}{#if required}<span class="req">required</span>{/if}{#if typeHint}<span class="field__type-hint">{typeHint}</span>{/if}
    </label>
    {#if instructions}
      <button
        type="button"
        class="field__info"
        aria-expanded={showInstructions}
        aria-controls={instructionsId}
        aria-label={showInstructions ? `Hide instructions for ${label}` : `Show instructions for ${label}`}
        title={instructions}
        onclick={() => (showInstructions = !showInstructions)}
      ></button>
    {/if}
  </div>
  {#if helpText}<p class="field__help">{helpText}</p>{/if}
  {#if instructions && showInstructions}
    <p class="field__instructions" id={instructionsId}>{instructions}</p>
  {/if}
  {@render children?.()}
  {#if error}<span class="field__error">{error}</span>{/if}
</div>
