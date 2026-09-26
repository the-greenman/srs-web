<!--
  BlueprintDocumentEditor — generic, blueprint-driven document editor.

  Renders a page-root form, then its ordered components (each a full
  SectionForm), with insert/move/remove wired to document-ops.ts. Used by
  GenericSrsShell's Documents surface for any composition whose blueprint
  resolves (srs-web#322 part 2).

  ADR-001: zero SRS semantics in TypeScript — insertion/move/removal delegate
  to the chain-splice WASM bindings via document-ops.ts; this component only
  renders the resulting structure and forwards form input.
-->
<script lang="ts">
  import {
    blueprintForComposition,
    componentTypes,
    loadDocument,
    type ComponentTypeDescriptor,
    type LoadedDocument,
  } from "$lib/editor/document-model.js";
  import { insertComponent, moveComponent, removeComponent } from "$lib/editor/document-ops.js";
  import { definitionToComposites, definitionToFields, type CompositeFormDef } from "$lib/editor/blueprint-fields.js";
  import SectionForm from "$lib/editor/SectionForm.svelte";
  import Button from "$lib/components/Button.svelte";
  import {
    getRecord,
    typeSchema,
    updateRecord,
    type CreateRecordInput,
    type DocumentView,
    type DocumentViewSummary,
    type SchemaDefinition,
    type SrsRecord,
    type SrsRepository,
    type UpdateRecordInput,
  } from "$lib/srs-client.js";
  import type { FieldFormDef as GovFieldFormDef } from "$lib/governance/types.js";
  import type { DocumentBlock } from "$lib/editor/document-model.js";

  interface Props {
    repo: SrsRepository;
    composition: DocumentView | DocumentViewSummary;
    /** Editing is disabled while a save is in flight elsewhere in the app. */
    saving?: boolean;
    /** Bump to force a reload (e.g. after an external repository mutation). */
    revision?: number;
    /** Report a successful mutation so the app shell can refresh derived state (e.g. re-render the preview). */
    onMutation?: () => void;
  }
  let { repo, composition, saving = false, revision = 0, onMutation = () => {} }: Props = $props();

  interface FormDef {
    fields: GovFieldFormDef[];
    composites: CompositeFormDef[];
  }

  let doc = $state<LoadedDocument | null>(null);
  let availableTypes = $state<ComponentTypeDescriptor[]>([]);
  let rootRecord = $state<SrsRecord | null>(null);
  let rootForm = $state<FormDef | null>(null);
  let blockRecords = $state<Record<string, SrsRecord>>({});
  let formDefCache = new Map<string, FormDef>();
  let error = $state<string | null>(null);

  /** Position where the "+ Add component" picker is open: an index into doc.blocks (insert before it), or "end". */
  let pickerAt = $state<number | "end" | null>(null);
  let opSaving = $state(false);
  let opError = $state<string | null>(null);

  function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  function formDefFor(typeId: string, typeVersion: number): FormDef {
    const key = `${typeId}@${typeVersion}`;
    const cached = formDefCache.get(key);
    if (cached) return cached;
    const { schema } = typeSchema(repo, typeId, typeVersion);
    const def = schema as unknown as SchemaDefinition;
    const built: FormDef = { fields: definitionToFields(def), composites: definitionToComposites(def) };
    formDefCache.set(key, built);
    return built;
  }

  /**
   * Recompute all derived state from `repo`/`composition` into local
   * variables first, and only then assign the `$state` fields once each.
   * This function runs inside the `$effect` below — reading back a `$state`
   * value it just wrote (e.g. `doc.root` right after `doc = ...`) would make
   * the effect depend on its own write and re-trigger forever
   * (`effect_update_depth_exceeded`).
   */
  function reload(): void {
    error = null;
    try {
      const blueprint = blueprintForComposition(repo, composition);
      if (!blueprint) {
        doc = null;
        return;
      }
      const loaded = loadDocument(repo, composition);
      if (!loaded) {
        error = "No container resolves this composition's root — cannot edit it as a document.";
        doc = null;
        return;
      }
      const types = componentTypes(repo, blueprint);
      const root = loaded.root ? getRecord(repo, loaded.root.instanceId) : null;
      const rootDef = root ? formDefFor(root.typeId, root.typeVersion) : null;
      const records: Record<string, SrsRecord> = {};
      for (const block of loaded.blocks) {
        const record = getRecord(repo, block.instanceId);
        if (record) records[block.instanceId] = record;
      }
      doc = loaded;
      availableTypes = types;
      rootRecord = root;
      rootForm = rootDef;
      blockRecords = records;
    } catch (e: unknown) {
      error = message(e);
      doc = null;
    }
  }

  $effect(() => {
    void composition;
    void revision;
    pickerAt = null;
    opError = null;
    reload();
  });

  function saveRoot(input: CreateRecordInput | UpdateRecordInput): void {
    if (!rootRecord) return;
    opSaving = true;
    opError = null;
    try {
      rootRecord = updateRecord(repo, rootRecord.instanceId, input as UpdateRecordInput);
      onMutation();
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  function saveBlock(instanceId: string, input: CreateRecordInput | UpdateRecordInput): void {
    opSaving = true;
    opError = null;
    try {
      blockRecords = { ...blockRecords, [instanceId]: updateRecord(repo, instanceId, input as UpdateRecordInput) };
      onMutation();
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  function moveUp(index: number): void {
    if (!doc || index <= 0) return;
    opSaving = true;
    opError = null;
    try {
      moveComponent(repo, { instanceId: doc.blocks[index].instanceId, beforeId: doc.blocks[index - 1].instanceId }, () => {
        onMutation();
        reload();
      });
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  function moveDown(index: number): void {
    if (!doc || index >= doc.blocks.length - 1) return;
    opSaving = true;
    opError = null;
    try {
      moveComponent(repo, { instanceId: doc.blocks[index].instanceId, afterId: doc.blocks[index + 1].instanceId }, () => {
        onMutation();
        reload();
      });
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  function removeBlock(instanceId: string): void {
    if (!doc) return;
    if (!confirm("Remove this component? This cannot be undone.")) return;
    opSaving = true;
    opError = null;
    try {
      removeComponent(repo, { instanceId, containerId: doc.containerId }, () => {
        onMutation();
        reload();
      });
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  function openPicker(at: number | "end"): void {
    pickerAt = pickerAt === at ? null : at;
  }

  /**
   * Placeholder field values satisfying every required field of a component
   * type, so creation doesn't fail record validation before the block's own
   * inline form can be used to fill in real content.
   */
  function placeholderFieldValues(typeId: string, typeVersion: number): Record<string, unknown> {
    const def = formDefFor(typeId, typeVersion);
    const values: Record<string, unknown> = {};
    for (const f of def.fields) {
      if (!f.required) continue;
      values[f.name] = f.valueType === "select" && f.options?.length ? f.options[0] : "";
    }
    return values;
  }

  /** Insert a new component of `descriptor`'s type at the open picker's position. */
  function pickType(descriptor: ComponentTypeDescriptor): void {
    if (!doc || pickerAt === null) return;
    const at = pickerAt;
    pickerAt = null;
    opSaving = true;
    opError = null;
    try {
      const afterId = at === "end" ? doc.blocks[doc.blocks.length - 1]?.instanceId : doc.blocks[at - 1]?.instanceId;
      const beforeId = at === "end" ? undefined : afterId === undefined ? doc.blocks[at]?.instanceId : undefined;
      insertComponent(
        repo,
        {
          typeId: descriptor.typeId,
          typeVersion: descriptor.typeVersion,
          containerId: doc.containerId,
          afterId,
          beforeId,
          fieldValues: placeholderFieldValues(descriptor.typeId, descriptor.typeVersion),
        },
        () => {
          onMutation();
          reload();
        }
      );
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  /** Human label for a document block: prefer the resolved component type's label, fall back to the block's own display label. */
  function blockTypeLabel(block: DocumentBlock): string {
    return availableTypes.find((t) => t.typeId === block.typeId)?.label ?? block.label;
  }

  const disabled = $derived(saving || opSaving);
</script>

<div class="bp-editor" data-testid="blueprint-document-editor">
  {#if error}
    <p class="bp-editor__error" role="alert">{error}</p>
  {:else if doc}
    {#if opError}
      <p class="bp-editor__error" role="alert" data-testid="bp-editor-error">{opError}</p>
    {/if}

    {#if rootRecord && rootForm}
      <section class="bp-editor__root" data-testid="bp-editor-root">
        <SectionForm
          label="Page"
          fields={rootForm.fields}
          composites={rootForm.composites}
          record={rootRecord}
          wide
          onSave={saveRoot}
          onCancel={() => {}}
          saving={disabled}
        />
      </section>
    {/if}

    <div class="bp-editor__add-row">
      <Button variant="ghost" data-testid="bp-add-component-0" onclick={() => openPicker(0)} disabled={disabled}>+ Add component</Button>
    </div>
    {#if pickerAt === 0}
      <ul class="bp-editor__picker" data-testid="bp-picker-0" role="menu">
        {#each availableTypes as t (t.typeId)}
          <li><button type="button" role="menuitem" onclick={() => pickType(t)}>{t.label}</button></li>
        {/each}
      </ul>
    {/if}

    {#each doc.blocks as block, index (block.instanceId)}
      {@const record = blockRecords[block.instanceId]}
      <section class="bp-editor__block" data-testid="bp-editor-block">
        <header class="bp-editor__block-header">
          <span class="bp-editor__block-type">{blockTypeLabel(block)}</span>
          <span class="bp-editor__block-controls">
            <button
              type="button"
              class="bp-editor__icon-btn"
              data-testid="bp-block-up"
              title="Move up"
              disabled={disabled || index === 0}
              onclick={() => moveUp(index)}
            >↑</button>
            <button
              type="button"
              class="bp-editor__icon-btn"
              data-testid="bp-block-down"
              title="Move down"
              disabled={disabled || index === doc.blocks.length - 1}
              onclick={() => moveDown(index)}
            >↓</button>
            <button
              type="button"
              class="bp-editor__icon-btn bp-editor__icon-btn--danger"
              data-testid="bp-block-remove"
              title="Remove"
              disabled={disabled}
              onclick={() => removeBlock(block.instanceId)}
            >✕</button>
          </span>
        </header>
        {#if record}
          {@const def = formDefFor(block.typeId, block.typeVersion)}
          <SectionForm
            label={blockTypeLabel(block)}
            fields={def.fields}
            composites={def.composites}
            {record}
            wide
            onSave={(input) => saveBlock(block.instanceId, input)}
            onCancel={() => {}}
            saving={disabled}
          />
        {/if}
      </section>

      <div class="bp-editor__add-row">
        <Button variant="ghost" data-testid="bp-add-component-{index + 1}" onclick={() => openPicker(index + 1)} disabled={disabled}>+ Add component</Button>
      </div>
      {#if pickerAt === index + 1}
        <ul class="bp-editor__picker" data-testid="bp-picker-{index + 1}" role="menu">
          {#each availableTypes as t (t.typeId)}
            <li><button type="button" role="menuitem" onclick={() => pickType(t)}>{t.label}</button></li>
          {/each}
        </ul>
      {/if}
    {/each}

    <div class="bp-editor__add-row">
      <Button variant="ghost" data-testid="bp-add-component-end" onclick={() => openPicker("end")} disabled={disabled}>+ Add component</Button>
    </div>
    {#if pickerAt === "end"}
      <ul class="bp-editor__picker" data-testid="bp-picker-end" role="menu">
        {#each availableTypes as t (t.typeId)}
          <li><button type="button" role="menuitem" onclick={() => pickType(t)}>{t.label}</button></li>
        {/each}
      </ul>
    {/if}
  {:else}
    <p class="bp-editor__empty">No blueprint governs this composition — showing read-only preview only.</p>
  {/if}
</div>

<style>
  .bp-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .bp-editor__error {
    padding: 0.5rem 0.75rem;
    background: #fef2f2;
    color: #b91c1c;
    border-left: 3px solid #fca5a5;
    font-size: 0.85rem;
  }
  .bp-editor__empty {
    padding: 1rem;
    color: var(--color-muted, #888);
    font-size: 0.9rem;
  }
  .bp-editor__root {
    border-bottom: 2px solid var(--color-border, #ddd);
    padding-bottom: 0.5rem;
  }
  .bp-editor__block {
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 6px;
  }
  .bp-editor__block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.75rem;
    background: var(--color-surface-1, #f7f7f7);
    border-bottom: 1px solid var(--color-border, #e0e0e0);
    border-radius: 6px 6px 0 0;
  }
  .bp-editor__block-type {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted, #888);
  }
  .bp-editor__block-controls {
    display: flex;
    gap: 0.2rem;
  }
  .bp-editor__icon-btn {
    font-size: 0.8rem;
    line-height: 1;
    width: 1.6rem;
    height: 1.6rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    color: var(--color-muted, #666);
  }
  .bp-editor__icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .bp-editor__icon-btn--danger {
    color: #b91c1c;
    border-color: #fca5a5;
  }
  .bp-editor__add-row {
    display: flex;
    justify-content: center;
  }
  .bp-editor__picker {
    align-self: center;
    list-style: none;
    margin: 0 auto;
    padding: 0.25rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    background: #fff;
    max-width: 20rem;
  }
  .bp-editor__picker button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.4rem 0.6rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .bp-editor__picker button:hover {
    background: var(--color-surface-hover, #f0f0f0);
  }
</style>
