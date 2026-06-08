<!--
  App.svelte — Governance viewer root.

  States: boot → idle → loaded | error
    boot:   WASM initialising
    idle:   WASM ready, no repo loaded — show file picker
    loaded: repo loaded — show three-pane viewer
    error:  unrecoverable error

  B4 read-only governance viewer: https://github.com/the-greenman/srs-web/issues/3
  B9 edit forms:                  https://github.com/the-greenman/srs-web/issues/5
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
  } from "$lib/srs-client.js";
  import type { SrsRepository, SrsRecord, Diagnostic as WasmDiagnostic, CreateRecordInput, UpdateRecordInput } from "$lib/srs-client.js";
  import type { Diagnostic, Status } from "$lib/types.js";

  import AppShell from "$lib/components/AppShell.svelte";
  import Main from "$lib/components/Main.svelte";
  import Topbar from "$lib/components/Topbar.svelte";
  import Workspace from "$lib/components/Workspace.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import NavGroup from "$lib/components/NavGroup.svelte";
  import NavItem from "$lib/components/NavItem.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import InspectorSection from "$lib/components/InspectorSection.svelte";
  import Card from "$lib/components/Card.svelte";
  import CardField from "$lib/components/CardField.svelte";
  import Diagnostics from "$lib/components/Diagnostics.svelte";
  import Field from "$lib/components/Field.svelte";
  import RecordForm from "$lib/components/RecordForm.svelte";

  import { SECTIONS } from "$lib/governance/sections.js";
  import type { SectionKey } from "$lib/governance/sections.js";
  import { getStringField, getFieldValue } from "$lib/governance/field-utils.js";
  import { GOVERNANCE_FORMS } from "$lib/governance/form-schema.js";
  import type { TypeFormDef } from "$lib/governance/form-schema.js";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  type AppState = "boot" | "idle" | "loaded" | "error";

  let appState = $state<AppState>("boot");
  let errorMsg = $state<string | null>(null);

  let repoName = $state<string>("Untitled repository");

  /** Records per section, keyed by section key. */
  let sectionRecords = $state<Record<string, SrsRecord[]>>({});

  /** Active sidebar section */
  let activeSection = $state<SectionKey>("articles");

  /** Selected record instance ID */
  let selectedId = $state<string | null>(null);

  /** Validation diagnostics mapped to types.ts shape */
  let diagnostics = $state<Diagnostic[]>([]);
  let instanceCount = $state<number>(0);

  /** The loaded repository — needed for mutations. */
  let repo = $state<SrsRepository | null>(null);

  /** Form mode: null = list view, 'create' = new record, 'edit' = edit existing. */
  let formMode = $state<"create" | "edit" | null>(null);
  let editingRecord = $state<SrsRecord | null>(null);
  let formSaving = $state(false);
  let formError = $state<string | null>(null);

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
    const result: Record<string, SrsRecord[]> = {};
    for (const section of SECTIONS) {
      result[section.key] = listRecords(loadedRepo, {
        typeNamespace: section.typeNamespace,
        typeName: section.typeName,
      });
    }
    sectionRecords = result;
  }

  // ---------------------------------------------------------------------------
  // File import
  // ---------------------------------------------------------------------------

  async function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    errorMsg = null;
    sectionRecords = {};
    selectedId = null;
    diagnostics = [];

    try {
      const text = await file.text();
      repo = loadRepo(text);

      // Derive a display name from the filename (strip extension)
      repoName = file.name.replace(/\.(srsj|json)$/i, "");

      // Populate section record lists
      loadSectionRecords(repo);

      // Run validation
      const report = repo.validate();
      instanceCount = report.instanceCount;
      diagnostics = report.diagnostics.map(mapDiagnostic);

      appState = "loaded";
    } catch (e: unknown) {
      errorMsg = `Failed to load repository: ${e instanceof Error ? e.message : String(e)}`;
      appState = "error";
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
        const typeDef = GOVERNANCE_FORMS[activeSection];
        if (!typeDef) return;
        const created = createRecord(repo, typeDef.typeId, typeDef.typeVersion, input as CreateRecordInput);
        formMode = null;
        loadSectionRecords(repo);
        selectedId = created.instanceId;
      } else if (formMode === "edit" && editingRecord) {
        updateRecord(repo, editingRecord.instanceId, input as UpdateRecordInput);
        formMode = null;
        editingRecord = null;
        loadSectionRecords(repo);
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
    editingRecord = selectedRecord;
    formMode = "edit";
  }

  function handleDeleteRecord() {
    if (!repo || !selectedRecord) return;
    deleteRecord(repo, selectedRecord.instanceId);
    selectedId = null;
    loadSectionRecords(repo);
  }

  function handleExport() {
    if (!repo) return;
    const json = exportSrsj(repo);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repoName}.srsj`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  let activeRecords = $derived(sectionRecords[activeSection] ?? []);

  let activeSection_ = $derived(
    SECTIONS.find((s) => s.key === activeSection)!,
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
     Idle state — file picker
     ========================================================================= -->
{:else if appState === "idle"}
  <div class="splash">
    <h1 class="splash__title">SRS Governance Viewer</h1>
    <p class="splash__sub">Open a <code>.srsj</code> repository file to explore its governance records.</p>
    <div class="splash__field">
      <Field label="Repository file" typeHint=".srsj">
        <input
          id="srsj-file"
          type="file"
          accept=".srsj,.json"
          onchange={onFileChange}
          class="splash__input"
        />
      </Field>
    </div>
  </div>

<!-- =========================================================================
     Loaded state — three-pane viewer
     ========================================================================= -->
{:else}
  <AppShell>
    {#snippet nav()}
      <Nav repo={repoName} eyebrow="srs · governance">
        {#snippet children()}
          <NavGroup label="Governance">
            {#each SECTIONS as section (section.key)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                onclick={(e) => {
                  e.preventDefault();
                  activeSection = section.key as SectionKey;
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
            <span class="topbar__repo">{repoName}</span>
            <span class="topbar__sep">›</span>
            <span class="topbar__section">{activeSection_.label}</span>
          {/snippet}
          {#snippet actions()}
            {#if formMode === null && GOVERNANCE_FORMS[activeSection]}
              <button
                class="topbar__new"
                onclick={() => { formMode = "create"; editingRecord = null; }}
              >New {GOVERNANCE_FORMS[activeSection].label}</button>
            {/if}
            <button class="topbar__export" onclick={handleExport}>Download .srsj</button>
            <button
              class="topbar__reset"
              onclick={() => {
                sectionRecords = {};
                diagnostics = [];
                selectedId = null;
                repo = null;
                formMode = null;
                editingRecord = null;
                formError = null;
                appState = "idle";
              }}
            >Open another file</button>
          {/snippet}
        </Topbar>

        <Workspace>
          {#if formMode !== null && GOVERNANCE_FORMS[activeSection]}
            <RecordForm
              schema={GOVERNANCE_FORMS[activeSection] as TypeFormDef}
              record={editingRecord}
              onSave={handleFormSave}
              onCancel={handleFormCancel}
              saving={formSaving}
              saveError={formError}
            />
          {:else}
            <div class="section-heading">
              <h2 class="section-heading__title">{activeSection_.label}</h2>
              <span class="section-heading__count">{activeRecords.length}</span>
            </div>

            {#if activeRecords.length === 0}
              <p class="empty-state">No {activeSection_.label.toLowerCase()} records in this repository.</p>
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
        </Workspace>
      </Main>
    {/snippet}

    {#snippet inspector()}
      <Inspector label="Inspector">
        {#if selectedRecord && formMode === null}
          <InspectorSection title={activeSection_.label.replace(/s$/, "")} aside={selectedRecord.typeName}>
            {#if activeSection === "articles"}
              {@const body = getFieldValue(selectedRecord, "article_text")}
              {@const amendRule = getStringField(selectedRecord, "amendment_rule")}
              {@const protected_ = getStringField(selectedRecord, "protected_status")}
              {#if body}
                <CardField label="Article text">
                  <span class="inspector__text">{body}</span>
                </CardField>
              {/if}
              {#if amendRule}
                <CardField label="Amendment rule">
                  <span class="inspector__text">{amendRule}</span>
                </CardField>
              {/if}
              {#if protected_}
                <CardField label="Protected status">
                  <span class="inspector__text">{protected_}</span>
                </CardField>
              {/if}
            {:else if activeSection === "decisions"}
              {@const stmt = getStringField(selectedRecord, "decision_statement")}
              {@const ctx = getStringField(selectedRecord, "context")}
              {@const rationale = getStringField(selectedRecord, "rationale")}
              {@const alts = getStringField(selectedRecord, "alternatives_considered")}
              {@const revisit = getStringField(selectedRecord, "revisit_when")}
              {@const owner = getStringField(selectedRecord, "owner")}
              {@const question = getStringField(selectedRecord, "decision_question")}
              {@const nextSteps = getStringField(selectedRecord, "next_steps")}
              {#if stmt}
                <CardField label="Decision statement">
                  <span class="inspector__text">{stmt}</span>
                </CardField>
              {/if}
              {#if ctx}
                <CardField label="Context">
                  <span class="inspector__text">{ctx}</span>
                </CardField>
              {/if}
              {#if rationale}
                <CardField label="Rationale">
                  <span class="inspector__text">{rationale}</span>
                </CardField>
              {/if}
              {#if alts}
                <CardField label="Alternatives considered">
                  <span class="inspector__text">{alts}</span>
                </CardField>
              {/if}
              {#if question}
                <CardField label="Decision question">
                  <span class="inspector__text">{question}</span>
                </CardField>
              {/if}
              {#if revisit}
                <CardField label="Revisit when">
                  <span class="inspector__text">{revisit}</span>
                </CardField>
              {/if}
              {#if owner}
                <CardField label="Owner">
                  <span class="inspector__text">{owner}</span>
                </CardField>
              {/if}
              {#if nextSteps}
                <CardField label="Next steps">
                  <span class="inspector__text">{nextSteps}</span>
                </CardField>
              {/if}
            {:else if activeSection === "roles"}
              {@const holder = getStringField(selectedRecord, "role_holder")}
              {@const authority = getStringField(selectedRecord, "authority")}
              {@const boundary = getStringField(selectedRecord, "boundary")}
              {@const source = getStringField(selectedRecord, "source_of_authority")}
              {#if holder}
                <CardField label="Role holder">
                  <span class="inspector__text">{holder}</span>
                </CardField>
              {/if}
              {#if authority}
                <CardField label="Authority">
                  <span class="inspector__text">{authority}</span>
                </CardField>
              {/if}
              {#if boundary}
                <CardField label="Boundary">
                  <span class="inspector__text">{boundary}</span>
                </CardField>
              {/if}
              {#if source}
                <CardField label="Source of authority">
                  <span class="inspector__text">{source}</span>
                </CardField>
              {/if}
            {:else}
              {#each selectedRecord.fieldValues as fv}
                <CardField label={fv.fieldId.slice(0, 8)}>
                  <span class="inspector__text">{fv.value}</span>
                </CardField>
              {/each}
            {/if}
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

  .splash__field {
    margin-top: 1rem;
    min-width: 18rem;
    text-align: left;
  }

  .splash__input {
    display: block;
    width: 100%;
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
  .topbar__sep {
    margin: 0 0.35rem;
    opacity: 0.4;
  }

  .topbar__section {
    font-weight: 500;
  }

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

  /* ---- Inspector text (multi-line field values) ---- */
  .inspector__text {
    display: block;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.8125rem;
    line-height: 1.5;
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

  /* ---- Nav footer ---- */
  .nav__footer-stat {
    font-size: 0.6875rem;
    opacity: 0.4;
    padding: 0.5rem 0;
  }
</style>
