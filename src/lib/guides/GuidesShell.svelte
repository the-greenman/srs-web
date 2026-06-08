<!--
  GuidesShell — blueprint-schema-driven guides editor.

  Loads the guide blueprint schema from the WASM repository, then renders forms
  for guide and section types generically from the schema definitions. No form
  fields are hardcoded; all derive from `blueprintSchema()`.

  ADR-001: zero SRS semantics in TypeScript.
  C8 blueprint-schema-driven guides renderer: srs-web#26
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    blueprintSchema,
    listRecords,
    createRecord,
    updateRecord,
    deleteRecord,
    exportSrsj,
    listContainers,
    getContainer,
    addContainerMember,
    removeContainerMember,
    listRelations,
    createRelation,
    deleteRelation,
    renderDocumentView,
  } from "$lib/srs-client.js";
  import type { SrsRepository, SrsRecord, CreateRecordInput, UpdateRecordInput } from "$lib/srs-client.js";
  import type { TypeFormDef } from "$lib/governance/form-schema.js";
  import {
    sectionTypes,
    rootFields,
    rootTypeId,
    type SectionTypeDescriptor,
  } from "$lib/guides/blueprint-utils.js";
  import RecordForm from "$lib/components/RecordForm.svelte";

  // ---------------------------------------------------------------------------
  // muSrs guide blueprint + document-view UUIDs (stable — part of the package)
  // ---------------------------------------------------------------------------
  const GUIDE_BLUEPRINT_ID = "7bfa600b-f7b2-4a0e-82d4-34c02d9d6770";
  /** guide-body-view: renders a guide in precedes order via ContainerSubset. */
  const GUIDE_VIEW_ID = "2aba4d85-317b-44e1-a600-d38a743b4cb4";

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------
  interface Props {
    repo: SrsRepository;
    repoName: string;
    onOpenAnother: () => void;
  }
  let { repo, repoName, onOpenAnother }: Props = $props();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Section type descriptors derived from the blueprint schema. */
  let sectionTypeList = $state<SectionTypeDescriptor[]>([]);

  /** TypeFormDef for creating/editing a guide (root type). */
  let guideFormDef = $state<TypeFormDef | null>(null);

  /** Guide root type ID (UUID) from blueprint schema. */
  let guideTypeId = $state<string | null>(null);

  /** All guide records in the repo. */
  let guides = $state<SrsRecord[]>([]);

  /** All section records in the repo (all 4 section types). */
  let sections = $state<SrsRecord[]>([]);

  /** Field ID for the guide's "title" property (derived from blueprint schema). */
  let guideTitleFieldId = $state<string | null>(null);

  /** Field ID for sections' "heading" property (derived from blueprint schema). */
  let sectionHeadingFieldId = $state<string | null>(null);

  /** Currently selected guide instance ID. */
  let selectedGuideId = $state<string | null>(null);

  /** Form mode. */
  type FormMode = "create-guide" | "edit-guide" | "create-section" | "edit-section";
  let formMode = $state<FormMode | null>(null);

  /** Schema for the currently open form. */
  let activeFormDef = $state<TypeFormDef | null>(null);

  /** Record being edited (edit modes only). */
  let editingRecord = $state<SrsRecord | null>(null);

  /** Type ID + version for the create-section form. */
  let createSectionTypeId = $state<string | null>(null);
  let createSectionTypeVersion = $state<number>(1);

  let formSaving = $state(false);
  let formError = $state<string | null>(null);

  /** Whether the section-type picker popover is open. */
  let sectionPickerOpen = $state(false);

  /** Schema load error (non-fatal; shown in the shell). */
  let schemaError = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Derive the display label for a guide record using the schema-derived title field. */
  function guideLabel(record: SrsRecord): string {
    if (guideTitleFieldId) {
      const fv = record.fieldValues.find((f) => f.fieldId === guideTitleFieldId);
      if (fv) return fv.value as string;
    }
    return (record.fieldValues[0]?.value as string | undefined) ?? "Untitled Guide";
  }

  /** Derive the display label for a section record using the schema-derived heading field. */
  function sectionLabel(record: SrsRecord): string {
    if (sectionHeadingFieldId) {
      const fv = record.fieldValues.find((f) => f.fieldId === sectionHeadingFieldId);
      if (fv) return fv.value as string;
    }
    return (record.fieldValues[0]?.value as string | undefined) ?? "Untitled Section";
  }

  /** Derive the human-readable type name for a section record. */
  function sectionTypeName(record: SrsRecord): string {
    const st = sectionTypeList.find((s) => s.typeId === record.typeId);
    return st?.label ?? record.typeName ?? "Section";
  }

  /** The selected guide's container id (the guide is its root), or null. */
  let selectedContainerId = $state<string | null>(null);

  /** Sections of the selected guide, scoped to its container and in precedes order. */
  let orderedSections = $state<SrsRecord[]>([]);

  /** Order a set of section records by their `precedes` relation chain. */
  function orderByPrecedes(secs: SrsRecord[]): SrsRecord[] {
    const ids = new Set(secs.map((s) => s.instanceId));
    const rels = listRelations(repo, { relationType: "precedes" }).filter(
      (r) => ids.has(r.sourceInstanceId) && ids.has(r.targetInstanceId)
    );
    const next = new Map<string, string>();
    const hasIncoming = new Set<string>();
    for (const r of rels) {
      next.set(r.sourceInstanceId, r.targetInstanceId);
      hasIncoming.add(r.targetInstanceId);
    }
    const byId = new Map(secs.map((s) => [s.instanceId, s]));
    const ordered: SrsRecord[] = [];
    const visited = new Set<string>();
    // The chain head has no incoming precedes edge; follow next-pointers from there.
    let cursor = secs.find((s) => !hasIncoming.has(s.instanceId))?.instanceId;
    while (cursor && byId.has(cursor) && !visited.has(cursor)) {
      visited.add(cursor);
      ordered.push(byId.get(cursor) as SrsRecord);
      cursor = next.get(cursor);
    }
    // Append any section not reachable through the chain, deterministically.
    for (const s of secs) if (!visited.has(s.instanceId)) ordered.push(s);
    return ordered;
  }

  /** Resolve the selected guide's container and rebuild the ordered section list. */
  function refreshSections() {
    selectedContainerId = null;
    orderedSections = [];
    if (!selectedGuideId) return;
    const containers = listContainers(repo, { rootInstanceId: selectedGuideId });
    if (containers.length === 0) return;
    selectedContainerId = containers[0].containerId;
    const container = getContainer(repo, selectedContainerId);
    const members = new Set(container.memberInstanceIds ?? []);
    const scoped = sections.filter((s) => members.has(s.instanceId));
    orderedSections = orderByPrecedes(scoped);
  }

  /**
   * Delete every `precedes` relation touching any id in `clearIds`, then recreate a
   * single chain through `orderedIds`. Used by add / reorder / remove so the stored
   * order always matches the displayed order.
   */
  function rebuildPrecedesChain(orderedIds: string[], clearIds: string[]) {
    const clear = new Set(clearIds);
    const rels = listRelations(repo, { relationType: "precedes" }).filter(
      (r) => clear.has(r.sourceInstanceId) || clear.has(r.targetInstanceId)
    );
    for (const r of rels) deleteRelation(repo, r.relationId);
    for (let i = 0; i < orderedIds.length - 1; i++) {
      createRelation(repo, {
        relationType: "precedes",
        sourceInstanceId: orderedIds[i],
        targetInstanceId: orderedIds[i + 1],
      });
    }
  }

  /** Reload guides + sections from WASM, then re-scope the selected guide's sections. */
  function reload() {
    if (!guideTypeId) return;
    const sectionTypeIds = new Set(sectionTypeList.map((st) => st.typeId));
    const all = listRecords(repo, {});
    guides = all.filter((r) => r.typeId === guideTypeId);
    sections = all.filter((r) => sectionTypeIds.has(r.typeId));
    refreshSections();
  }

  // ---------------------------------------------------------------------------
  // Boot: load blueprint schema (runs once on mount — not reactive)
  // ---------------------------------------------------------------------------
  onMount(() => {
    try {
      const result = blueprintSchema(repo, GUIDE_BLUEPRINT_ID);
      if (result.diagnostics.length > 0) {
        schemaError = result.diagnostics.join("; ");
      }
      const schema = result.schema;
      sectionTypeList = sectionTypes(schema);
      const rootId = rootTypeId(schema);
      guideTypeId = rootId;
      const fields = rootFields(schema);
      if (rootId) {
        guideFormDef = {
          typeId: rootId,
          typeVersion: 1,
          typeNamespace: "com.mudemocracy",
          typeName: "guide",
          label: "Guide",
          fields,
        };
        // Derive guide title field ID from the "title" property in the root definition.
        const guideDef = schema.definitions[rootId];
        if (guideDef) {
          const titleProp = Object.entries(guideDef.properties).find(([n]) => n === "title");
          guideTitleFieldId = titleProp?.[1]["x-srs-field-id"] ?? null;
        }
      }
      // Derive section heading field ID from the "heading" property in any section type.
      const firstSt = sectionTypes(schema)[0];
      if (firstSt) {
        const stDef = schema.definitions[firstSt.typeId];
        if (stDef) {
          const headingProp = Object.entries(stDef.properties).find(([n]) => n === "heading");
          sectionHeadingFieldId = headingProp?.[1]["x-srs-field-id"] ?? null;
        }
      }
      reload();
    } catch (e) {
      schemaError = `Blueprint schema load failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  });

  // ---------------------------------------------------------------------------
  // Form actions
  // ---------------------------------------------------------------------------

  function openNewGuide() {
    if (!guideFormDef) return;
    formMode = "create-guide";
    activeFormDef = guideFormDef;
    editingRecord = null;
    formError = null;
  }

  function openEditGuide(guide: SrsRecord) {
    if (!guideFormDef) return;
    formMode = "edit-guide";
    activeFormDef = guideFormDef;
    editingRecord = guide;
    formError = null;
  }

  function openNewSection(descriptor: SectionTypeDescriptor) {
    sectionPickerOpen = false;
    createSectionTypeId = descriptor.typeId;
    createSectionTypeVersion = descriptor.typeVersion;
    formMode = "create-section";
    activeFormDef = {
      typeId: descriptor.typeId,
      typeVersion: descriptor.typeVersion,
      typeNamespace: "com.mudemocracy",
      typeName: descriptor.label,
      label: descriptor.label,
      fields: descriptor.fields,
    };
    editingRecord = null;
    formError = null;
  }

  function openEditSection(section: SrsRecord) {
    const descriptor = sectionTypeList.find((st) => st.typeId === section.typeId);
    if (!descriptor) return;
    formMode = "edit-section";
    activeFormDef = {
      typeId: descriptor.typeId,
      typeVersion: descriptor.typeVersion,
      typeNamespace: "com.mudemocracy",
      typeName: descriptor.label,
      label: descriptor.label,
      fields: descriptor.fields,
    };
    editingRecord = section;
    formError = null;
  }

  function cancelForm() {
    formMode = null;
    activeFormDef = null;
    editingRecord = null;
    formError = null;
  }

  /** Move a section one slot up (dir = -1) or down (dir = +1), rewriting precedes. */
  function moveSection(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= orderedSections.length) return;
    const ids = orderedSections.map((s) => s.instanceId);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    rebuildPrecedesChain(ids, ids);
    reload();
  }

  /** Remove a section: drop it from the chain + container membership, then delete it. */
  function removeSection(section: SrsRecord) {
    const beforeIds = orderedSections.map((s) => s.instanceId);
    const remaining = beforeIds.filter((id) => id !== section.instanceId);
    rebuildPrecedesChain(remaining, beforeIds);
    if (selectedContainerId) {
      removeContainerMember(repo, selectedContainerId, section.instanceId);
    }
    deleteRecord(repo, section.instanceId);
    reload();
  }

  async function handleSave(input: CreateRecordInput | UpdateRecordInput) {
    formSaving = true;
    formError = null;
    try {
      if (formMode === "create-guide" && guideTypeId) {
        const created = createRecord(repo, guideTypeId, 1, input as CreateRecordInput);
        reload();
        selectedGuideId = created.instanceId;
        cancelForm();
      } else if (formMode === "edit-guide" && editingRecord) {
        updateRecord(repo, editingRecord.instanceId, input as UpdateRecordInput);
        reload();
        cancelForm();
      } else if (formMode === "create-section" && createSectionTypeId) {
        const created = createRecord(
          repo,
          createSectionTypeId,
          createSectionTypeVersion,
          input as CreateRecordInput
        );
        // Join the guide's container and append to the end of the precedes chain.
        if (selectedContainerId) {
          addContainerMember(repo, selectedContainerId, created.instanceId);
          const lastId = orderedSections[orderedSections.length - 1]?.instanceId;
          if (lastId) {
            createRelation(repo, {
              relationType: "precedes",
              sourceInstanceId: lastId,
              targetInstanceId: created.instanceId,
            });
          }
        }
        reload();
        cancelForm();
      } else if (formMode === "edit-section" && editingRecord) {
        updateRecord(repo, editingRecord.instanceId, input as UpdateRecordInput);
        reload();
        cancelForm();
      }
    } catch (e) {
      formError = e instanceof Error ? e.message : String(e);
    } finally {
      formSaving = false;
    }
  }

  function handleExport() {
    const srsj = exportSrsj(repo);
    download(srsj, `${repoName.replace(/\s+/g, "-").toLowerCase()}.srsj`);
  }

  /** Export error (non-fatal; shown in the shell). */
  let exportError = $state<string | null>(null);

  /**
   * C10 — export the selected guide as a JSON DocumentViewProjection.
   * Resolves the guide's container (it is that container's root), renders the
   * guide-body document view as JSON, and downloads the projection.
   */
  function handleExportGuideJson() {
    exportError = null;
    if (!selectedGuideId) return;
    try {
      const containers = listContainers(repo, { rootInstanceId: selectedGuideId });
      if (containers.length === 0) {
        exportError = "No container found for this guide — cannot resolve its sections to render.";
        return;
      }
      const containerId = containers[0].containerId;
      const result = renderDocumentView(repo, GUIDE_VIEW_ID, "json", containerId);
      if (!result.projection) {
        exportError = `Render produced no projection${
          result.diagnostics.length ? `: ${result.diagnostics.join("; ")}` : ""
        }`;
        return;
      }
      const guide = guides.find((g) => g.instanceId === selectedGuideId);
      const name = guide ? guideLabel(guide) : "guide";
      const slug = name.replace(/\s+/g, "-").toLowerCase();
      download(JSON.stringify(result.projection, null, 2), `${slug}.guide-view.json`);
    } catch (e) {
      exportError = `Export failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** Trigger a browser download of `content` as `filename`. */
  function download(content: string, filename: string) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="guides-shell" data-testid="guides-shell">
  <!-- ======================================================================
       Header
       ====================================================================== -->
  <header class="guides-shell__header">
    <span class="guides-shell__eyebrow">srs · guides</span>
    <h1 class="guides-shell__repo">{repoName}</h1>
    <div class="guides-shell__actions">
      <button
        class="guides-shell__action-btn"
        data-testid="guides-export-btn"
        onclick={handleExport}
        title="Export .srsj"
      >Export .srsj</button>
      <button
        class="guides-shell__action-btn guides-shell__action-btn--muted"
        onclick={onOpenAnother}
      >Open another file</button>
    </div>
  </header>

  {#if schemaError}
    <div class="guides-shell__error" role="alert">{schemaError}</div>
  {/if}

  <!-- ======================================================================
       Main two-column layout
       ====================================================================== -->
  <div class="guides-shell__body">
    <!-- ----------------------------------------------------------------
         Left: Guide list
         ---------------------------------------------------------------- -->
    <aside class="guides-shell__sidebar">
      <div class="guides-shell__sidebar-header">
        <span class="guides-shell__sidebar-title">Guides</span>
        <button
          class="guides-shell__new-btn"
          data-testid="guides-new-guide"
          onclick={openNewGuide}
        >+ New</button>
      </div>

      <ul class="guides-shell__guide-list" data-testid="guides-guide-list">
        {#each guides as guide (guide.instanceId)}
          <li>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="guides-shell__guide-item"
              class:guides-shell__guide-item--active={guide.instanceId === selectedGuideId}
              data-testid="guides-guide-item"
              onclick={() => {
                selectedGuideId = guide.instanceId;
                cancelForm();
                refreshSections();
              }}
            >
              {guideLabel(guide)}
            </div>
          </li>
        {/each}
        {#if guides.length === 0}
          <li class="guides-shell__empty">No guides yet</li>
        {/if}
      </ul>
    </aside>

    <!-- ----------------------------------------------------------------
         Right: Detail + form area
         ---------------------------------------------------------------- -->
    <main class="guides-shell__main">
      {#if formMode !== null && activeFormDef !== null}
        <!-- Form panel -->
        <div class="guides-shell__form-panel">
          <RecordForm
            schema={activeFormDef}
            record={editingRecord}
            onSave={handleSave}
            onCancel={cancelForm}
            saving={formSaving}
            saveError={formError}
          />
        </div>
      {:else if selectedGuideId}
        {@const selectedGuide = guides.find((g) => g.instanceId === selectedGuideId)}
        {#if selectedGuide}
          <div class="guides-shell__detail">
            <!-- Guide header -->
            <div class="guides-shell__detail-header">
              <h2 class="guides-shell__detail-title">{guideLabel(selectedGuide)}</h2>
              <button
                class="guides-shell__action-btn"
                data-testid="guides-export-guide-json"
                onclick={handleExportGuideJson}
                title="Export this guide as a JSON document-view projection"
              >Export guide JSON</button>
              <button
                class="guides-shell__action-btn"
                data-testid="guides-edit-guide"
                onclick={() => openEditGuide(selectedGuide)}
              >Edit</button>
            </div>

            {#if exportError}
              <div class="guides-shell__error" role="alert" data-testid="guides-export-error">
                {exportError}
              </div>
            {/if}

            <!-- Section controls -->
            <div class="guides-shell__section-bar">
              <span class="guides-shell__section-label">Sections</span>
              <div class="guides-shell__section-picker-wrap">
                <button
                  class="guides-shell__new-btn"
                  data-testid="guides-add-section"
                  onclick={() => { sectionPickerOpen = !sectionPickerOpen; }}
                >+ Add Section</button>
                {#if sectionPickerOpen}
                  <div class="guides-shell__section-picker" role="menu">
                    {#each sectionTypeList as st (st.typeId)}
                      <button
                        class="guides-shell__section-type-btn"
                        data-testid="guides-section-type-{st.typeId}"
                        onclick={() => openNewSection(st)}
                        role="menuitem"
                      >{st.label}</button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Section list -->
            <ul class="guides-shell__section-list" data-testid="guides-section-list">
              {#each orderedSections as section, index (section.instanceId)}
                <li class="guides-shell__section-row" data-testid="guides-section-item">
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="guides-shell__section-item"
                    data-testid="guides-section-open"
                    onclick={() => openEditSection(section)}
                  >
                    <span class="guides-shell__section-type">{sectionTypeName(section)}</span>
                    <span class="guides-shell__section-heading">{sectionLabel(section)}</span>
                  </div>
                  <div class="guides-shell__section-controls">
                    <button
                      class="guides-shell__icon-btn"
                      data-testid="guides-section-up"
                      title="Move up"
                      disabled={index === 0}
                      onclick={() => moveSection(index, -1)}
                    >↑</button>
                    <button
                      class="guides-shell__icon-btn"
                      data-testid="guides-section-down"
                      title="Move down"
                      disabled={index === orderedSections.length - 1}
                      onclick={() => moveSection(index, 1)}
                    >↓</button>
                    <button
                      class="guides-shell__icon-btn guides-shell__icon-btn--danger"
                      data-testid="guides-section-remove"
                      title="Remove section"
                      onclick={() => removeSection(section)}
                    >✕</button>
                  </div>
                </li>
              {/each}
              {#if orderedSections.length === 0}
                <li class="guides-shell__empty">No sections yet — use "Add Section" above</li>
              {/if}
            </ul>
          </div>
        {/if}
      {:else}
        <div class="guides-shell__placeholder">
          <p>Select a guide from the list, or create a new one.</p>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  .guides-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--font-sans, sans-serif);
    overflow: hidden;
  }

  /* Header */
  .guides-shell__header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 1.25rem;
    background: var(--color-surface-1, #f5f5f5);
    border-bottom: 1px solid var(--color-border, #ddd);
    flex-shrink: 0;
  }
  .guides-shell__eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted, #888);
    flex-shrink: 0;
  }
  .guides-shell__repo {
    flex: 1;
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .guides-shell__actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .guides-shell__action-btn {
    font-size: 0.8rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  .guides-shell__action-btn--muted {
    color: var(--color-muted, #888);
  }

  /* Error banner */
  .guides-shell__error {
    padding: 0.5rem 1.25rem;
    background: #fef2f2;
    color: #b91c1c;
    font-size: 0.85rem;
    border-bottom: 1px solid #fca5a5;
  }

  /* Two-column body */
  .guides-shell__body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Sidebar */
  .guides-shell__sidebar {
    width: 220px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border, #ddd);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .guides-shell__sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem 0.5rem;
    border-bottom: 1px solid var(--color-border, #eee);
  }
  .guides-shell__sidebar-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted, #888);
  }
  .guides-shell__new-btn {
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  .guides-shell__guide-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0;
    overflow-y: auto;
    flex: 1;
  }
  .guides-shell__guide-item {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    cursor: pointer;
    border-left: 2px solid transparent;
  }
  .guides-shell__guide-item:hover {
    background: var(--color-surface-hover, #f0f0f0);
  }
  .guides-shell__guide-item--active {
    border-left-color: var(--color-accent, #3b82f6);
    background: var(--color-surface-active, #eff6ff);
    font-weight: 500;
  }
  .guides-shell__empty {
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    color: var(--color-muted, #aaa);
    font-style: italic;
  }

  /* Main detail area */
  .guides-shell__main {
    flex: 1;
    overflow-y: auto;
  }
  .guides-shell__form-panel {
    max-width: 640px;
    padding: 1rem;
  }
  .guides-shell__detail {
    padding: 1.25rem 1.5rem;
  }
  .guides-shell__detail-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .guides-shell__detail-title {
    flex: 1;
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
  }

  /* Section controls */
  .guides-shell__section-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border, #eee);
  }
  .guides-shell__section-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted, #888);
  }
  .guides-shell__section-picker-wrap {
    position: relative;
  }
  .guides-shell__section-picker {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: white;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    z-index: 10;
    min-width: 180px;
    overflow: hidden;
  }
  .guides-shell__section-type-btn {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
    border: none;
    background: transparent;
    cursor: pointer;
  }
  .guides-shell__section-type-btn:hover {
    background: var(--color-surface-hover, #f5f5f5);
  }

  /* Section list */
  .guides-shell__section-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .guides-shell__section-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 1px solid var(--color-border, #eee);
  }
  .guides-shell__section-item {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.5rem 0.25rem;
    cursor: pointer;
    border-radius: 4px;
    flex: 1;
    min-width: 0;
  }
  .guides-shell__section-item:hover {
    background: var(--color-surface-hover, #f5f5f5);
  }
  .guides-shell__section-controls {
    display: flex;
    gap: 0.2rem;
    flex-shrink: 0;
  }
  .guides-shell__icon-btn {
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
  .guides-shell__icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .guides-shell__icon-btn:not(:disabled):hover {
    background: var(--color-surface-hover, #f0f0f0);
  }
  .guides-shell__icon-btn--danger {
    color: #b91c1c;
    border-color: #fca5a5;
  }
  .guides-shell__section-type {
    font-size: 0.7rem;
    color: var(--color-muted, #888);
    background: var(--color-surface-1, #f0f0f0);
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    flex-shrink: 0;
  }
  .guides-shell__section-heading {
    font-size: 0.9rem;
  }

  /* Placeholder */
  .guides-shell__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-muted, #aaa);
    font-size: 0.9rem;
  }
</style>
