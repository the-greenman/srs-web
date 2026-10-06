<!--
  GuidesShell — blueprint-schema-driven guides editor.

  Loads the guide blueprint schema from the WASM repository, then renders forms
  for guide and section types generically from the schema definitions. No form
  fields are hardcoded; all derive from `blueprintSchema()`.

  ADR-001: zero SRS semantics in TypeScript.
  ADR-003: Blueprint drives authoring; document views drive rendering.
  C8 blueprint-schema-driven guides renderer: srs-web#26
  srs-web#39: ported to shared AppShell/Nav/Inspector design system
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    blueprintSchema,
    listBlueprints,
    listTypes,
    listDocumentViews,
    listRecords,
    createRecord,
    updateRecord,
    listContainers,
    resolveContainerView,
    orderByPrecedes,
    renderDocumentView,
  } from "$lib/srs-client.js";
  import type { SrsRepository, SrsRecord, CreateRecordInput, UpdateRecordInput, DocumentViewSummary, ContainerView } from "$lib/srs-client.js";
  import { findBlueprint, documentViewsForBlueprint } from "$lib/discovery.js";
  import ViewPicker from "$lib/components/ViewPicker.svelte";
  import type { TypeFormDef } from "$lib/governance/types.js";
  import {
    sectionTypes,
    rootFields,
    rootTypeId,
    labelsByTypeId,
    type SectionTypeDescriptor,
  } from "$lib/guides/blueprint-utils.js";
  import { insertComponent, moveComponent, removeComponent } from "$lib/editor/document-ops.js";
  import RecordForm from "$lib/components/RecordForm.svelte";
  import SectionForm from "$lib/editor/SectionForm.svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import Breadcrumb from "$lib/components/Breadcrumb.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import NavGroup from "$lib/components/NavGroup.svelte";
  import NavItem from "$lib/components/NavItem.svelte";
  import Main from "$lib/components/Main.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import InspectorTrigger from "$lib/components/InspectorTrigger.svelte";
  import NavTrigger from "$lib/components/NavTrigger.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import { BASE_GROUPS, commonActions } from "$lib/components/shell-actions.js";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import Workspace from "$lib/components/Workspace.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import Button from "$lib/components/Button.svelte";
  import PreviewPane from "$lib/components/PreviewPane.svelte";
  import { PREVIEW_THEMES, THEME_DEFAULT } from "$lib/guides/preview-themes.js";
  import { downloadDocument } from "$lib/storage/index.js";
  import { slugifyFilename } from "$lib/slug.js";
  import { printHtml } from "$lib/guides/print-html.js";
  import type { BreadcrumbItem } from "$lib/types.js";
  import InstanceNotes from "$lib/InstanceNotes.svelte";

  // ---------------------------------------------------------------------------
  // Well-known blueprint identity for this opinionated editor (ADR-008).
  // The blueprint is found by name; document views are discovered via UUID-chain
  // join (rootTypeRefs) using the root type UUID from blueprintSchema().
  // ---------------------------------------------------------------------------
  const WELL_KNOWN_BLUEPRINT = { namespace: "com.mudemocracy", name: "guide" } as const;

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------
  interface Props {
    repo: SrsRepository;
    repoName: string;
    documentProvider: string;
    onExport: () => void;
    onExportSrsj?: () => void;
    /** Write back to the opened cloud/git document. Undefined for read-only handles. */
    onSave?: () => Promise<void>;
    /** Why `onSave` is undefined, shown where the Save button would be. Null when writable or unknown. */
    readOnlyReason?: string | null;
    saving?: boolean;
    /** App-owned dirty state, shared with non-UI repository writers. */
    documentDirty?: boolean;
    /** Changes after mount invalidate derived browser projections of the repository. */
    documentRevision?: number;
    onOpenAnother: () => void;
    /** Go > Agents…: open the agent library. */
    onOpenAgents?: () => void;
    /** Part of the common EditorShellProps; unused by this shell. */
    onOpenExplorer?: () => void;
  }
  let {
    repo,
    repoName,
    documentProvider,
    onExport,
    onExportSrsj,
    onSave,
    readOnlyReason = null,
    saving = false,
    documentDirty = false,
    documentRevision = 0,
    onOpenAnother,
    onOpenAgents,
  }: Props = $props();

  const shell = new ShellState({ wideEnabled: true });
  const barActions = $derived(
    commonActions(
      {
        onsave: onSave ? () => void onSave() : undefined,
        onexport: onExport,
        onexportsrsj: onExportSrsj,
        onopenanother: onOpenAnother,
        onopenagents: onOpenAgents,
      },
      { shell, saving },
    ),
  );

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

  /** Currently selected guide instance ID. */
  let selectedGuideId = $state<string | null>(null);

  /** Form mode. */
  type FormMode = "create-guide" | "edit-guide" | "create-section" | "edit-section";
  let formMode = $state<FormMode | null>(null);

  /** Schema for the currently open form. */
  let activeFormDef = $state<TypeFormDef | null>(null);

  /** Descriptor (fields + groups) for the currently open section form, if any. */
  let activeSectionDescriptor = $state<SectionTypeDescriptor | null>(null);

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

  /** Export error (non-fatal; shown in the shell). */
  let exportError = $state<string | null>(null);

  /** Count of size warnings from `repo.validate()`. Non-zero triggers the advisory banner. */
  let warnCount = $state(0);
  /** Count of validation errors from `repo.validate()`. Non-zero suppresses the warning banner. */
  let errorCount = $state(0);

  /** HTML preview of the selected guide (rendered via renderDocumentView "html"). */
  let previewHtml = $state<string | null>(null);
  let previewLoading = $state(false);

  /** Selected preview theme ID; drives selectedThemeCss. */
  let selectedThemeId = $state("default");
  const selectedThemeCss = $derived(
    PREVIEW_THEMES.find((t) => t.id === selectedThemeId)?.css ?? THEME_DEFAULT
  );

  /** Document views discovered for the guide blueprint (ADR-008 UUID-chain join). */
  let availableViews = $state<DocumentViewSummary[]>([]);

  /** Currently selected document-view ID for preview/export. Null until discovery completes. */
  let guideViewId = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function refreshValidation(): void {
    try {
      const report = repo.validate();
      warnCount = report.summary.warnings;
      errorCount = report.summary.errors;
    } catch {
      // validate() failure leaves counts at 0 — no false-positive banner shown
    }
  }

  /** Derive the human-readable type name for a section record. */
  function sectionTypeName(record: SrsRecord): string {
    const st = sectionTypeList.find((s) => s.typeId === record.typeId);
    return st?.label ?? record.typeName ?? "Section";
  }

  /** The selected guide's container id (the guide is its root), or null. */
  let selectedContainerId = $state<string | null>(null);

  // The loaded WASM repository is mutated in place, so external writers need
  // this App-owned revision signal to refresh editor projections.
  let observedDocumentRevision = $state<number | null>(null);
  $effect(() => {
    if (documentRevision === observedDocumentRevision) return;
    observedDocumentRevision = documentRevision;
    reload();
    refreshValidation();
  });

  /** Sections of the selected guide, scoped to its container and in precedes order. */
  let orderedSections = $state<SrsRecord[]>([]);

  /** Resolve the selected guide's container and rebuild the ordered section list. */
  function refreshSections() {
    selectedContainerId = null;
    orderedSections = [];
    if (!selectedGuideId) return;
    const containers = listContainers(repo, { anchorInstanceId: selectedGuideId });
    if (containers.length === 0) return;
    selectedContainerId = containers[0].containerId;
    const view: ContainerView = resolveContainerView(repo, selectedContainerId);
    // The guide's own record is commonly also a member of its container (srs-web#189);
    // it is the container's root/identity, not a section — keep it out of the section
    // list and out of the precedes chain that add/remove/reorder rebuild from this list.
    // The root comes from the core's resolveContainerView; selectedGuideId is only the
    // fallback when the binding reports no root.
    const rootId = view.root?.instanceId ?? selectedGuideId;
    const sectionRecords = view.members
      .filter((m) => m.tier > 0 && m.record.instanceId !== rootId)
      .map((m) => m.record);
    const ids = sectionRecords.map((s) => s.instanceId);
    const orderedIds = orderByPrecedes(repo, ids);
    const byId = new Map(sectionRecords.map((s) => [s.instanceId, s]));
    orderedSections = orderedIds.map((id) => byId.get(id)).filter((r): r is SrsRecord => r !== undefined);
  }

  /** Render the selected guide to HTML for the preview pane. */
  function refreshPreview() {
    if (!selectedGuideId || !selectedContainerId || !guideViewId) {
      previewHtml = null;
      return;
    }
    previewLoading = true;
    try {
      const result = renderDocumentView(repo, guideViewId, "html", selectedContainerId);
      previewHtml = result.rendered && result.rendered.trim() ? result.rendered : null;
    } catch {
      previewHtml = null;
    } finally {
      previewLoading = false;
    }
  }

  /** Reload guides from WASM, then re-scope the selected guide's sections. */
  function reload() {
    if (!guideTypeId) return;
    const all = listRecords(repo, {});
    guides = all.filter((r) => r.typeId === guideTypeId);
    refreshSections();
    refreshPreview();
  }

  // ---------------------------------------------------------------------------
  // Boot: discover blueprint + views, load schema (runs once on mount)
  // ---------------------------------------------------------------------------
  onMount(() => {
    try {
      // ADR-008: UUID-chain join — load blueprint schema first to get root type UUID,
      // then use it to discover paired document views via rootTypeRefs.
      const bps = listBlueprints(repo).summaries;
      const blueprint = findBlueprint(bps, WELL_KNOWN_BLUEPRINT.namespace, WELL_KNOWN_BLUEPRINT.name);
      if (!blueprint) {
        schemaError = `Guide blueprint not found (${WELL_KNOWN_BLUEPRINT.namespace}/${WELL_KNOWN_BLUEPRINT.name})`;
        return;
      }

      const result = blueprintSchema(repo, blueprint.id);
      if (result.diagnostics.length > 0) {
        // Non-fatal: the WASM projection degrades gracefully (e.g. an unparsed
        // relation cardinality omits minItems/maxItems) but still returns a usable
        // schema. Only a missing root type below is fatal to the guides editor —
        // surfacing warnings here previously blanked the whole editor.
        console.warn("blueprintSchema diagnostics:", result.diagnostics);
      }
      const schema = result.schema;
      const rootId = rootTypeId(schema);
      if (!rootId) {
        schemaError =
          result.diagnostics.length > 0
            ? result.diagnostics.join("; ")
            : `Blueprint schema has no root type (${WELL_KNOWN_BLUEPRINT.namespace}/${WELL_KNOWN_BLUEPRINT.name})`;
        return;
      }

      const allViews = listDocumentViews(repo);
      // Sort deterministically by name so the auto-selected view is stable.
      const views = documentViewsForBlueprint(rootId, allViews).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      availableViews = views;
      guideViewId = views[0]?.id ?? null;
      if (views.length === 0) {
        schemaError = `No document views found for blueprint ${WELL_KNOWN_BLUEPRINT.namespace}/${WELL_KNOWN_BLUEPRINT.name} — preview and export unavailable.`;
      }

      // Blueprint $refs carry no type version — resolve current versions from the
      // package (post-RFC-039 migrations bump section types past @1).
      const installedTypes = listTypes(repo);
      const versionByTypeId = new Map(installedTypes.map((t) => [t.id, t.version]));
      sectionTypeList = sectionTypes(schema, versionByTypeId, labelsByTypeId(installedTypes));
      guideTypeId = rootId;
      const fields = rootFields(schema);
      guideFormDef = {
        typeId: rootId,
        typeVersion: versionByTypeId.get(rootId) ?? 1,
        typeNamespace: "com.mudemocracy",
        typeName: "guide",
        label: "Guide",
        fields,
      };
      reload();
    } catch (e) {
      schemaError = `Blueprint schema load failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      refreshValidation();
    }
  });

  // ---------------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------------

  function guideCrumbItems(): BreadcrumbItem[] {
    const items: BreadcrumbItem[] = [{ label: repoName, title: `Opened from ${documentProvider}` }];
    if (formMode === "create-guide") {
      items.push({ label: "New guide" });
      return items;
    }
    const guide = selectedGuideId
      ? guides.find((g) => g.instanceId === selectedGuideId)
      : null;
    if (!guide) return items;
    if (formMode !== null) {
      items.push({ label: guide.displayLabel ?? "Untitled Guide", onclick: cancelForm });
      if (formMode === "edit-guide") {
        items.push({ label: "Edit body" });
      } else if (formMode === "create-section") {
        items.push({ label: `New ${activeSectionDescriptor?.label ?? "section"}` });
      } else if (formMode === "edit-section" && editingRecord) {
        items.push({ label: editingRecord.displayLabel || "Untitled Section" });
      }
    } else {
      items.push({ label: guide.displayLabel ?? "Untitled Guide" });
    }
    return items;
  }

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
    activeSectionDescriptor = descriptor;
    activeFormDef = null;
    editingRecord = null;
    formError = null;
  }

  function openEditSection(section: SrsRecord) {
    const descriptor = sectionTypeList.find((st) => st.typeId === section.typeId);
    if (!descriptor) return;
    formMode = "edit-section";
    activeSectionDescriptor = descriptor;
    activeFormDef = null;
    editingRecord = section;
    formError = null;
  }

  function cancelForm() {
    formMode = null;
    activeFormDef = null;
    activeSectionDescriptor = null;
    editingRecord = null;
    formError = null;
  }

  /** Move a section one slot up (dir = -1) or down (dir = +1), chain-local (srs-web#322). */
  function moveSection(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= orderedSections.length) return;
    const instanceId = orderedSections[index].instanceId;
    const anchor = dir === -1
      ? { beforeId: orderedSections[j].instanceId }
      : { afterId: orderedSections[j].instanceId };
    moveComponent(repo, { instanceId, ...anchor }, () => {
      reload();
    });
  }

  /** Remove a section: unlink it from the chain + container membership, then delete it (srs-web#322). */
  function removeSection(section: SrsRecord) {
    if (!selectedContainerId) return;
    removeComponent(repo, { instanceId: section.instanceId, containerId: selectedContainerId }, () => {
      reload();
    });
  }

  async function handleSave(input: CreateRecordInput | UpdateRecordInput) {
    formSaving = true;
    formError = null;
    try {
      if (formMode === "create-guide" && guideTypeId) {
        // TODO(srs-rust#1126): this creates only the root record — there is no
        // WASM binding to create a container yet, so a freshly created guide has
        // nowhere to add sections until srs-rust#1126 ships a create_container
        // binding. Tracked as a known gap, not fixed here (srs-web#322).
        const created = createRecord(repo, guideTypeId, guideFormDef?.typeVersion ?? 1, input as CreateRecordInput);
        reload();
        selectedGuideId = created.instanceId;
        cancelForm();
      } else if (formMode === "edit-guide" && editingRecord) {
        updateRecord(repo, editingRecord.instanceId, input as UpdateRecordInput);
        reload();
        cancelForm();
      } else if (formMode === "create-section" && createSectionTypeId && selectedContainerId) {
        // Create in the guide's container and append to the end of the precedes chain
        // (srs-web#322 — chain-local splice binding replaces the manual relation rebuild).
        const lastId = orderedSections[orderedSections.length - 1]?.instanceId;
        insertComponent(repo, {
          typeId: createSectionTypeId,
          typeVersion: createSectionTypeVersion,
          containerId: selectedContainerId,
          afterId: lastId,
          fieldValues: (input as CreateRecordInput).fieldValues,
        });
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

  /**
   * C10 — export the selected guide as a JSON DocumentViewProjection.
   * Resolves the guide's container (it is that container's root), renders the
   * guide-body document view as JSON, and downloads the projection.
   */
  function handleExportGuideJson() {
    exportError = null;
    if (!selectedGuideId) return;
    try {
      const containers = listContainers(repo, { anchorInstanceId: selectedGuideId });
      if (containers.length === 0) {
        exportError = "No container found for this guide — cannot resolve its sections to render.";
        return;
      }
      const containerId = containers[0].containerId;
      if (!guideViewId) {
        exportError = "No document view discovered for this guide — cannot export.";
        return;
      }
      const result = renderDocumentView(repo, guideViewId, "json", containerId);
      if (!result.projection) {
        exportError = `Render produced no projection${
          result.diagnostics.length ? `: ${result.diagnostics.join("; ")}` : ""
        }`;
        return;
      }
      const guide = guides.find((g) => g.instanceId === selectedGuideId);
      const name = guide?.displayLabel ?? "guide";
      const slug = slugifyFilename(name);
      downloadDocument(JSON.stringify(result.projection, null, 2), `${slug}.guide-view.json`);
    } catch (e) {
      exportError = `Export failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function handleExportMarkdown() {
    exportError = null;
    try {
      if (!selectedGuideId || !selectedContainerId || !guideViewId) return;
      const result = renderDocumentView(repo, guideViewId, "markdown", selectedContainerId);
      if (!result.rendered) {
        exportError = "Render produced no content.";
        return;
      }
      const guide = guides.find((g) => g.instanceId === selectedGuideId);
      const title = guide?.displayLabel ?? "guide";
      const slug = slugifyFilename(title);
      const blob = new Blob([result.rendered], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      exportError = `Markdown export failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function handlePrint() {
    if (!previewHtml) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(printHtml(selectedThemeCss, previewHtml));
    win.document.close();
    win.focus();
    win.print();
  }

</script>

<div data-testid="guides-shell">
  <AppShell {shell} navLabel="Guides navigation" inspectorLabel="Guide">
    {#snippet nav()}
      <Nav repo={repoName} eyebrow="srs · guides">
        {#snippet children()}
          <NavGroup label="Guides">
            <div data-testid="guides-guide-list">
              {#each guides as guide (guide.instanceId)}
                <NavItem
                  testid="guides-guide-item"
                  label={guide.displayLabel ?? "Untitled Guide"}
                  active={guide.instanceId === selectedGuideId}
                  onclick={() => {
                    selectedGuideId = guide.instanceId;
                    cancelForm();
                    refreshSections();
                    refreshPreview();
                  }}
                />
              {/each}
              {#if guides.length === 0}
                <p class="guides-nav__empty">No guides yet</p>
              {/if}
            </div>
          </NavGroup>
        {/snippet}
        {#snippet footer()}
          <Button
            size="sm"
            variant="ghost"
            onDark
            data-testid="guides-new-guide"
            onclick={openNewGuide}
            disabled={saving}
          >+ New guide</Button>
        {/snippet}
      </Nav>
    {/snippet}

    {#snippet main()}
      <Main>
        {#snippet bar()}
          <Toolbar title={repoName} actions={barActions} groups={BASE_GROUPS}>
            {#snippet lead()}<NavTrigger />{/snippet}
            {#snippet titleSlot()}<Breadcrumb items={guideCrumbItems()} />{/snippet}
            {#snippet status()}
              {#if documentDirty}<span data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
            {/snippet}
            {#snippet trail()}<InspectorTrigger />{/snippet}
          </Toolbar>
        {/snippet}

        <!-- The reason is a sentence: a line under the bar rather than in the one-row bar. -->
        {#if !onSave && readOnlyReason}<Notice kind="info" testid="readonly-reason">{readOnlyReason}</Notice>{/if}

        {#if warnCount > 0 && errorCount === 0}
          <Notice kind="warning" testid="size-warning">
            {warnCount} size warning{warnCount === 1 ? "" : "s"} — see Repository panel for details.
          </Notice>
        {/if}

        {#if schemaError}
          <Notice kind="error" testid="guides-error">{schemaError}</Notice>
        {/if}

        <Workspace>
          {#if formMode !== null && activeSectionDescriptor !== null}
            <div class="guides-form-panel">
              <SectionForm
                label={activeSectionDescriptor.label}
                fields={activeSectionDescriptor.fields}
                composites={activeSectionDescriptor.composites}
                record={editingRecord}
                onSave={handleSave}
                onCancel={cancelForm}
                saving={formSaving}
                saveError={formError}
              />
            </div>
          {:else if formMode !== null && activeFormDef !== null}
            <div class="guides-form-panel">
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
              <div class="guides-detail">
                <div class="guides-detail__header">
                  <h2 class="guides-detail__title">{selectedGuide.displayLabel ?? "Untitled Guide"}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="guides-export-guide-json"
                    onclick={handleExportGuideJson}
                    title="Export this guide as a JSON document-view projection"
                  >Export guide JSON</Button>
                </div>

                {#if exportError}
                  <Notice kind="error" testid="guides-export-error">{exportError}</Notice>
                {/if}

                <div class="guides-section-bar guides-body-bar">
                  <span class="guides-section-label">Body</span>
                </div>
                <div class="guides-section-row guides-body-row" data-testid="guides-body-row">
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="guides-body-item"
                    data-testid="guides-body-open"
                    onclick={() => openEditGuide(selectedGuide)}
                  >
                    <span class="guides-section-type">{guideFormDef?.label ?? "Guide"}</span>
                    <span class="guides-section-heading">{selectedGuide.displayLabel ?? "Untitled Guide"}</span>
                  </div>
                  <div class="guides-section-controls">
                    <Button
                      variant="ghost"
                    size="sm"
                      data-testid="guides-edit-guide"
                      onclick={() => openEditGuide(selectedGuide)}
                    >Edit</Button>
                  </div>
                </div>

                <div class="guides-section-bar">
                  <span class="guides-section-label">Sections</span>
                  <div class="guides-section-picker-wrap">
                    <Button
                      variant="ghost"
                    size="sm"
                      data-testid="guides-add-section"
                      onclick={() => { sectionPickerOpen = !sectionPickerOpen; }}
                    >+ Add Section</Button>
                    {#if sectionPickerOpen}
                      <div class="guides-section-picker" role="menu">
                        {#each sectionTypeList as st (st.typeId)}
                          <button
                            class="guides-section-type-btn"
                            data-testid="guides-section-type-{st.typeId}"
                            onclick={() => openNewSection(st)}
                            role="menuitem"
                          >{st.label}</button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>

                <ul class="guides-section-list" data-testid="guides-section-list">
                  {#each orderedSections as section, index (section.instanceId)}
                    <li class="guides-section-row" data-testid="guides-section-item">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="guides-section-item"
                        data-testid="guides-section-open"
                        onclick={() => openEditSection(section)}
                      >
                        <span class="guides-section-type">{sectionTypeName(section)}</span>
                        <span
                          class="guides-section-heading"
                          data-testid="guides-section-heading"
                        >{section.displayLabel || "Untitled Section"}</span>
                      </div>
                      <div class="guides-section-controls">
                        <button
                          class="guides-icon-btn"
                          data-testid="guides-section-up"
                          title="Move up"
                          disabled={saving || index === 0}
                          onclick={() => moveSection(index, -1)}
                        >↑</button>
                        <button
                          class="guides-icon-btn"
                          data-testid="guides-section-down"
                          title="Move down"
                          disabled={saving || index === orderedSections.length - 1}
                          onclick={() => moveSection(index, 1)}
                        >↓</button>
                        <button
                          class="guides-icon-btn guides-icon-btn--danger"
                          data-testid="guides-section-remove"
                          title="Remove section"
                          onclick={() => removeSection(section)}
                          disabled={saving}
                        >✕</button>
                      </div>
                    </li>
                  {/each}
                  {#if orderedSections.length === 0}
                    <li class="guides-section-empty">No sections yet — use "Add Section" above</li>
                  {/if}
                </ul>
              </div>
            {/if}
          {:else}
            <p class="guides-placeholder">Select a guide from the list, or create a new one.</p>
          {/if}
        </Workspace>
      </Main>
    {/snippet}

    {#snippet inspector()}
      <Inspector label="Guide">
        {#if availableViews.length > 1}
          <Panel title="View" collapsible={false} class="inspector__section">
            <ViewPicker
              views={availableViews}
              selectedViewId={guideViewId}
              onSelect={(id) => { guideViewId = id; refreshPreview(); }}
            />
          </Panel>
        {/if}
        {#if selectedGuideId}
          <Panel title="Notes" collapsible={false} class="inspector__section">
            {#key selectedGuideId}
          <InstanceNotes {repo} instanceId={selectedGuideId} revision={documentRevision} />
        {/key}
          </Panel>
        {/if}
        <Panel title="Export" collapsible={false} class="inspector__section">
          <Button
            size="sm"
            data-testid="guides-export-markdown"
            onclick={handleExportMarkdown}
            disabled={!guideViewId}
          >Export Markdown</Button>
          <Button
            size="sm"
            data-testid="guides-export-print"
            onclick={handlePrint}
            disabled={!previewHtml}
          >Print / Save as PDF</Button>
        </Panel>
        <Panel title="Theme" collapsible={false} class="inspector__section">
          <select
            data-testid="guides-theme-picker"
            class="guides-theme-select"
            value={selectedThemeId}
            onchange={(e) => { selectedThemeId = e.currentTarget.value; }}
          >
            {#each PREVIEW_THEMES as theme (theme.id)}
              <option value={theme.id}>{theme.label}</option>
            {/each}
          </select>
        </Panel>
        <Panel title="Preview" collapsible={false} grow class="inspector__section">
          <PreviewPane html={previewHtml} loading={previewLoading} themeCss={selectedThemeCss} />
        </Panel>
      </Inspector>
    {/snippet}
  </AppShell>
</div>
