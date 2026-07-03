<!-- GovernanceShell.svelte — self-contained governance editor shell.
     Extracted from App.svelte following the GuidesShell pattern.
     See plans/governance-shell-76.md and srs-web#76. -->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    listRecords,
    createRecord,
    updateRecord,
    deleteRecord,
    createRecordSuccessor,
    typeSchema,
    addContainerMember,
    listContainers,
  } from "$lib/srs-client.js";
  import type {
    SrsRepository,
    SrsRecord,
    Diagnostic as WasmDiagnostic,
    CreateRecordInput,
    UpdateRecordInput,
    SchemaDefinition,
  } from "$lib/srs-client.js";
  import type { BreadcrumbItem, Diagnostic, Status } from "$lib/types.js";

  import AppShell from "$lib/components/AppShell.svelte";
  import Breadcrumb from "$lib/components/Breadcrumb.svelte";
  import Main from "$lib/components/Main.svelte";
  import Topbar from "$lib/components/Topbar.svelte";
  import Workspace from "$lib/components/Workspace.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import NavGroup from "$lib/components/NavGroup.svelte";
  import NavItem from "$lib/components/NavItem.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import InspectorSection from "$lib/components/InspectorSection.svelte";
  import Card from "$lib/components/Card.svelte";
  import Diagnostics from "$lib/components/Diagnostics.svelte";
  import RecordForm from "$lib/components/RecordForm.svelte";
  import SuccessorModal from "$lib/components/SuccessorModal.svelte";
  import RecordReading from "$lib/components/RecordReading.svelte";
  import DecisionLogView from "$lib/components/DecisionLogView.svelte";

  import { buildDynamicSections } from "$lib/governance/sections.js";
  import type { SectionConfig, SectionKey } from "$lib/governance/sections.js";
  import { DECISION_TYPE_ID, DECISION_LOG_CONTAINER_TYPE } from "$lib/governance/type-registry.js";
  import { getStringField, STATUS_FIELD_ID } from "$lib/governance/field-utils.js";
  import type { TypeFormDef } from "$lib/governance/types.js";
  import { definitionToFields } from "$lib/guides/blueprint-utils.js";
  import { LIFECYCLE_TRANSITIONS, IMMUTABLE_STATES } from "$lib/governance/lifecycle.js";
  import { setFieldMetaContext, buildFieldMetaMap } from "$lib/governance/field-meta.js";

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------

  interface Props {
    repo: SrsRepository;
    repoName: string;
    documentProvider: string;
    onExport: () => void;
    onOpenAnother: () => void;
  }
  let { repo, repoName, documentProvider, onExport, onOpenAnother }: Props = $props();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Records per section, keyed by section key (typeId). */
  let sectionRecords = $state<Record<string, SrsRecord[]>>({});

  /** Sections derived from loaded records + TYPE_REGISTRY. */
  let dynamicSections = $state<SectionConfig[]>([]);

  /** Active sidebar section — null until first data load. */
  let activeSection = $state<SectionKey | null>(null);

  /** Selected record instance ID. */
  let selectedId = $state<string | null>(null);

  /** Validation diagnostics mapped to types.ts shape. */
  let diagnostics = $state<Diagnostic[]>([]);
  let instanceCount = $state<number>(0);

  /** TypeFormDef per section key, derived from typeSchema() at load time. */
  let sectionSchemas = $state<Record<string, TypeFormDef>>({});

  // fieldMetaMap is $derived so buildFieldMetaMap only runs when sectionSchemas
  // changes (once at load), not on every reactive access from child components.
  const fieldMetaMap = $derived(buildFieldMetaMap(sectionSchemas));

  // Provide reactive field metadata to all descendant rendering components.
  setFieldMetaContext(() => fieldMetaMap);

  /** Form mode: null = list view, 'create' = new record, 'edit' = edit existing. */
  let formMode = $state<"create" | "edit" | null>(null);
  let editingRecord = $state<SrsRecord | null>(null);
  let formSaving = $state(false);
  let formError = $state<string | null>(null);

  /** Whether the immutability guard modal is shown. */
  let showSuccessorModal = $state(false);

  /** Container ID of the decision_log container, discovered at boot via listContainers. */
  let decisionLogContainerId = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  let activeRecords = $derived(activeSection !== null ? (sectionRecords[activeSection] ?? []) : []);

  let activeSection_ = $derived(
    dynamicSections.find((s) => s.key === activeSection) ?? null,
  );

  let activeSectionSchema = $derived(
    activeSection !== null ? (sectionSchemas[activeSection] ?? null) : null,
  );

  /** Count of validation errors. */
  let errorCount = $derived(diagnostics.filter((d) => d.severity === "error").length);

  /** Inspector aside: "clean" or error count. */
  let validationAside = $derived(
    errorCount === 0
      ? "clean"
      : `${errorCount} error${errorCount === 1 ? "" : "s"}`,
  );

  let selectedRecord = $derived(
    selectedId != null ? (activeRecords.find((r) => r.instanceId === selectedId) ?? null) : null,
  );

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function mapDiagnostic(d: WasmDiagnostic): Diagnostic {
    const sev = d.severity === "warning" ? "warn" : d.severity;
    return { severity: sev, message: d.message };
  }

  function loadSectionRecords(): void {
    const allRecords = listRecords(repo, {});
    dynamicSections = buildDynamicSections(allRecords);
    const result: Record<string, SrsRecord[]> = {};
    for (const r of allRecords) {
      if (!r.typeId) continue;
      if (!result[r.typeId]) result[r.typeId] = [];
      result[r.typeId].push(r);
    }
    sectionRecords = result;
    if (activeSection === null && dynamicSections.length > 0) {
      activeSection = dynamicSections[0].key;
    }
  }

  function buildSectionSchemas(): void {
    const result: Record<string, TypeFormDef> = {};
    for (const section of dynamicSections) {
      if (!section.typeId) continue;
      try {
        const schemaResult = typeSchema(repo, section.typeId, section.typeVersion);
        if (schemaResult.diagnostics.length > 0) {
          console.warn("typeSchema diagnostics for section", section.key, schemaResult.diagnostics);
        }
        const rawSchema = schemaResult.schema;
        if (
          typeof rawSchema !== "object" || rawSchema === null ||
          typeof rawSchema["properties"] !== "object" || rawSchema["properties"] === null
        ) {
          console.warn("typeSchema returned unexpected shape for section", section.key, rawSchema);
          continue;
        }
        const schema = rawSchema as unknown as SchemaDefinition;
        result[section.key] = {
          typeId: section.typeId,
          typeVersion: section.typeVersion ?? 1,
          typeNamespace: section.typeNamespace,
          typeName: section.typeName,
          label: section.label,
          fields: definitionToFields(schema),
        };
      } catch (e: unknown) {
        console.error("typeSchema failed for section", section.key, e);
      }
    }
    sectionSchemas = result;
  }

  function refreshValidation(): void {
    const report = repo.validate();
    instanceCount = report.instanceCount;
    diagnostics = report.diagnostics.map(mapDiagnostic);
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  onMount(() => {
    // Order matters: buildSectionSchemas reads dynamicSections set by loadSectionRecords.
    loadSectionRecords();
    buildSectionSchemas();
    refreshValidation();
    try {
      const containers = listContainers(repo, { containerType: DECISION_LOG_CONTAINER_TYPE });
      decisionLogContainerId = containers[0]?.containerId ?? null;
    } catch (e: unknown) {
      console.error("listContainers failed in onMount:", e);
      decisionLogContainerId = null;
    }
  });

  // ---------------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------------

  function governanceCrumbItems(): BreadcrumbItem[] {
    const items: BreadcrumbItem[] = [{ label: repoName, title: `Opened from ${documentProvider}` }];
    if (formMode !== null) {
      items.push({ label: activeSection_?.label ?? "", onclick: handleFormCancel });
      if (formMode === "create") {
        items.push({ label: `New ${(activeSection_?.label ?? "").replace(/s$/, "")}` });
      } else if (editingRecord) {
        const title = editingRecord.fieldValues[0]?.value as string | undefined;
        items.push({ label: title ?? "Record" });
      }
    } else {
      items.push({ label: activeSection_?.label ?? "" });
    }
    return items;
  }

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------

  function handleFormSave(input: CreateRecordInput | UpdateRecordInput) {
    formSaving = true;
    formError = null;
    try {
      if (formMode === "create") {
        const typeDef = activeSection ? sectionSchemas[activeSection] : undefined;
        if (!typeDef) return;
        const created = createRecord(repo, typeDef.typeId, typeDef.typeVersion, input as CreateRecordInput);
        if (decisionLogContainerId && activeSection_?.typeId === DECISION_TYPE_ID) {
          try {
            addContainerMember(repo, decisionLogContainerId, created.instanceId);
          } catch (e: unknown) {
            console.error("addContainerMember failed:", e);
            formError = e instanceof Error
              ? `Decision saved, but container registration failed: ${e.message}`
              : "Decision saved, but could not register in decision log container.";
            loadSectionRecords();
            selectedId = created.instanceId;
            refreshValidation();
            return;
          }
        }
        formMode = null;
        loadSectionRecords();
        selectedId = created.instanceId;
        refreshValidation();
      } else if (formMode === "edit" && editingRecord) {
        updateRecord(repo, editingRecord.instanceId, input as UpdateRecordInput);
        formMode = null;
        editingRecord = null;
        loadSectionRecords();
        refreshValidation();
      }
    } catch (e: unknown) {
      formError = e instanceof Error ? e.message : String(e);
    } finally {
      formSaving = false;
    }
  }

  function handleFormCancel() {
    formMode = null;
    editingRecord = null;
    formError = null;
  }

  function handleEditRecord() {
    if (!selectedRecord) return;
    const status = selectedRecord.fieldValues.find(
      (fv) => fv.fieldId === STATUS_FIELD_ID
    )?.value as string | undefined;
    if (status && IMMUTABLE_STATES.has(status)) {
      showSuccessorModal = true;
      return;
    }
    editingRecord = selectedRecord;
    formMode = "edit";
  }

  function handleDeleteRecord() {
    if (!selectedRecord) return;
    deleteRecord(repo, selectedRecord.instanceId);
    selectedId = null;
    loadSectionRecords();
    refreshValidation();
  }

  function handleLifecycleTransition(toState: string) {
    if (!selectedRecord) return;
    const statusFieldId = STATUS_FIELD_ID;
    try {
      // Governance status is stored as a field value, not ext:lifecycle state.
      // Update the status field to the new state via updateRecord.
      const existingValues = selectedRecord.fieldValues.filter((fv) => fv.fieldId !== statusFieldId);
      updateRecord(repo, selectedRecord.instanceId, {
        fieldValues: [...existingValues, { fieldId: statusFieldId, value: toState }],
      });
      loadSectionRecords();
      // refreshValidation(); // called by B13
    } catch (e: unknown) {
      // silently ignore for now — errors will surface via validate()
    }
  }

  function handleCreateSuccessor() {
    if (!selectedRecord) return;
    showSuccessorModal = false;
    const statusFieldId = STATUS_FIELD_ID;
    try {
      const baseValues = selectedRecord.fieldValues.filter((fv) => fv.fieldId !== statusFieldId);
      const result = createRecordSuccessor(repo, selectedRecord.instanceId, {
        relationType: "supersedes",
        fieldValues: [...baseValues, { fieldId: statusFieldId, value: "draft" }],
      });
      loadSectionRecords();
      selectedId = result.record.instanceId;
    } catch (e: unknown) {
      console.error("Failed to create successor:", e);
      loadSectionRecords();
    }
  }
</script>

<!-- SVG filter — required by Nav (ink surface effect) -->
<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">
  <defs>
    <filter id="ink-surface" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise" />
      <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
      <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended" />
      <feComposite in="blended" in2="SourceGraphic" operator="in" />
    </filter>
  </defs>
</svg>

<AppShell>
  {#snippet nav()}
    <Nav repo={repoName} eyebrow="srs · governance">
      {#snippet children()}
        <NavGroup label="Governance">
          {#each dynamicSections as section (section.key)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={(e) => {
                e.preventDefault();
                activeSection = section.key;
                selectedId = null;
                formMode = null;
                editingRecord = null;
                formError = null;
              }}
            >
              <NavItem
                label={section.label}
                id={section.icon}
                count={sectionRecords[section.key]?.length ?? 0}
                active={activeSection === section.key}
                href="#"
              />
            </div>
          {/each}
        </NavGroup>
      {/snippet}
      {#snippet footer()}
        <div class="nav__footer-stat">
          {instanceCount} record{instanceCount === 1 ? "" : "s"}
        </div>
      {/snippet}
    </Nav>
  {/snippet}

  {#snippet main()}
    <Main>
      <Topbar>
        {#snippet crumb()}
          <Breadcrumb items={governanceCrumbItems()} />
        {/snippet}
        {#snippet actions()}
          {#if formMode === null && activeSectionSchema}
            <button
              class="topbar__new"
              onclick={() => { formMode = "create"; editingRecord = null; }}
            >New {activeSectionSchema.label}</button>
          {/if}
          <button class="topbar__export" onclick={onExport}>Download .srsj</button>
          <button class="topbar__reset" onclick={onOpenAnother}>Open another file</button>
        {/snippet}
      </Topbar>

      <Workspace>
        {#if formMode !== null && activeSectionSchema}
          <RecordForm
            schema={activeSectionSchema}
            record={editingRecord}
            onSave={handleFormSave}
            onCancel={handleFormCancel}
            saving={formSaving}
            saveError={formError}
          />
        {:else if selectedRecord && formMode === null}
          <RecordReading
            record={selectedRecord}
            sectionLabel={activeSection_?.label ?? ""}
            onBack={() => { selectedId = null; }}
          />
        {:else}
          {#if activeSection_?.typeId === DECISION_TYPE_ID}
            <div class="section-heading">
              <h2 class="section-heading__title">{activeSection_?.label ?? ""}</h2>
              <span class="section-heading__count">{activeRecords.length}</span>
            </div>
            <DecisionLogView
              records={activeRecords}
              selectedId={selectedId}
              onSelect={(id) => { selectedId = id; }}
            />
          {:else}
            <div class="section-heading">
              <h2 class="section-heading__title">{activeSection_?.label ?? ""}</h2>
              <span class="section-heading__count">{activeRecords.length}</span>
            </div>

            {#if activeRecords.length === 0}
              <p class="empty-state">No {activeSection_?.label?.toLowerCase() ?? ""} records in this repository.</p>
            {:else}
              <div class="record-list">
                {#each activeRecords as record (record.instanceId)}
                  {@const title =
                    getStringField(record, "title", fieldMetaMap) ??
                    getStringField(record, "decision_statement", fieldMetaMap) ??
                    record.instanceId}
                  {@const articleNumber = getStringField(record, "article_number", fieldMetaMap)}
                  {@const status = getStringField(record, "status", fieldMetaMap) as Status | undefined}
                  {@const isSelected = selectedId === record.instanceId}

                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="record-list__item"
                    class:record-list__item--selected={isSelected}
                    onclick={() => {
                      selectedId = isSelected ? null : record.instanceId;
                    }}
                  >
                    <Card
                      id={articleNumber}
                      title={title}
                      status={status}
                    />
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        {/if}
      </Workspace>
    </Main>
  {/snippet}

  {#snippet inspector()}
    <Inspector label="Inspector">
      {#if selectedRecord && formMode === null}
        <InspectorSection title={(activeSection_?.label ?? "").replace(/s$/, "")} aside={selectedRecord.typeName}>
          <div class="inspector__kv inspector__kv--meta">
            <span class="inspector__k">ID</span>
            <span class="inspector__v inspector__v--mono">{selectedRecord.instanceId.slice(0, 8)}…</span>
          </div>
          {#if selectedRecord.createdAt}
            <div class="inspector__kv inspector__kv--meta">
              <span class="inspector__k">Created</span>
              <span class="inspector__v">{selectedRecord.createdAt.slice(0, 10)}</span>
            </div>
          {/if}
          <div class="inspector__record-actions">
            <button class="inspector__btn" onclick={handleEditRecord}>Edit</button>
            <button class="inspector__btn inspector__btn--danger" onclick={handleDeleteRecord}>Delete</button>
          </div>
          {@const currentStatus = getStringField(selectedRecord, "status", fieldMetaMap) ?? ""}
          {@const transitions = LIFECYCLE_TRANSITIONS[currentStatus] ?? []}
          {#if transitions.length > 0}
            <div class="inspector__transitions">
              {#each transitions as toState}
                <button class="inspector__btn inspector__btn--transition" onclick={() => handleLifecycleTransition(toState)}>
                  → {toState}
                </button>
              {/each}
            </div>
          {/if}
        </InspectorSection>
      {/if}
      <InspectorSection title="Validation" aside={validationAside}>
        <Diagnostics {diagnostics} />
      </InspectorSection>
      <InspectorSection title="Repository" aside={String(instanceCount)}>
        <div class="inspector__kv">
          <span class="inspector__k">File</span>
          <span class="inspector__v">{repoName}</span>
        </div>
        <div class="inspector__kv">
          <span class="inspector__k">Records</span>
          <span class="inspector__v">{instanceCount}</span>
        </div>
      </InspectorSection>
    </Inspector>
  {/snippet}
</AppShell>

{#if showSuccessorModal && selectedRecord}
  <SuccessorModal
    record={selectedRecord}
    onCreateSuccessor={handleCreateSuccessor}
    onCancel={() => { showSuccessorModal = false; }}
  />
{/if}

<style>
  /* ---- Section heading ---- */
  .section-heading {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .section-heading__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .section-heading__count {
    font-size: 0.8125rem;
    opacity: 0.5;
  }

  /* ---- Record list ---- */
  .record-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .record-list__item {
    cursor: pointer;
    border-radius: 2px;
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color 0.1s;
  }

  .record-list__item--selected {
    outline-color: currentColor;
  }

  .empty-state {
    opacity: 0.5;
    font-size: 0.875rem;
  }

  /* ---- Topbar extras ---- */
  .topbar__reset {
    font-size: 0.75rem;
    background: none;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    opacity: 0.6;
  }

  .topbar__reset:hover {
    opacity: 1;
  }

  .topbar__new {
    font-size: 0.75rem;
    background: none;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
  }

  .topbar__export {
    font-size: 0.75rem;
    background: none;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    opacity: 0.6;
  }

  .topbar__export:hover {
    opacity: 1;
  }

  /* ---- Inspector KV ---- */
  .inspector__kv {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    padding: 0.2rem 0;
  }

  .inspector__kv--meta {
    margin-top: 0.25rem;
    border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
    padding-top: 0.4rem;
  }

  .inspector__k {
    opacity: 0.55;
  }

  .inspector__v {
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector__v--mono {
    font-family: monospace;
    font-size: 0.6875rem;
  }

  /* ---- Inspector record actions ---- */
  .inspector__record-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  }

  .inspector__btn {
    font-size: 0.75rem;
    background: none;
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    opacity: 0.7;
  }

  .inspector__btn:hover { opacity: 1; }

  .inspector__btn--danger { color: #c00; border-color: #c00; }

  /* ---- Inspector lifecycle transition buttons ---- */
  .inspector__transitions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  }

  .inspector__btn--transition {
    font-size: 0.6875rem;
    opacity: 0.65;
  }

  /* ---- Nav footer ---- */
  .nav__footer-stat {
    font-size: 0.6875rem;
    opacity: 0.4;
    padding: 0.5rem 0;
  }
</style>
