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
  // State is keyed by field NAME — the RFC-039 carrier key into `fieldValues`.
  // Returns [stringValues, nonStringValues]: the latter preserves non-string values
  // (arrays, composites) that this string-keyed form cannot edit, so handleSubmit can
  // pass them through unchanged (update_record does a full fieldValues replace).
  // TODO: list-cardinality url fields can only be read, not edited, via this form; a
  //   dedicated multi-url input (srs-web#N) is needed to add/remove individual URLs.
  // For select fields with no existing value, default to the first option so the
  // bound value matches what the browser renders.
  function computeInitialValues(): [Record<string, string>, Map<string, unknown>] {
    const nonStringValues = new Map<string, unknown>();
    const stringValues = Object.fromEntries(
      schema.fields.map((f) => {
        if (record) {
          const value = record.fieldValues[f.name];
          if (typeof value === "string") {
            return [f.name, value];
          } else if (value != null) {
            nonStringValues.set(f.name, value);
          }
          return [f.name, ""];
        }
        // Create mode: default selects to first option.
        if (f.valueType === "select" && f.options && f.options.length > 0) {
          return [f.name, f.options[0]];
        }
        return [f.name, ""];
      })
    );
    return [stringValues, nonStringValues];
  }

  let [initialStringValues, initialNonStringValues] = computeInitialValues();
  // Reactive field values map — keyed by field name.
  let fieldValues = $state<Record<string, string>>(initialStringValues);
  let originalNonStringValues = $state<Map<string, unknown>>(initialNonStringValues);

  // Sync fieldValues when the record identity or schema changes (switching between records).
  $effect(() => {
    // Access reactive props to create tracking dependencies before calling the helper.
    void record?.instanceId;
    void schema.fields.length;
    [fieldValues, originalNonStringValues] = computeInitialValues();
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    // Build the RFC-039 name-keyed fieldValues object — skip empty optional fields,
    // but pass through any original non-string values this form cannot edit.
    const fvs: Record<string, unknown> = {};
    for (const def of schema.fields) {
      const strVal = fieldValues[def.name];
      if (strVal === "" && originalNonStringValues.has(def.name)) {
        fvs[def.name] = originalNonStringValues.get(def.name);
      } else if (def.required || strVal !== "") {
        fvs[def.name] = strVal;
      }
    }
    onSave({ fieldValues: fvs });
  }

  let isEdit = $derived(record !== null);
  let title = $derived(isEdit ? `Edit ${schema.label}` : `New ${schema.label}`);
</script>

<div class="record-form" class:record-form--wide={wide} data-testid="record-form">
  <h2 class="record-form__title">{title}</h2>
  <form onsubmit={handleSubmit} class="record-form__fields">
    {#each schema.fields as def (def.name)}
      {@const inputId = `rf-${def.name}`}
      <Field label={def.label} required={def.required} description={def.description} instructions={def.instructions} id={inputId}>
        <FieldInput def={def} bind:value={fieldValues[def.name]} id={inputId} disabled={saving} required={def.required} />
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
