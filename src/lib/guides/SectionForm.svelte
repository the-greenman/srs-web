<!--
  SectionForm — group-aware create/edit form for guide section records.

  Renders flat fields (like RecordForm) plus repeatable field groups
  (ext:field-groups). Groups whose `compositeRenderer` is "table" get a grid
  editor (columns/rows); other groups (e.g. term/body items) get repeatable
  entry rows. Emits { fieldValues, groupValues } so the section's tables and
  commentary items round-trip through the SRS store.

  ADR-001: zero SRS semantics in TypeScript — the field/group structure and the
  composite-renderer choice come from the schema (D1), not from hardcoded types.
-->
<script lang="ts">
  import type {
    SrsRecord,
    CreateRecordInput,
    UpdateRecordInput,
    GroupFieldValue,
  } from "$lib/srs-client.js";
  import type { FieldFormDef } from "$lib/governance/form-schema.js";
  import type { GroupFormDef } from "$lib/guides/blueprint-utils.js";
  import Field from "$lib/components/Field.svelte";
  import Input from "$lib/components/Input.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import SaveBar from "$lib/components/SaveBar.svelte";

  let {
    label,
    fields,
    groups,
    record = null,
    onSave,
    onCancel,
    saving = false,
    saveError = null,
  }: {
    label: string;
    fields: FieldFormDef[];
    groups: GroupFormDef[];
    record?: SrsRecord | null;
    onSave: (input: CreateRecordInput | UpdateRecordInput) => void;
    onCancel: () => void;
    saving?: boolean;
    saveError?: string | null;
  } = $props();

  // ---- flat field state (keyed by fieldId) -------------------------------
  function initialFields(): Record<string, string> {
    return Object.fromEntries(
      fields.map((f) => {
        const fv = record?.fieldValues.find((rv) => rv.fieldId === f.fieldId);
        if (fv) return [f.fieldId, typeof fv.value === "string" ? fv.value : ""];
        if (f.valueType === "select" && f.options?.length) return [f.fieldId, f.options[0]];
        return [f.fieldId, ""];
      })
    );
  }

  // ---- group state: groupId -> entries[]; each entry keyed by fieldId ------
  function initialGroups(): Record<string, Array<Record<string, string>>> {
    const out: Record<string, Array<Record<string, string>>> = {};
    for (const g of groups) {
      const gv = record?.groupValues?.find((v) => v.groupId === g.groupId);
      const entries = (gv?.entries ?? []).map((entry) => {
        const row: Record<string, string> = {};
        for (const f of g.fields) {
          const fv = entry.fieldValues.find((e) => e.fieldId === f.fieldId);
          row[f.fieldId] = typeof fv?.value === "string" ? fv.value : "";
        }
        return row;
      });
      out[g.groupId] = entries;
    }
    return out;
  }

  let fieldValues = $state<Record<string, string>>(initialFields());
  let groupValues = $state<Record<string, Array<Record<string, string>>>>(initialGroups());

  $effect(() => {
    void record?.instanceId;
    void fields.length;
    fieldValues = initialFields();
    groupValues = initialGroups();
  });

  // ---- table-grid helpers (a "table" group's entry is one table) ----------
  const sub = (g: GroupFormDef, name: string) => g.fields.find((f) => f.name === name);
  function parseArr(value: string | undefined): string[] {
    if (!value) return [];
    try {
      const v = JSON.parse(value);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  function parseGrid(value: string | undefined): string[][] {
    if (!value) return [];
    try {
      const v = JSON.parse(value);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function emptyEntry(g: GroupFormDef): Record<string, string> {
    return Object.fromEntries(g.fields.map((f) => [f.fieldId, ""]));
  }
  function addEntry(g: GroupFormDef) {
    groupValues[g.groupId] = [...(groupValues[g.groupId] ?? []), emptyEntry(g)];
  }
  function removeEntry(g: GroupFormDef, i: number) {
    groupValues[g.groupId] = groupValues[g.groupId].filter((_, idx) => idx !== i);
  }

  // table mutations operate on the columns/rows JSON-encoded sub-fields
  function tableCols(g: GroupFormDef, entry: Record<string, string>): string[] {
    const c = sub(g, "columns");
    return c ? parseArr(entry[c.fieldId]) : [];
  }
  function tableRows(g: GroupFormDef, entry: Record<string, string>): string[][] {
    const r = sub(g, "rows");
    return r ? parseGrid(entry[r.fieldId]) : [];
  }
  function setCols(g: GroupFormDef, i: number, cols: string[]) {
    const c = sub(g, "columns");
    if (c) groupValues[g.groupId][i][c.fieldId] = JSON.stringify(cols);
  }
  function setRows(g: GroupFormDef, i: number, rows: string[][]) {
    const r = sub(g, "rows");
    if (r) groupValues[g.groupId][i][r.fieldId] = JSON.stringify(rows);
  }
  function colCount(g: GroupFormDef, entry: Record<string, string>): number {
    const cols = tableCols(g, entry);
    if (cols.length) return cols.length;
    const rows = tableRows(g, entry);
    return rows[0]?.length ?? 2;
  }
  function addColumn(g: GroupFormDef, i: number) {
    const entry = groupValues[g.groupId][i];
    setCols(g, i, [...tableCols(g, entry), ""]);
    setRows(g, i, tableRows(g, entry).map((row) => [...row, ""]));
  }
  function addRow(g: GroupFormDef, i: number) {
    const entry = groupValues[g.groupId][i];
    const n = colCount(g, entry);
    setRows(g, i, [...tableRows(g, entry), Array(n).fill("")]);
  }
  function removeRow(g: GroupFormDef, i: number, ri: number) {
    const entry = groupValues[g.groupId][i];
    setRows(g, i, tableRows(g, entry).filter((_, idx) => idx !== ri));
  }
  function setHeader(g: GroupFormDef, i: number, ci: number, value: string) {
    const entry = groupValues[g.groupId][i];
    const cols = tableCols(g, entry);
    while (cols.length <= ci) cols.push("");
    cols[ci] = value;
    setCols(g, i, cols);
  }
  function setCell(g: GroupFormDef, i: number, ri: number, ci: number, value: string) {
    const entry = groupValues[g.groupId][i];
    const rows = tableRows(g, entry);
    rows[ri][ci] = value;
    setRows(g, i, rows);
  }

  // ---- submit -------------------------------------------------------------
  function handleSubmit(e: Event) {
    e.preventDefault();
    const fvs = fields
      .filter((def) => def.required || fieldValues[def.fieldId] !== "")
      .map((def) => ({ fieldId: def.fieldId, value: fieldValues[def.fieldId] }));

    const gvs: GroupFieldValue[] = groups
      .map((g) => ({
        groupId: g.groupId,
        entries: (groupValues[g.groupId] ?? []).map((entry) => ({
          fieldValues: g.fields
            .filter((f) => (entry[f.fieldId] ?? "") !== "")
            .map((f) => ({ fieldId: f.fieldId, value: entry[f.fieldId] })),
        })),
      }))
      .filter((g) => g.entries.length > 0);

    onSave({ fieldValues: fvs, groupValues: gvs });
  }

  let title = $derived(record ? `Edit ${label}` : `New ${label}`);
</script>

<div class="record-form">
  <h2 class="record-form__title">{title}</h2>
  <form onsubmit={handleSubmit} class="record-form__fields">
    {#each fields as def (def.fieldId)}
      {@const inputId = `rf-${def.fieldId}`}
      <Field label={def.label} required={def.required} id={inputId}>
        {#if def.valueType === "text"}
          <Textarea id={inputId} bind:value={fieldValues[def.fieldId]} disabled={saving} rows={4} />
        {:else}
          <Input id={inputId} bind:value={fieldValues[def.fieldId]} disabled={saving} />
        {/if}
      </Field>
    {/each}

    {#each groups as g (g.groupId)}
      <fieldset class="group" data-testid="group-{g.groupId}" data-renderer={g.compositeRenderer ?? "default"}>
        <legend class="group__legend">{g.label}</legend>

        {#if g.compositeRenderer === "table"}
          <!-- Table grid composite renderer -->
          {#each groupValues[g.groupId] ?? [] as entry, i (i)}
            <div class="table-entry" data-testid="table-entry">
              {#each g.fields.filter((f) => f.name === "subheading" || f.name === "label") as meta (meta.fieldId)}
                <Field label={meta.label} id={`g-${g.groupId}-${i}-${meta.fieldId}`}>
                  <Input
                    id={`g-${g.groupId}-${i}-${meta.fieldId}`}
                    bind:value={groupValues[g.groupId][i][meta.fieldId]}
                    disabled={saving}
                  />
                </Field>
              {/each}
              <table class="te-table">
                <thead>
                  <tr>
                    {#each Array(colCount(g, entry)) as _, ci (ci)}
                      <th>
                        <input
                          class="te-input"
                          data-testid="te-header"
                          value={tableCols(g, entry)[ci] ?? ""}
                          oninput={(e) => setHeader(g, i, ci, e.currentTarget.value)}
                          disabled={saving}
                        />
                      </th>
                    {/each}
                    <th class="te-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each tableRows(g, entry) as row, ri (ri)}
                    <tr data-testid="te-row">
                      {#each Array(colCount(g, entry)) as _, ci (ci)}
                        <td>
                          <input
                            class="te-input"
                            data-testid="te-cell"
                            value={row[ci] ?? ""}
                            oninput={(e) => setCell(g, i, ri, ci, e.currentTarget.value)}
                            disabled={saving}
                          />
                        </td>
                      {/each}
                      <td class="te-actions">
                        <button type="button" class="te-btn" data-testid="te-remove-row" onclick={() => removeRow(g, i, ri)}>✕</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <div class="te-controls">
                <button type="button" class="te-btn" data-testid="te-add-row" onclick={() => addRow(g, i)}>+ Row</button>
                <button type="button" class="te-btn" data-testid="te-add-col" onclick={() => addColumn(g, i)}>+ Column</button>
                <button type="button" class="te-btn te-btn--danger" data-testid="te-remove-table" onclick={() => removeEntry(g, i)}>Remove table</button>
              </div>
            </div>
          {/each}
          <button type="button" class="group__add" data-testid="group-add-{g.groupId}" onclick={() => addEntry(g)}>+ Add table</button>
        {:else}
          <!-- Generic repeatable group (e.g. term/body items) -->
          {#each groupValues[g.groupId] ?? [] as entry, i (i)}
            <div class="group-entry" data-testid="group-entry">
              {#each g.fields as f (f.fieldId)}
                <Field label={f.label} id={`g-${g.groupId}-${i}-${f.fieldId}`}>
                  {#if f.valueType === "text"}
                    <Textarea id={`g-${g.groupId}-${i}-${f.fieldId}`} bind:value={entry[f.fieldId]} disabled={saving} rows={3} />
                  {:else}
                    <Input id={`g-${g.groupId}-${i}-${f.fieldId}`} bind:value={entry[f.fieldId]} disabled={saving} />
                  {/if}
                </Field>
              {/each}
              <button type="button" class="te-btn te-btn--danger" data-testid="group-remove-entry" onclick={() => removeEntry(g, i)}>Remove</button>
            </div>
          {/each}
          <button type="button" class="group__add" data-testid="group-add-{g.groupId}" onclick={() => addEntry(g)}>+ Add {g.label.toLowerCase()}</button>
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
  }
  .te-table th {
    background: var(--color-surface-1, #f5f5f5);
  }
  .te-input {
    width: 100%;
    border: none;
    padding: 0.35rem 0.5rem;
    font: inherit;
    background: transparent;
    box-sizing: border-box;
  }
  .te-input:focus {
    outline: 2px solid var(--color-accent, #3b82f6);
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
