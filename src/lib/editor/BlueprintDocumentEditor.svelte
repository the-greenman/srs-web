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
    childTypes,
    componentTypes,
    loadDocument,
    type ComponentTypeDescriptor,
    type LoadedDocument,
  } from "$lib/editor/document-model.js";
  import { insertChild, insertComponent, moveComponent, removeComponent } from "$lib/editor/document-ops.js";
  import { definitionToComposites, definitionToFields, type CompositeFormDef } from "$lib/editor/blueprint-fields.js";
  import SectionForm from "$lib/editor/SectionForm.svelte";
  import Button from "$lib/components/Button.svelte";
  import PreviewPane from "$lib/components/PreviewPane.svelte";
  import {
    getRecord,
    renderDocumentView,
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
  import { type DocumentBlock, typeNameLabel } from "$lib/editor/document-model.js";

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
  /** Per-type "+ Add <child>" options for a group block (srs-web#322 step 4), keyed by the group's own typeId. */
  let childTypesByTypeId = $state<Record<string, ComponentTypeDescriptor[]>>({});
  let rootRecord = $state<SrsRecord | null>(null);
  let rootForm = $state<FormDef | null>(null);
  let blockRecords = $state<Record<string, SrsRecord>>({});
  /** Compact inline preview HTML per collapsed block — the engine's own render of just that instance (srs-web#322 part 1). */
  let blockPreviews = $state<Record<string, string | null>>({});
  let formDefCache = new Map<string, FormDef>();
  let error = $state<string | null>(null);

  /** Position where the top-level "+ Add component" picker is open: an index into `doc.blocks` (insert before it). */
  let pickerAt = $state<number | null>(null);
  /** The group block whose "+ Add <child>" picker is open (its instanceId), or null. */
  let childPickerOpenFor = $state<string | null>(null);
  let opSaving = $state(false);
  let opError = $state<string | null>(null);

  /** Every block in the tree, top-level and nested, depth-first. */
  function flattenBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
    return blocks.flatMap((b) => [b, ...flattenBlocks(b.children)]);
  }

  function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  /**
   * The engine's own single-instance render (same `instanceIdFilter` path used
   * for single-decision export, srs-rust#373) — a compact HTML fragment for
   * one block, so the collapsed list shows real rendered content instead of
   * a raw-field one-liner.
   */
  function renderBlockPreviewHtml(loadedDoc: LoadedDocument, instanceId: string): string | null {
    try {
      return renderDocumentView(repo, composition.id, "html", loadedDoc.containerId, instanceId).rendered;
    } catch {
      return null;
    }
  }

  function refreshBlockPreview(instanceId: string): void {
    if (!doc) return;
    blockPreviews = { ...blockPreviews, [instanceId]: renderBlockPreviewHtml(doc, instanceId) };
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
      const bp = blueprintForComposition(repo, composition);
      if (!bp) {
        doc = null;
        return;
      }
      const loaded = loadDocument(repo, composition);
      if (!loaded) {
        error = "No container resolves this composition's root — cannot edit it as a document.";
        doc = null;
        return;
      }
      const types = componentTypes(repo, bp);
      const root = loaded.root ? getRecord(repo, loaded.root.instanceId) : null;
      const rootDef = root ? formDefFor(root.typeId, root.typeVersion) : null;
      const allBlocks = flattenBlocks(loaded.blocks);
      const records: Record<string, SrsRecord> = {};
      const previews: Record<string, string | null> = {};
      const childTypesCache: Record<string, ComponentTypeDescriptor[]> = {};
      for (const block of allBlocks) {
        const record = getRecord(repo, block.instanceId);
        if (record) records[block.instanceId] = record;
        previews[block.instanceId] = renderBlockPreviewHtml(loaded, block.instanceId);
        if (!(block.typeId in childTypesCache)) {
          childTypesCache[block.typeId] = childTypes(repo, bp, block.typeId);
        }
      }
      doc = loaded;
      availableTypes = types;
      childTypesByTypeId = childTypesCache;
      rootRecord = root;
      rootForm = rootDef;
      blockRecords = records;
      blockPreviews = previews;
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
      refreshBlockPreview(instanceId);
      onMutation();
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  function moveUp(list: DocumentBlock[], index: number): void {
    if (!doc || index <= 0) return;
    opSaving = true;
    opError = null;
    try {
      moveComponent(repo, { instanceId: list[index].instanceId, beforeId: list[index - 1].instanceId }, () => {
        onMutation();
        reload();
      });
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  function moveDown(list: DocumentBlock[], index: number): void {
    if (!doc || index >= list.length - 1) return;
    opSaving = true;
    opError = null;
    try {
      moveComponent(repo, { instanceId: list[index].instanceId, afterId: list[index + 1].instanceId }, () => {
        onMutation();
        reload();
      });
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  /** `hasParent`: a nested child carries an inbound `contains` relation, which needs `cascade` to delete (see document-ops.ts). */
  function removeBlock(instanceId: string, hasParent: boolean): void {
    if (!doc) return;
    if (!confirm("Remove this component? This cannot be undone.")) return;
    opSaving = true;
    opError = null;
    try {
      removeComponent(repo, { instanceId, containerId: doc.containerId, cascade: hasParent }, () => {
        onMutation();
        reload();
      });
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  function openPicker(at: number): void {
    pickerAt = pickerAt === at ? null : at;
  }

  function toggleChildPicker(parentId: string): void {
    childPickerOpenFor = childPickerOpenFor === parentId ? null : parentId;
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

  /** Insert a new top-level component of `descriptor`'s type at the open picker's position. */
  function pickType(descriptor: ComponentTypeDescriptor): void {
    if (!doc || pickerAt === null) return;
    const at = pickerAt;
    pickerAt = null;
    opSaving = true;
    opError = null;
    try {
      const list = doc.blocks;
      const afterId = list[at - 1]?.instanceId;
      const beforeId = afterId === undefined ? list[at]?.instanceId : undefined;
      const created = insertComponent(
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
      expanded = new Set([...expanded, created.instanceId]);
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  /** Insert a new child of `descriptor`'s type as `parent`'s last child (srs-web#322 step 5). */
  function addChild(parent: DocumentBlock, descriptor: ComponentTypeDescriptor): void {
    if (!doc) return;
    childPickerOpenFor = null;
    opSaving = true;
    opError = null;
    try {
      const lastChild = parent.children[parent.children.length - 1];
      const created = insertChild(
        repo,
        {
          parentId: parent.instanceId,
          typeId: descriptor.typeId,
          typeVersion: descriptor.typeVersion,
          containerId: doc.containerId,
          afterId: lastChild?.instanceId,
          fieldValues: placeholderFieldValues(descriptor.typeId, descriptor.typeVersion),
        },
        () => {
          onMutation();
          reload();
        }
      );
      expanded = new Set([...expanded, created.instanceId]);
    } catch (e: unknown) {
      opError = message(e);
    } finally {
      opSaving = false;
    }
  }

  /** "+ Add <label>" text for a group's child picker: the single offered type's label, or a generic fallback when several types are offered. */
  function childPickerLabel(typeId: string): string {
    const options = childTypesByTypeId[typeId] ?? [];
    return options.length === 1 ? options[0].label : "component";
  }

  /** Human label for a document block: prefer the resolved component type's label, fall back to the block's own display label. */
  function blockTypeLabel(block: DocumentBlock): string {
    const typeName = blockRecords[block.instanceId]?.typeName;
    return (
      availableTypes.find((t) => t.typeId === block.typeId)?.label ??
      (typeName ? typeNameLabel(typeName) : block.label)
    );
  }

  const disabled = $derived(saving || opSaving);

  /** Blocks render collapsed to a one-line summary; ids here are open ("root" = the page form). */
  let expanded = $state(new Set<string>());
  function toggle(id: string): void {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  const SUMMARY_FIELD = /headline|heading|title|question|label|name/i;
  /** The block's most telling text value — a headline-ish field first, else any text. */
  function summary(record: SrsRecord | null | undefined): string {
    const entries = Object.entries(record?.fieldValues ?? {}).filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== ""
    );
    const text = (entries.find(([k]) => SUMMARY_FIELD.test(k)) ?? entries[0])?.[1] ?? "";
    return text.length > 90 ? `${text.slice(0, 89)}…` : text;
  }
</script>

<div class="bp-editor" data-testid="blueprint-document-editor">
  {#if error}
    <p class="bp-editor__error" role="alert">{error}</p>
  {:else if doc}
    {#if opError}
      <p class="bp-editor__error" role="alert" data-testid="bp-editor-error">{opError}</p>
    {/if}

    {#snippet picker(at: number)}
      <div class="bp-editor__add-row">
        <Button variant="ghost" data-testid="bp-add-component-{at}" onclick={() => openPicker(at)} disabled={disabled}>+ Add component</Button>
      </div>
      {#if pickerAt === at}
        <ul class="bp-editor__picker" data-testid="bp-picker-{at}" role="menu">
          {#each availableTypes as t (t.typeId)}
            <li><button type="button" role="menuitem" title={t.description} onclick={() => pickType(t)}>{t.label}</button></li>
          {/each}
        </ul>
      {/if}
    {/snippet}

    {#snippet block(item: DocumentBlock, index: number, list: DocumentBlock[], hasParent: boolean)}
      {@const record = blockRecords[item.instanceId]}
      {@const open = expanded.has(item.instanceId)}
      {@const childOptions = childTypesByTypeId[item.typeId] ?? []}
      <section class="bp-editor__block" data-testid="bp-editor-block">
        <header class="bp-editor__block-header">
          <button
            type="button"
            class="bp-editor__toggle"
            data-testid="bp-block-toggle"
            aria-expanded={open}
            onclick={() => toggle(item.instanceId)}
          >
            <span class="bp-editor__block-type">{blockTypeLabel(item)}</span>
          </button>
          <span class="bp-editor__block-controls">
            <button type="button" class="bp-editor__icon-btn" data-testid="bp-block-up" title="Move up"
              disabled={disabled || index === 0} onclick={() => moveUp(list, index)}>↑</button>
            <button type="button" class="bp-editor__icon-btn" data-testid="bp-block-down" title="Move down"
              disabled={disabled || index === list.length - 1} onclick={() => moveDown(list, index)}>↓</button>
            <button type="button" class="bp-editor__icon-btn bp-editor__icon-btn--danger" data-testid="bp-block-remove"
              title="Remove" disabled={disabled} onclick={() => removeBlock(item.instanceId, hasParent)}>✕</button>
          </span>
        </header>
        {#if open && record}
          {@const def = formDefFor(item.typeId, item.typeVersion)}
          <SectionForm
            label={blockTypeLabel(item)}
            fields={def.fields}
            composites={def.composites}
            {record}
            wide
            onSave={(input) => saveBlock(item.instanceId, input)}
            onCancel={() => toggle(item.instanceId)}
            saving={disabled}
          />
        {:else}
          <button
            type="button"
            class="bp-editor__inline-preview"
            data-testid="bp-block-preview"
            onclick={() => toggle(item.instanceId)}
            aria-label={`Edit ${blockTypeLabel(item)}`}
          >
            <PreviewPane html={blockPreviews[item.instanceId] ?? null} />
          </button>
        {/if}

        {#if item.children.length > 0 || childOptions.length > 0}
          <div class="bp-editor__children" data-testid="bp-block-children">
            {#each item.children as child, cindex (child.instanceId)}
              {@render block(child, cindex, item.children, true)}
            {/each}
            {#if childOptions.length > 0}
              <div class="bp-editor__add-row">
                <Button
                  variant="ghost"
                  data-testid="bp-add-child-{item.instanceId}"
                  onclick={() => toggleChildPicker(item.instanceId)}
                  disabled={disabled}
                >+ Add {childPickerLabel(item.typeId)}</Button>
              </div>
              {#if childPickerOpenFor === item.instanceId}
                <ul class="bp-editor__picker" data-testid="bp-child-picker-{item.instanceId}" role="menu">
                  {#each childOptions as t (t.typeId)}
                    <li><button type="button" role="menuitem" title={t.description} onclick={() => addChild(item, t)}>{t.label}</button></li>
                  {/each}
                </ul>
              {/if}
            {/if}
          </div>
        {/if}
      </section>
    {/snippet}

    {#if rootRecord && rootForm}
      <section class="bp-editor__root" data-testid="bp-editor-root">
        <header class="bp-editor__block-header">
          <button type="button" class="bp-editor__toggle" data-testid="bp-root-toggle" aria-expanded={expanded.has("root")} onclick={() => toggle("root")}>
            <span class="bp-editor__block-type">Page</span>
            <span class="bp-editor__block-summary">{summary(rootRecord)}</span>
          </button>
        </header>
        {#if expanded.has("root")}
          <SectionForm
            label="Page"
            fields={rootForm.fields}
            composites={rootForm.composites}
            record={rootRecord}
            wide
            onSave={saveRoot}
            onCancel={() => toggle("root")}
            saving={disabled}
          />
        {/if}
      </section>
    {/if}

    {@render picker(0)}
    {#each doc.blocks as item, index (item.instanceId)}
      {@render block(item, index, doc.blocks, false)}
      {@render picker(index + 1)}
    {/each}
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
  .bp-editor__toggle {
    display: flex;
    flex: 1;
    min-width: 0;
    gap: 0.5rem;
    align-items: baseline;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .bp-editor__block-summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-muted, #666);
    font-size: 0.85rem;
  }
  .bp-editor__inline-preview {
    display: block;
    width: 100%;
    max-height: 12rem;
    overflow: hidden;
    border: none;
    background: #fff;
    cursor: pointer;
    padding: 0;
    border-radius: 0 0 6px 6px;
  }
  .bp-editor__inline-preview :global(.preview-pane) {
    height: 12rem;
  }
  .bp-editor__inline-preview :global(iframe) {
    pointer-events: none;
  }
  .bp-editor__children {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem 0.5rem 0.5rem 1.25rem;
    border-top: 1px solid var(--color-border, #e0e0e0);
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
