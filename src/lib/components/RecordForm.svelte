<!--
  RecordForm — generic edit/create form for governance record types.

  Renders fields according to the TypeFormDef schema. In edit mode, initialises
  field values from the existing record's fieldValues. All validation is
  delegated to WASM — this component only collects and forwards input.

  ADR-001: zero SRS semantics in TypeScript.
  B9 edit forms: https://github.com/the-greenman/srs-web/issues/5
-->
<script lang="ts">
  import type { SrsRecord, CreateRecordInput, UpdateRecordInput } from "$lib/srs-client.js";
  import type { TypeFormDef } from "$lib/governance/types.js";
  import Field from "$lib/components/Field.svelte";
  import FieldInput from "$lib/components/FieldInput.svelte";
  import SaveBar from "$lib/components/SaveBar.svelte";

  let {
    schema,
    record = null,
    wide = false,
    onSave,
    onCancel,
    saving = false,
    saveError = null,
  }: {
    schema: TypeFormDef;
    record?: SrsRecord | null;
    /** Remove max-width cap so the form fills its container. */
    wide?: boolean;
    onSave: (input: CreateRecordInput | UpdateRecordInput) => void;
    onCancel: () => void;
    saving?: boolean;
    saveError?: string | null;
  } = $props();

  // Compute initial field values from the record prop (or defaults for create mode).
  // For select fields with no existing value, default to the first option so the
  // bound value matches what the browser renders.
  function computeInitialValues(): Record<string, string> {
    return Object.fromEntries(
      schema.fields.map((f) => {
        if (record) {
          const fv = record.fieldValues.find((rv) => rv.fieldId === f.fieldId);
          return [f.fieldId, typeof fv?.value === "string" ? fv.value : ""];
        }
        // Create mode: default selects to first option.
        if (f.valueType === "select" && f.options && f.options.length > 0) {
          return [f.fieldId, f.options[0]];
        }
        return [f.fieldId, ""];
      })
    );
  }

  // Reactive field values map — keyed by fieldId.
  let fieldValues = $state<Record<string, string>>(computeInitialValues());

  // Sync fieldValues when the record identity or schema changes (switching between records).
  $effect(() => {
    // Access reactive props to create tracking dependencies before calling the helper.
    void record?.instanceId;
    void schema.fields.length;
    fieldValues = computeInitialValues();
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    // Build fieldValues array — skip empty optional fields.
    const fvs = schema.fields
      .filter((def) => def.required || fieldValues[def.fieldId] !== "")
      .map((def) => ({ fieldId: def.fieldId, value: fieldValues[def.fieldId] }));

    onSave({ fieldValues: fvs });
  }

  let isEdit = $derived(record !== null);
  let title = $derived(isEdit ? `Edit ${schema.label}` : `New ${schema.label}`);
</script>

<div class="record-form" class:record-form--wide={wide} data-testid="record-form">
  <h2 class="record-form__title">{title}</h2>
  <form onsubmit={handleSubmit} class="record-form__fields">
    {#each schema.fields as def (def.fieldId)}
      {@const inputId = `rf-${def.fieldId}`}
      <Field label={def.label} required={def.required} id={inputId}>
        <FieldInput def={def} bind:value={fieldValues[def.fieldId]} id={inputId} disabled={saving} required={def.required} />
      </Field>
    {/each}

    {#if saveError}
      <p class="form-error" role="alert">{saveError}</p>
    {/if}

    <SaveBar>
      {#snippet children()}
        <button
          type="button"
          class="btn btn--secondary"
          onclick={onCancel}
          disabled={saving}
        >Cancel</button>
        <button
          type="submit"
          class="btn btn--primary"
          disabled={saving}
        >{saving ? "Saving…" : "Save"}</button>
      {/snippet}
    </SaveBar>
  </form>
</div>

<style>
  .record-form {
    padding: 1.5rem;
    max-width: 42rem;
  }
  .record-form--wide {
    max-width: none;
  }

  .record-form__title {
    margin: 0 0 1.5rem;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .record-form__fields {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>
