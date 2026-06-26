<!--
  App.svelte — Governance viewer root.

  States: boot → idle → loaded | error
    boot:   WASM initialising
    idle:   WASM ready, no repo loaded — show file picker
    loaded: repo loaded — show three-pane viewer
    error:  unrecoverable error

  B4 read-only governance viewer: https://github.com/the-greenman/srs-web/issues/3
  B9 edit forms:                  https://github.com/the-greenman/srs-web/issues/5
  B11 lifecycle & supersession:   https://github.com/the-greenman/srs-web/issues/7
-->
<script lang="ts">
  import {
    initWasm,
    loadRepo,
    listRecords,
    createRecord,
    updateRecord,
    deleteRecord,
    exportSrsj,
    createRelation,
    typeSchema,
  } from "$lib/srs-client.js";
  import type { SrsRepository, SrsRecord, Diagnostic as WasmDiagnostic, CreateRecordInput, UpdateRecordInput, CreateRelationInput, SchemaDefinition } from "$lib/srs-client.js";
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
  import DecisionFlow from "$lib/components/DecisionFlow.svelte";
  import GuidesShell from "$lib/guides/GuidesShell.svelte";
  import RecordReading from "$lib/components/RecordReading.svelte";
  import DecisionLogView from "$lib/components/DecisionLogView.svelte";
  import SourceChooser from "$lib/components/SourceChooser.svelte";
  import {
    createStorageProvidersFromEnv,
    downloadDocument,
    type DocumentHandle,
  } from "$lib/storage/index.js";

  import { buildDynamicSections, DECISION_TYPE_ID } from "$lib/governance/sections.js";
  import type { SectionConfig, SectionKey } from "$lib/governance/sections.js";
  import { getStringField } from "$lib/governance/field-utils.js";
  import type { TypeFormDef } from "$lib/governance/types.js";
  import { definitionToFields } from "$lib/guides/blueprint-utils.js";
  import { LIFECYCLE_TRANSITIONS, IMMUTABLE_STATES } from "$lib/governance/lifecycle.js";
  import { setFieldMetaContext, buildFieldMetaMap } from "$lib/governance/field-meta.js";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  type AppState = "boot" | "idle" | "loaded" | "error";
  type EditorMode = "governance" | "guides";

  let appState = $state<AppState>("boot");
  let errorMsg = $state<string | null>(null);
  let editorMode = $state<EditorMode | null>(null);

  let repoName = $state<string>("Untitled repository");
  const storageProviders = createStorageProvidersFromEnv();
  let activeDocument = $state<DocumentHandle | null>(null);

  /** Records per section, keyed by section key (typeId). */
  let sectionRecords = $state<Record<string, SrsRecord[]>>({});

  /** Sections derived from loaded records + KNOWN_TYPE_CONFIG. */
  let dynamicSections = $state<SectionConfig[]>([]);

  /** Active sidebar section — null until first repo load */
  let activeSection = $state<SectionKey | null>(null);

  /** Selected record instance ID */
  let selectedId = $state<string | null>(null);

  /** Validation diagnostics mapped to types.ts shape */
  let diagnostics = $state<Diagnostic[]>([]);
  let instanceCount = $state<number>(0);

  /** The loaded repository — needed for mutations. */
  let repo = $state<SrsRepository | null>(null);

  /** TypeFormDef per section key, derived from typeSchema() at load time. */
  let sectionSchemas = $state<Record<string, TypeFormDef>>({});

  // fieldMetaMap is a $derived so buildFieldMetaMap runs only when sectionSchemas
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

  /** Decision flow mode — replaces generic form for decisions. */
  let decisionFlowMode = $state(false);
  let decisionFlowSaving = $state(false);
  let decisionFlowError = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // WASM initialisation
  // ---------------------------------------------------------------------------

  $effect(() => {
    initWasm()
      .then(() => {
        appState = "idle";
      })
      .catch((e: unknown) => {
        errorMsg = `Failed to load WASM engine: ${e instanceof Error ? e.message : String(e)}`;
        appState = "error";
      });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Map WASM diagnostic severity to types.ts shape (warning → warn). */
  function mapDiagnostic(d: WasmDiagnostic): Diagnostic {
    const sev = d.severity === "warning" ? "warn" : d.severity;
    return { severity: sev, message: d.message };
  }

  function loadSectionRecords(loadedRepo: SrsRepository): void {
    const allRecords = listRecords(loadedRepo, {});
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

  function buildSectionSchemas(loadedRepo: SrsRepository, sections: SectionConfig[]): Record<string, TypeFormDef> {
    const result: Record<string, TypeFormDef> = {};
    for (const section of sections) {
      if (!section.typeId) continue;
      try {
        const schemaResult = typeSchema(loadedRepo, section.typeId, section.typeVersion);
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
    return result;
  }

  function refreshValidation(): void {
    if (!repo) return;
    const report = repo.validate();
    instanceCount = report.instanceCount;
    diagnostics = report.diagnostics.map(mapDiagnostic);
  }

  // ---------------------------------------------------------------------------
  // Document import
  // ---------------------------------------------------------------------------

  async function loadDocument(handle: DocumentHandle): Promise<void> {
    errorMsg = null;
    sectionRecords = {};
    dynamicSections = [];
    activeSection = null;
    selectedId = null;
    diagnostics = [];

    try {
      const text = await handle.read();
      repo = loadRepo(text);
      activeDocument = handle;

      repoName = handle.name.replace(/\.(srsj|json)$/i, "");

      loadSectionRecords(repo);
      sectionSchemas = buildSectionSchemas(repo, dynamicSections);

      const report = repo.validate();
      instanceCount = report.instanceCount;
      diagnostics = report.diagnostics.map(mapDiagnostic);

      appState = "loaded";
    } catch (e: unknown) {
      repo = null;
      activeDocument = null;
      throw new Error(
        `Failed to load repository: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------

  function handleFormSave(input: CreateRecordInput | UpdateRecordInput) {
    if (!repo) return;
    formSaving = true;
    formError = null;
    try {
      if (formMode === "create") {
        const typeDef = activeSection ? sectionSchemas[activeSection] : undefined;
        if (!typeDef) return;
        const created = createRecord(repo, typeDef.typeId, typeDef.typeVersion, input as CreateRecordInput);
        formMode = null;
        loadSectionRecords(repo);
        selectedId = created.instanceId;
        refreshValidation();
      } else if (formMode === "edit" && editingRecord) {
        updateRecord(repo, editingRecord.instanceId, input as UpdateRecordInput);
        formMode = null;
        editingRecord = null;
        loadSectionRecords(repo);
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
      (fv) => fv.fieldId === "aee7afe9-6650-5fa4-a61a-495c3b88994b"
    )?.value as string | undefined;
    if (status && IMMUTABLE_STATES.has(status)) {
      showSuccessorModal = true;
      return;
    }
    editingRecord = selectedRecord;
    formMode = "edit";
  }

  function handleDeleteRecord() {
    if (!repo || !selectedRecord) return;
    deleteRecord(repo, selectedRecord.instanceId);
    selectedId = null;
    loadSectionRecords(repo);
    refreshValidation();
  }

  function handleLifecycleTransition(toState: string) {
    if (!repo || !selectedRecord) return;
    const statusFieldId = "aee7afe9-6650-5fa4-a61a-495c3b88994b";
    try {
      // Governance status is stored as a field value, not ext:lifecycle state.
      // Update the status field to the new state via updateRecord.
      const existingValues = selectedRecord.fieldValues.filter((fv) => fv.fieldId !== statusFieldId);
      updateRecord(repo, selectedRecord.instanceId, {
        fieldValues: [...existingValues, { fieldId: statusFieldId, value: toState }],
      });
      loadSectionRecords(repo);
      // refreshValidation(); // called by B13
    } catch (e: unknown) {
      // silently ignore for now — errors will surface via validate()
    }
  }

  function handleCreateSuccessor() {
    if (!repo || !selectedRecord) return;
    const typeDef = activeSection ? sectionSchemas[activeSection] : undefined;
    if (!typeDef) return;
    showSuccessorModal = false;
    const statusFieldId = "aee7afe9-6650-5fa4-a61a-495c3b88994b";
    let successorId: string | null = null;
    try {
      const baseValues = selectedRecord.fieldValues.filter((fv) => fv.fieldId !== statusFieldId);
      const successor = createRecord(repo, typeDef.typeId, typeDef.typeVersion, {
        fieldValues: [...baseValues, { fieldId: statusFieldId, value: "draft" }],
      });
      successorId = successor.instanceId;
      try {
        createRelation(repo, {
          relationType: "supersedes",
          sourceInstanceId: successor.instanceId,
          targetInstanceId: selectedRecord.instanceId,
        } as CreateRelationInput);
      } catch (relErr: unknown) {
        // Relation creation failure is non-fatal: the successor record was created
        console.warn("supersedes relation could not be created:", relErr);
      }
    } catch (e: unknown) {
      console.error("Failed to create successor:", e);
    }
    // Always refresh the list (successor may have been created even if relation failed)
    loadSectionRecords(repo);
    if (successorId !== null) {
      selectedId = successorId;
    }
  }

  function handleExport() {
    if (!repo) return;
    const json = exportSrsj(repo);
    downloadDocument(json, `${repoName}.srsj`);
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------------

  function governanceCrumbItems(): BreadcrumbItem[] {
    const items: BreadcrumbItem[] = [{ label: repoName, title: `Opened from ${activeDocument?.provider ?? "local"}` }];
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

  // Derived
  // ---------------------------------------------------------------------------

  let activeRecords = $derived(activeSection !== null ? (sectionRecords[activeSection] ?? []) : []);

  let activeSection_ = $derived(
    dynamicSections.find((s) => s.key === activeSection) ?? null,
  );

  let isDecisionSection = $derived(activeSection_?.typeId === DECISION_TYPE_ID);

  let activeSectionSchema = $derived(
    activeSection !== null ? (sectionSchemas[activeSection] ?? null) : null,
  );

  /** Count of validation errors */
  let errorCount = $derived(diagnostics.filter((d) => d.severity === "error").length);

  /** Inspector aside: "clean" or error count */
  let validationAside = $derived(
    errorCount === 0
      ? "clean"
      : `${errorCount} error${errorCount === 1 ? "" : "s"}`,
  );

  let selectedRecord = $derived(
    selectedId != null ? (activeRecords.find((r) => r.instanceId === selectedId) ?? null) : null,
  );
</script>

<!-- =========================================================================
     SVG filter — required by Nav (ink surface effect)
     ========================================================================= -->
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

<!-- =========================================================================
     Boot state
     ========================================================================= -->
{#if appState === "boot"}
  <div class="splash">
    <p class="splash__status">Loading engine…</p>
  </div>

<!-- =========================================================================
     Error state
     ========================================================================= -->
{:else if appState === "error"}
  <div class="splash">
    <p class="splash__error" role="alert">{errorMsg}</p>
    <button
      class="splash__retry"
      onclick={() => {
        errorMsg = null;
        appState = "idle";
      }}
    >Try again</button>
  </div>

<!-- =========================================================================
     Idle state — mode picker then file picker
     ========================================================================= -->
{:else if appState === "idle"}
  {#if editorMode === null}
    <div class="splash" data-testid="mode-picker">
      <h1 class="splash__title">SRS Editor</h1>
      <p class="splash__sub">Choose an editor mode to get started.</p>
      <div class="mode-picker">
        <button
          class="mode-picker__btn"
          data-testid="mode-governance"
          onclick={() => { editorMode = "governance"; }}
        >
          <strong>Governance Editor</strong>
          <span>Articles, Decisions, Roles</span>
        </button>
        <button
          class="mode-picker__btn"
          data-testid="mode-guides"
          onclick={() => { editorMode = "guides"; }}
        >
          <strong>Guides Editor</strong>
          <span>muDemocracy guides</span>
        </button>
      </div>
    </div>
  {:else if editorMode === "governance"}
    <div class="splash" data-testid="governance-file-picker">
      <h1 class="splash__title">SRS Governance Viewer</h1>
      <p class="splash__sub">Open a <code>.srsj</code> repository file to explore its governance records.</p>
      <SourceChooser providers={storageProviders} onOpen={loadDocument} />
      <button class="splash__back" onclick={() => { editorMode = null; }}>← Back</button>
    </div>
  {:else}
    <div class="splash" data-testid="guides-file-picker">
      <h1 class="splash__title">muDemocracy Guides Editor</h1>
      <p class="splash__sub">Open a <code>.srsj</code> repository file to edit guides.</p>
      <SourceChooser providers={storageProviders} onOpen={loadDocument} />
      <button class="splash__back" onclick={() => { editorMode = null; }}>← Back</button>
    </div>
  {/if}

<!-- =========================================================================
     Loaded state — guides or governance shell
     ========================================================================= -->
{:else if editorMode === "guides"}
  <GuidesShell
    repo={repo!}
    repoName={repoName}
    documentProvider={activeDocument?.provider ?? "local"}
    onExport={handleExport}
    onOpenAnother={() => {
      repo = null;
      activeDocument = null;
      sectionRecords = {};
      dynamicSections = [];
      activeSection = null;
      sectionSchemas = {};
      selectedId = null;
      diagnostics = [];
      editorMode = null;
      appState = "idle";
    }}
  />

<!-- =========================================================================
     Loaded state — governance three-pane viewer
     ========================================================================= -->
{:else}
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
                  decisionFlowMode = false;
                  decisionFlowError = null;
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
            {#if formMode === null && !decisionFlowMode}
              {#if isDecisionSection}
                <button
                  class="topbar__new"
                  onclick={() => { decisionFlowMode = true; decisionFlowError = null; }}
                >New Decision</button>
              {:else if activeSectionSchema}
                <button
                  class="topbar__new"
                  onclick={() => { formMode = "create"; editingRecord = null; }}
                >New {activeSectionSchema.label}</button>
              {/if}
            {/if}
            <button class="topbar__export" onclick={handleExport}>Download .srsj</button>
            <button
              class="topbar__reset"
              onclick={() => {
                sectionRecords = {};
                dynamicSections = [];
                activeSection = null;
                sectionSchemas = {};
                diagnostics = [];
                selectedId = null;
                repo = null;
                activeDocument = null;
                formMode = null;
                editingRecord = null;
                formError = null;
                decisionFlowMode = false;
                decisionFlowError = null;
                editorMode = null;
                appState = "idle";
              }}
            >Open another file</button>
          {/snippet}
        </Topbar>

        <Workspace>
          {#if decisionFlowMode}
            {@const decisionTypeDef = sectionSchemas[DECISION_TYPE_ID]}
            {#if decisionTypeDef}
            <DecisionFlow
              schema={decisionTypeDef}
              onSave={(input) => {
                if (!repo) return;
                decisionFlowSaving = true;
                decisionFlowError = null;
                try {
                  if (!decisionTypeDef) { decisionFlowError = "Decision type schema not loaded"; return; }
                  const created = createRecord(repo, decisionTypeDef.typeId, decisionTypeDef.typeVersion, input);
                  decisionFlowMode = false;
                  loadSectionRecords(repo);
                  selectedId = created.instanceId;
                } catch (e: unknown) {
                  decisionFlowError = e instanceof Error ? e.message : String(e);
                } finally {
                  decisionFlowSaving = false;
                }
              }}
              onCancel={() => { decisionFlowMode = false; decisionFlowError = null; }}
              saving={decisionFlowSaving}
              saveError={decisionFlowError}
            />
            {/if}
          {:else if formMode !== null && activeSectionSchema}
            <RecordForm
              schema={activeSectionSchema}
              record={editingRecord}
              onSave={handleFormSave}
              onCancel={handleFormCancel}
              saving={formSaving}
              saveError={formError}
            />
          {:else if selectedRecord && formMode === null && activeSectionSchema}
            <RecordReading
              schema={activeSectionSchema}
              record={selectedRecord}
              sectionLabel={activeSection_?.label ?? ""}
              onBack={() => { selectedId = null; }}
            />
          {:else}
            {#if isDecisionSection}
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
                      getStringField(record, "title") ??
                      getStringField(record, "decision_statement") ??
                      record.instanceId}
                    {@const articleNumber = getStringField(record, "article_number")}
                    {@const status = getStringField(record, "status") as Status | undefined}
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
            {@const currentStatus = getStringField(selectedRecord, "status") ?? ""}
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
{/if}

<style>
  /* ---- Splash / idle ---- */
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    font-family: inherit;
  }

  .splash__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .splash__sub {
    margin: 0;
    opacity: 0.65;
    max-width: 28rem;
  }

  .splash__status {
    opacity: 0.55;
    margin: 0;
  }

  .splash__error {
    color: #c00;
    margin: 0;
  }

  .splash__retry {
    margin-top: 0.5rem;
    cursor: pointer;
  }

  .splash__back {
    margin-top: 1rem;
    background: none;
    border: none;
    color: var(--color-muted, #888);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
  }
  .splash__back:hover {
    text-decoration: underline;
  }

  .mode-picker {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .mode-picker__btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 1rem 1.5rem;
    min-width: 10rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    background: var(--color-surface-1, #fafafa);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }
  .mode-picker__btn:hover {
    border-color: var(--color-accent, #4a90d9);
    background: var(--color-surface-2, #f0f6ff);
  }
  .mode-picker__btn strong {
    font-size: 0.95rem;
  }
  .mode-picker__btn span {
    font-size: 0.75rem;
    color: var(--color-muted, #888);
  }

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
