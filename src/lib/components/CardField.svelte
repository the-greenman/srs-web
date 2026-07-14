<!--
  CardField — one label/value row inside a Card. Renders a quiet placeholder
  when `empty`. Wraps .card__field (src/styles/components/card.css).
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4

  Field help (srs-web#211): the read-only counterpart to #176's editor frame.
  A field's own short `description` shows as an inline caption (suppressed when it
  equals the label, since type-schema `title` falls back to `description`), and the
  fuller `instructions` are revealed through an accessible circled-i toggle — the
  same interaction and a11y contract as Field.svelte, in the card's voice.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    required = false,
    empty = false,
    emptyText = 'Not recorded',
    description,
    instructions,
    id,
    children,
  }: {
    label: string;
    required?: boolean;
    empty?: boolean;
    emptyText?: string;
    /** The field's own short caption; shown inline unless it equals the label. */
    description?: string;
    /** Fuller "how to read this field" guidance; revealed via the info toggle. */
    instructions?: string;
    /** Caller-stable unique id; seeds aria-controls for the instructions toggle. */
    id?: string;
    children?: Snippet;
  } = $props();

  // Suppress the caption when the description doubles as the label (type-schema
  // `title` falls back to `description`, srs-rust ADR-026) — same rule as Field.svelte.
  const captionText = $derived(description && description !== label ? description : undefined);
  const instructionsId = $derived(id ? `${id}-instructions` : undefined);
  let showInstructions = $state(false);
</script>

<div class="card__field">
  <div class="card__field-label">
    <span class="card__field-label-text">{label}{#if required}<span class="req">required</span>{/if}</span>
    {#if instructions}
      <button
        type="button"
        class="card__field-info"
        aria-expanded={showInstructions}
        aria-controls={instructionsId}
        aria-label={showInstructions ? 'Hide field instructions' : 'Show field instructions'}
        title={instructions}
        onclick={() => (showInstructions = !showInstructions)}
      ></button>
    {/if}
  </div>
  {#if captionText}<p class="card__field-description">{captionText}</p>{/if}
  {#if instructions && showInstructions}
    <p class="card__field-instructions" id={instructionsId}>{instructions}</p>
  {/if}
  {#if empty}
    <div class="card__field-value card__field-value--empty">{emptyText}</div>
  {:else}
    <div class="card__field-value">{@render children?.()}</div>
  {/if}
</div>
