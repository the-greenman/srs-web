<!--
  SectionForm — composite-aware create/edit form for guide section records.

  Renders flat fields (like RecordForm) plus composite-range list fields
  (RFC-039): `fieldValues[name]` is an array of sub-field-name-keyed objects,
  edited as repeatable entry sub-forms driven by the projected schema's
  `items.properties`. Table composites (sub-fields `columns: string[]` and
  `rows: [{cells: string[]}]` — real lists, RFC-036) get a grid editor;
  other composites (e.g. term/body items) get entry rows.

  ADR-001: zero SRS semantics in TypeScript — the field/composite structure
  comes from the schema; values round-trip verbatim through the SRS store.
-->
<script lang="ts">
  import type { SrsRecord, CreateRecordInput, UpdateRecordInput } from "$lib/srs-client.js";
  import type { FieldFormDef } from "$lib/governance/types.js";
  import type { CompositeFormDef } from "$lib/guides/blueprint-utils.js";
  import Field from "$lib/components/Field.svelte";
  import FieldInput from "$lib/components/FieldInput.svelte";
  import SaveBar from "$lib/components/SaveBar.svelte";

  let {
    label,
    fields,
    composites,
    record = null,
    wide = false,
    onSave,
    onCancel,
    saving = false,
    saveError = null,
  }: {
    label: string;
    fields: FieldFormDef[];
    composites: CompositeFormDef[];
    record?: SrsRecord | null;
    /** Remove max-width cap so the form fills its container. */
    wide?: boolean;
    onSave: (input: CreateRecordInput | UpdateRecordInput) => void;
    onCancel: () => void;
    saving?: boolean;
    saveError?: string | null;
  } = $props();

  /** One composite entry: sub-field name → value (strings, string[], {cells}[]). */
  type Entry = Record<string, unknown>;

  // ---- flat field state (keyed by field name — the RFC-039 carrier key) ----
  function initialFields(): Record<string, string> {
    return Object.fromEntries(
      fields.map((f) => {
        const value = record?.fieldValues[f.name];
        if (value !== undefined) return [f.name, typeof value === "string" ? value : ""];
        if (f.valueType === "select" && f.options?.length) return [f.name, f.options[0]];
        return [f.name, ""];
      })
    );
  }

  // ---- composite state: name -> entries[]; values kept structured -----------
  function initialComposites(): Record<string, Entry[]> {
    const out: Record<string, Entry[]> = {};
    for (const c of composites) {
      // $state.snapshot: the record prop may be a $state proxy (GuidesShell state);
      // structuredClone throws on proxies, and we need a detached deep copy to edit.
      const raw = $state.snapshot(record?.fieldValues[c.name]);
      out[c.name] = Array.isArray(raw) ? (raw as Entry[]) : [];
    }
    return out;
  }

  let fieldValues = $state<Record<string, string>>(initialFields());
  let compositeValues = $state<Record<string, Entry[]>>(initialComposites());

  $effect(() => {
    void record?.instanceId;
    void fields.length;
    fieldValues = initialFields();
    compositeValues = initialComposites();
  });

  // A "table" composite carries `columns` (string list) + `rows` ({cells} list).
  // ponytail: name-shape heuristic replaces the retired x-srs-composite-renderer
  // marker; upgrade to reading the view's RFC-036 compositeRenderer binding when
  // a schema/binding surface exposes it to the editor.
  function isTable(c: CompositeFormDef): boolean {
    const names = new Set(c.fields.map((f) => f.name));
    return names.has("columns") && names.has("rows");
  }

  /** String view of a sub-field value for text inputs (non-strings edit as empty). */
  function strOf(entry: Entry, name: string): string {
    const v = entry[name];
    return typeof v === "string" ? v : "";
  }

  function addEntry(c: CompositeFormDef) {
    compositeValues[c.name] = [...(compositeValues[c.name] ?? []), {}];
  }
  function removeEntry(c: CompositeFormDef, i: number) {
    compositeValues[c.name] = compositeValues[c.name].filter((_, idx) => idx !== i);
  }

  // ---- table grid helpers (real lists — RFC-036 shape) ---------------------
  function tableCols(entry: Entry): string[] {
    return Array.isArray(entry.columns) ? (entry.columns as string[]) : [];
  }
  function tableRows(entry: Entry): { cells: string[] }[] {
    return Array.isArray(entry.rows) ? (entry.rows as { cells: string[] }[]) : [];
  }
  function colCount(entry: Entry): number {
    const cols = tableCols(entry);
    if (cols.length) return cols.length;
    return tableRows(entry)[0]?.cells?.length ?? 2;
  }
  function addColumn(c: CompositeFormDef, i: number) {
    const entry = compositeValues[c.name][i];
    entry.columns = [...tableCols(entry), ""];
    entry.rows = tableRows(entry).map((r) => ({ cells: [...r.cells, ""] }));
  }
  function addRow(c: CompositeFormDef, i: number) {
    const entry = compositeValues[c.name][i];
    entry.rows = [...tableRows(entry), { cells: Array(colCount(entry)).fill("") }];
  }
  function removeRow(c: CompositeFormDef, i: number, ri: number) {
    const entry = compositeValues[c.name][i];
    entry.rows = tableRows(entry).filter((_, idx) => idx !== ri);
  }
  function setHeader(c: CompositeFormDef, i: number, ci: number, value: string) {
    const entry = compositeValues[c.name][i];
    const cols = [...tableCols(entry)];
    // Pad to the table's true column count (colCount falls back to row width
    // when `columns` starts empty), not just to `ci` — otherwise editing an
    // earlier header cell first collapses `columns` shorter than the rows,
    // hiding every column past the collapsed length (srs-web#266).
    const n = Math.max(colCount(entry), ci + 1);
    while (cols.length < n) cols.push("");
    cols[ci] = value;
    entry.columns = cols;
  }
  function setCell(c: CompositeFormDef, i: number, ri: number, ci: number, value: string) {
    tableRows(compositeValues[c.name][i])[ri].cells[ci] = value;
  }

  // ---- submit -------------------------------------------------------------
  function handleSubmit(e: Event) {
    e.preventDefault();
    // Build the RFC-039 name-keyed fieldValues object. Non-string original values
    // (e.g. a numeric `page`) pass through unchanged — this form cannot edit them.
    const fvs: Record<string, unknown> = {};
    for (const def of fields) {
      const strVal = fieldValues[def.name];
      const orig = record?.fieldValues[def.name];
      if (strVal === "" && orig != null && typeof orig !== "string") {
        fvs[def.name] = orig;
      } else if (def.required || strVal !== "") {
        fvs[def.name] = strVal;
      }
    }
    for (const c of composites) {
      const entries = (compositeValues[c.name] ?? []).map((entry) => {
        const obj: Entry = {};
        for (const [k, v] of Object.entries(entry)) {
          if (v === "" || v == null) continue;
          if (Array.isArray(v) && v.length === 0) continue;
          obj[k] = v;
        }
        return obj;
      });
      if (entries.length > 0) fvs[c.name] = entries;
    }
    onSave({ fieldValues: fvs });
  }

  let title = $derived(record ? `Edit ${label}` : `New ${label}`);
