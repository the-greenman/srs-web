<!--
  InlineText — the one inline-edit widget: text that edits in place.
  Click / Enter (on the focused text) / F2 enters edit; Enter or blur commits (only when the
  value changed), Esc cancels. Presentation + events only; the caller writes the value.
  `editing` is bindable so a parent (Block's F2 on its drag handle) can start an edit.
  Wraps .inline-text (src/styles/components/inline-text.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  let {
    value = '',
    placeholder = '',
    label,
    oncommit,
    as = 'span',
    editing = $bindable(false),
  }: {
    value?: string;
    /** Shown (muted) while the value is empty. */
    placeholder?: string;
    /** Accessible name of the edit field and the edit button. */
    label: string;
    oncommit: (value: string) => void;
    as?: 'h1' | 'span';
    editing?: boolean;
  } = $props();

  let input = $state<HTMLInputElement>();
  let view = $state<HTMLButtonElement>();

  // Focus the field whenever it appears, however the edit was started.
  $effect(() => {
    input?.focus();
    input?.select();
  });

  function end(save: boolean, refocus = false) {
    if (!editing) return;
    const next = input?.value ?? value;
    editing = false;
    if (save && next !== value) oncommit(next);
    // A later task, so this Enter's own keypress does not land on the button and re-open the edit.
    if (refocus) setTimeout(() => view?.focus());
  }
</script>

<svelte:element this={as} class="inline-text" class:is-empty={!value && !editing}>
  {#if editing}
    <input
      bind:this={input}
      class="inline-text__input"
      aria-label={label}
      {placeholder}
      {value}
      onblur={() => end(true)}
      onkeydown={(e) => {
        if (e.key === 'Enter') end(true, true);
        else if (e.key === 'Escape') end(false, true);
      }}
    />
  {:else}
    <button
      bind:this={view}
      type="button"
      class="inline-text__view"
      aria-label={value ? `${label}: ${value}. Edit` : `${label}. Edit`}
      onclick={() => (editing = true)}
      onkeydown={(e) => {
        if (e.key === 'F2') editing = true;
      }}
    >{value || placeholder}</button>
  {/if}
</svelte:element>