</script>

<div class="record-form" class:record-form--wide={wide} data-testid="section-form">
  <h2 class="record-form__title">{title}</h2>
  <form onsubmit={handleSubmit} class="record-form__fields">
    {#each fields as def (def.name)}
      {@const inputId = `rf-${def.name}`}
      <Field label={def.label} required={def.required} description={def.description} instructions={def.instructions} id={inputId}>
        <FieldInput def={def} bind:value={fieldValues[def.name]} id={inputId} disabled={saving} required={def.required} />
      </Field>
    {/each}

    {#each composites as c (c.name)}
      <fieldset class="group" data-testid="group-{c.name}" data-renderer={isTable(c) ? "table" : "default"}>
        <legend class="group__legend">{c.label}</legend>

        {#if isTable(c)}
          <!-- Table grid composite renderer -->
          {#each compositeValues[c.name] ?? [] as entry, i (i)}
            <div class="table-entry" data-testid="table-entry">
              {#each c.fields.filter((f) => f.name === "subheading" || f.name === "label") as meta (meta.name)}
                <Field label={meta.label} description={meta.description} instructions={meta.instructions} id={`g-${c.name}-${i}-${meta.name}`}>
                  <FieldInput
                    def={meta}
                    bind:value={() => strOf(entry, meta.name), (v) => { entry[meta.name] = v; }}
                    id={`g-${c.name}-${i}-${meta.name}`}
                    disabled={saving}
                  />
                </Field>
              {/each}
              <table class="te-table">
                <thead>
                  <tr>
                    {#each Array(colCount(entry)) as _, ci (ci)}
                      <th>
                        <textarea
                          class="te-input"
                          data-testid="te-header"
                          rows={1}
                          oninput={(e) => setHeader(c, i, ci, e.currentTarget.value)}
                          disabled={saving}
                        >{tableCols(entry)[ci] ?? ""}</textarea>
                      </th>
                    {/each}
                    <th class="te-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each tableRows(entry) as row, ri (ri)}
                    <tr data-testid="te-row">
                      {#each Array(colCount(entry)) as _, ci (ci)}
                        <td>
                          <textarea
                            class="te-input"
                            data-testid="te-cell"
                            rows={2}
                            oninput={(e) => setCell(c, i, ri, ci, e.currentTarget.value)}
                            disabled={saving}
                          >{row.cells[ci] ?? ""}</textarea>
                        </td>
                      {/each}
                      <td class="te-actions">
                        <button type="button" class="te-btn" data-testid="te-remove-row" onclick={() => removeRow(c, i, ri)}>✕</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <div class="te-controls">
                <button type="button" class="te-btn" data-testid="te-add-row" onclick={() => addRow(c, i)}>+ Row</button>
                <button type="button" class="te-btn" data-testid="te-add-col" onclick={() => addColumn(c, i)}>+ Column</button>
                <button type="button" class="te-btn te-btn--danger" data-testid="te-remove-table" onclick={() => removeEntry(c, i)}>Remove table</button>
              </div>
            </div>
          {/each}
          <button type="button" class="group__add" data-testid="group-add-{c.name}" onclick={() => addEntry(c)}>+ Add table</button>
        {:else}
          <!-- Generic composite entry rows (e.g. term/body items) -->
          {#each compositeValues[c.name] ?? [] as entry, i (i)}
            <div class="group-entry" data-testid="group-entry">
              {#each c.fields as f (f.name)}
                <Field label={f.label} description={f.description} instructions={f.instructions} id={`g-${c.name}-${i}-${f.name}`}>
                  <FieldInput
                    def={f}
                    bind:value={() => strOf(entry, f.name), (v) => { entry[f.name] = v; }}
                    id={`g-${c.name}-${i}-${f.name}`}
                    disabled={saving}
                    rows={3}
                  />
                </Field>
              {/each}
              <button type="button" class="te-btn te-btn--danger" data-testid="group-remove-entry" onclick={() => removeEntry(c, i)}>Remove</button>
            </div>
          {/each}
          <button type="button" class="group__add" data-testid="group-add-{c.name}" onclick={() => addEntry(c)}>+ Add {c.label.toLowerCase()}</button>
        {/if}
      </fieldset>
    {/each}

    {#if saveError}
      <p class="form-error" role="alert">{saveError}</p>
    {/if}

    <SaveBar>
      {#snippet children()}
        <button type="button" class="btn btn--secondary" onclick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" class="btn btn--primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      {/snippet}
    </SaveBar>
  </form>
</div>

<style>
  .record-form {
    padding: 1.5rem;
    max-width: 46rem;
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
  .group {
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    padding: 0.75rem 1rem 1rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .group__legend {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted, #888);
    padding: 0 0.4rem;
  }
  .table-entry,
  .group-entry {
    border: 1px solid var(--color-border, #eee);
    border-radius: 4px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .te-table {
    border-collapse: collapse;
    width: 100%;
  }
  .te-table th,
  .te-table td {
    border: 1px solid var(--color-border, #ddd);
    padding: 0;
    vertical-align: top;
  }
  .te-table th {
    background: var(--color-surface-1, #f5f5f5);
  }
  .te-input {
    width: 100%;
    border: none;
    padding: 0.5rem 0.6rem;
    font: inherit;
    background: transparent;
    box-sizing: border-box;
    resize: vertical;
    overflow: auto;
    display: block;
  }
  .te-input:focus {
    outline: 2px solid var(--color-focus-ring, var(--ink, #111));
    outline-offset: -2px;
  }
  .te-actions {
    border: none !important;
    width: 1.8rem;
    text-align: center;
  }
  .te-controls {
    display: flex;
    gap: 0.4rem;
  }
  .te-btn {
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  .te-btn--danger {
    color: #b91c1c;
    border-color: #fca5a5;
  }
  .group__add {
    align-self: flex-start;
    font-size: 0.8rem;
    padding: 0.3rem 0.7rem;
    border: 1px dashed var(--color-border, #ccc);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  .form-error {
    color: #b91c1c;
    font-size: 0.85rem;
  }
</style>
