<!--
  GenericSrsShell — repository-first SRS reader.

  It deliberately renders only engine-resolved structures: compositions,
  repository navigation, container membership, discovery results, and package
  boundaries. Package-specific editors remain optional entry points.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    find,
    getRecord,
    listContainers,
    listDocumentViews,
    listRelations,
    listTypes,
    renderDocumentView,
    resolveContainerView,
    repositoryNavigation,
    typeSchema,
    updateRecord,
  } from "$lib/srs-client.js";
  import type {
    ContainerSummary,
    DiscoveryHit,
    DocumentViewSummary,
    RepositoryNavigation,
    SrsRecord,
    SrsRelation,
    SrsRepository,
    SchemaDefinition,
    ResolvedMember,
    TypeSummary,
    UpdateRecordInput,
  } from "$lib/srs-client.js";
  import PreviewPane from "$lib/components/PreviewPane.svelte";
  import FieldValueView from "../../rendering/FieldValueView.svelte";
  import { definitionToComposites, definitionToFields } from "$lib/editor/blueprint-fields.js";
  import SectionForm from "$lib/editor/SectionForm.svelte";
  import BlueprintDocumentEditor from "$lib/editor/BlueprintDocumentEditor.svelte";
  import { blueprintForComposition, containerForComposition } from "$lib/editor/document-model.js";
  import type { BlueprintSummary } from "$lib/srs-client.js";
  import type { CompositeFormDef } from "$lib/editor/blueprint-fields.js";
  import type { FieldFormDef } from "$lib/governance/types.js";
  import type { OfferedEditor } from "$lib/editors/registry.js";
  import InstanceNotes from "$lib/InstanceNotes.svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import InspectorTrigger from "$lib/components/InspectorTrigger.svelte";
  import Main from "$lib/components/Main.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import Diagnostics from "$lib/components/Diagnostics.svelte";
  import { diagnosticsFromStrings } from "$lib/notices.svelte.js";
  import Nav from "$lib/components/Nav.svelte";
  import NavTrigger from "$lib/components/NavTrigger.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import { BASE_GROUPS } from "$lib/components/shell-actions.js";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import { genericActions } from "./toolbar-actions.js";

  interface Props {
    repo: SrsRepository;
    /** Editors offered for this repo, computed once by App (registry.availableEditors). */
    packageEditors?: OfferedEditor[];
    repoName: string;
    onExport: () => void;
    /** Write the engine-owned current repository to the opened backend, when allowed. */
    onSave?: () => Promise<void>;
    /** Why `onSave` is undefined, shown where the Save button would be. Null when writable or unknown. */
    readOnlyReason?: string | null;
    saving?: boolean;
    /** App-owned dirty state, shared with non-UI repository writers. */
    documentDirty?: boolean;
    /** Changes after mount invalidate derived browser projections of the repository. */
    documentRevision?: number;
    onOpenAnother: () => void;
    /** Opens the App-level agent dock. */
    onOpenAgents?: () => void;
    onOpenEditor?: (id: string) => void;
    /** Install an unmet editor's packages and open it; rejects with the reason it could not. */
    onInstallEditor?: (id: string) => Promise<void>;
  }

  let {
    repo,
    packageEditors = [],
    repoName,
    onExport,
    onSave,
    readOnlyReason = null,
    saving = false,
    documentDirty = false,
    documentRevision = 0,
    onOpenAnother,
    onOpenAgents,
    onOpenEditor,
    onInstallEditor,
  }: Props = $props();

  let installing = $state<string | null>(null);
  let installError = $state<{ id: string; message: string } | null>(null);

  async function install(id: string): Promise<void> {
    installing = id;
    installError = null;
    try {
      await onInstallEditor?.(id);
    } catch (e: unknown) {
      installError = { id, message: e instanceof Error ? e.message : String(e) };
    } finally {
      installing = null;
    }
  }

  type Surface = "document" | "structure" | "records" | "map";

  /** The frame's state; Wide is its one toggle (View > Wide, saved through wide.ts). */
  const shell = new ShellState({ wideEnabled: true });

  let surface = $state<Surface>("document");
  /** "Full preview" toggle for the Documents surface when a blueprint editor is shown — component state only, not remembered across compositions. */
  let showFullPreview = $state(false);
  let compositions = $state<DocumentViewSummary[]>([]);
  let containers = $state<ContainerSummary[]>([]);
  let navigation = $state<RepositoryNavigation | null>(null);
  let types = $state<TypeSummary[]>([]);
  let selectedCompositionId = $state<string | null>(null);
  let selectedContainerId = $state<string | null>(null);
  let selectedRecord = $state<SrsRecord | null>(null);
  let renderedDocument = $state<string | null>(null);
  /** The engine's findings for the rendered composition (grouped) and a thrown failure (strong, inline). */
  let documentDiagnostics = $state<string[]>([]);
  let documentError = $state<string | null>(null);
  let loadingDocument = $state(false);
  let search = $state("");
  let selectedTypeId = $state<string>("");
  let expandedContainerIds = $state<Set<string>>(new Set());
  let expandedMembers = $state<Record<string, ResolvedMember[]>>({});
  let records = $state<DiscoveryHit[]>([]);
  let recordDiagnostics = $state<string[]>([]);
  let recordError = $state<string | null>(null);
  let editFormDef = $state<{ label: string; fields: FieldFormDef[]; composites: CompositeFormDef[] } | null>(null);
  let activeBlueprint = $state<BlueprintSummary | null>(null);
  let documentRenderRevision = $state(0);
  let editing = $state(false);
  let editSaving = $state(false);
  let editError = $state<string | null>(null);

  const activeComposition = $derived(
    compositions.find((composition) => composition.id === selectedCompositionId) ?? null,
  );
  const activeContainer = $derived(
    containers.find((container) => container.containerId === selectedContainerId) ?? null,
  );

  function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  // A mutation (documentRevision) re-runs loadCatalog: keep the user where they are.
  let catalogLoaded = false;

  function loadCatalog(): void {
    const refresh = catalogLoaded;
    catalogLoaded = true;
    try {
      compositions = listDocumentViews(repo);
      containers = listContainers(repo);
      types = listTypes(repo);
      try {
        navigation = repositoryNavigation(repo);
      } catch {
        navigation = null;
      }
      if (!refresh || !compositions.some((c) => c.id === selectedCompositionId)) {
        selectedCompositionId = compositions[0]?.id ?? null;
      }
      if (!refresh || !containers.some((c) => c.containerId === selectedContainerId)) {
        selectedContainerId = navigation?.sections[0]?.sectionContainerId ?? containers[0]?.containerId ?? null;
      }
      refreshRecords();
      if (refresh) {
        if (surface === "document" && selectedCompositionId) renderPreview(selectedCompositionId);
        return;
      }
      if (selectedCompositionId) renderComposition(selectedCompositionId);
      else surface = "records";
    } catch (error: unknown) {
      documentError = message(error);
      surface = "records";
    }
  }

  function renderComposition(compositionId: string): void {
    selectedCompositionId = compositionId;
    clearRecordSelection();
    surface = "document";
    renderPreview(compositionId);
  }

  /** Render a composition's preview and resolve its blueprint, without touching selection. */
  function renderPreview(compositionId: string): void {
    loadingDocument = true;
    documentError = null;
    documentDiagnostics = [];
    try {
      const composition = compositions.find((c) => c.id === compositionId);
      const containerId = composition ? containerForComposition(repo, composition) : null;
      const result = renderDocumentView(repo, compositionId, "html", containerId);
      renderedDocument = result.rendered;
      documentDiagnostics = result.diagnostics;
    } catch (error: unknown) {
      renderedDocument = null;
      documentError = message(error);
    } finally {
      loadingDocument = false;
    }
    const composition = compositions.find((c) => c.id === compositionId) ?? null;
    activeBlueprint = composition ? blueprintForComposition(repo, composition) : null;
  }

  /** Re-render the active composition's preview after an editor mutation (BlueprintDocumentEditor). */
  function onDocumentEditorMutation(): void {
    documentRenderRevision++;
    if (selectedCompositionId) renderPreview(selectedCompositionId);
  }

  function selectContainer(containerId: string): void {
    selectedContainerId = containerId;
    clearRecordSelection();
    surface = "structure";
    refreshRecords();
  }

  function toggleContainer(containerId: string): void {
    const next = new Set(expandedContainerIds);
    if (next.has(containerId)) next.delete(containerId);
    else {
      try {
        expandedMembers[containerId] = resolveContainerView(repo, containerId).members;
        next.add(containerId);
      } catch (error: unknown) {
        recordError = message(error);
      }
    }
    expandedContainerIds = next;
  }

  function refreshRecords(): void {
    try {
      const selectedType = types.find((type) => type.id === selectedTypeId);
      const result = find(repo, {
        contentMatch: search || undefined,
        typeId: selectedType?.id,
        containerId: (surface === "structure" || surface === "map") ? selectedContainerId ?? undefined : undefined,
      });
      records = result.hits;
      recordDiagnostics = result.diagnostics;
      recordError = null;
    } catch (error: unknown) {
      records = [];
      recordDiagnostics = [];
      recordError = message(error);
    }
  }

  function openRecords(): void {
    clearRecordSelection();
    surface = "records";
    refreshRecords();
  }

  function openMap(): void {
    surface = "map";
    refreshRecords();
  }

  /**
   * At drawer width the record is in the closed inspector drawer: open it. A pick from the nav drawer
   * closes that dialog in the same click, so wait for it to settle before opening the second modal.
   */
  function showInspector(): void {
    if (!shell.inspectorDrawer) return;
    void tick().then(() => setTimeout(() => (shell.inspectorOpen = true), 0));
  }

  function openRecord(instanceId: string): void {
    try {
      editing = false;
      editFormDef = null;
      editError = null;
      selectedRecord = getRecord(repo, instanceId);
      showInspector();
    } catch (error: unknown) {
      recordError = message(error);
    }
  }

  function clearRecordSelection(): void {
    selectedRecord = null;
    editing = false;
    editFormDef = null;
    editError = null;
  }

  /**
   * Open the inspector's edit form for the selected record. Uses SectionForm
   * (fields + composites) — the same form path as the blueprint document
   * editor and the guides editor (srs-web#322) — so there is no separate
   * "scalar string fields only" restriction: any type the engine can project
   * a schema for is editable here.
   */
  function beginEdit(): void {
    if (!selectedRecord) return;
    editError = null;
    try {
      const result = typeSchema(repo, selectedRecord.typeId, selectedRecord.typeVersion);
      const definition = result.schema as unknown as SchemaDefinition;
      if (!definition.properties || Object.keys(definition.properties).length === 0) {
        throw new Error("This record type does not expose an editable field schema.");
      }
      editFormDef = {
        label: selectedRecord.typeName ?? "record",
        fields: definitionToFields(definition),
        composites: definitionToComposites(definition),
      };
      editing = true;
    } catch (error: unknown) {
      editError = message(error);
    }
  }

  function saveEdit(input: UpdateRecordInput): void {
    if (!selectedRecord) return;
    editSaving = true;
    editError = null;
    try {
      selectedRecord = updateRecord(repo, selectedRecord.instanceId, input);
      editing = false;
      refreshRecords();
    } catch (error: unknown) {
      editError = message(error);
    } finally {
      editSaving = false;
    }
  }

  // The loaded WASM repository is mutated in place, so external writers need
  // this App-owned revision signal to refresh editor projections.
  let observedDocumentRevision = $state<number | null>(null);
  $effect(() => {
    if (documentRevision === observedDocumentRevision) return;
    observedDocumentRevision = documentRevision;
    loadCatalog();
  });

  const selectedRelations = $derived.by(() => {
    if (!selectedRecord) return [];
    try {
      return [
        ...listRelations(repo, { source: selectedRecord.instanceId }),
        ...listRelations(repo, { target: selectedRecord.instanceId }),
      ];
    } catch {
      return [];
    }
  });

  const structureContainers = $derived.by(() => {
    const navigationContainers = (navigation?.sections ?? [])
      .filter((section) => section.sectionContainerId)
      .map((section) => ({
        container: containers.find((container) => container.containerId === section.sectionContainerId),
        label: section.displayLabel,
        key: section.instanceId,
        depth: section.depth,
      }))
      .filter((entry): entry is { container: ContainerSummary; label: string; key: string; depth: number } => Boolean(entry.container));
    return navigationContainers.length > 0
      ? navigationContainers
      : containers.map((container) => ({ container, label: container.title, key: container.containerId, depth: 0 }));
  });

  const graph = $derived.by(() => {
    const nodeById = new Map<string, { id: string; label: string }>();
    const addNode = (id: string, fallback = id.slice(0, 8), alreadyResolved = false) => {
      if (nodeById.has(id)) return;
      if (alreadyResolved) {
        nodeById.set(id, { id, label: fallback });
        return;
      }
      try {
        const record = getRecord(repo, id);
        if (!record) throw new Error("record not found");
        nodeById.set(id, {
          id,
          label: record.displayLabel ?? id.slice(0, 8),
        });
      } catch {
        nodeById.set(id, { id, label: fallback });
      }
    };

    let relations: SrsRelation[] = [];
    if (selectedRecord) {
      addNode(selectedRecord.instanceId, selectedRecord.displayLabel ?? selectedRecord.instanceId.slice(0, 8));
      relations = selectedRelations;
      for (const relation of relations) {
        addNode(relation.sourceInstanceId);
        addNode(relation.targetInstanceId);
      }
    } else if (selectedContainerId) {
      try {
        relations = listRelations(repo, { containerId: selectedContainerId });
        const view = resolveContainerView(repo, selectedContainerId);
        const memberById = new Map(view.members.map((member) => [member.instanceId, member]));
        for (const relation of relations) {
          const source = memberById.get(relation.sourceInstanceId);
          const target = memberById.get(relation.targetInstanceId);
          addNode(relation.sourceInstanceId, source?.displayLabel ?? relation.sourceInstanceId.slice(0, 8), Boolean(source));
          addNode(relation.targetInstanceId, target?.displayLabel ?? relation.targetInstanceId.slice(0, 8), Boolean(target));
        }
      } catch {
        relations = [];
      }
    }
    return { nodes: [...nodeById.values()], relations };
  });

  function graphPoint(index: number, count: number): { x: number; y: number } {
    if (count <= 1) return { x: 300, y: 180 };
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return { x: 300 + Math.cos(angle) * 210, y: 180 + Math.sin(angle) * 120 };
  }

  function graphNodePoint(instanceId: string): { x: number; y: number } {
    return graphPoint(graph.nodes.findIndex((node) => node.id === instanceId), graph.nodes.length);
  }

  onMount(loadCatalog);

  const barActions = $derived(
    genericActions(
      {
        onsave: onSave ? () => void onSave() : undefined,
        onexport: onExport,
        onopenanother: onOpenAnother,
        onopenagents: onOpenAgents,
        onpreview: surface === "document" && activeBlueprint && activeComposition ? () => (showFullPreview = !showFullPreview) : undefined,
      },
      { shell, saving, dirty: documentDirty, fullPreview: showFullPreview },
    ),
  );
</script>

{#snippet editorButtons(testPrefix: string)}
  {#each packageEditors as { editor, unmet } (editor.id)}
    {#if onOpenEditor}
      {#if unmet}
        <button class="nav__item" data-testid="{testPrefix}-{editor.id}" title={unmet.reason} disabled>{editor.label}</button>
        <small class="generic-muted" data-testid="{testPrefix}-{editor.id}-unmet">{unmet.reason}</small>
        {#if unmet.install && onInstallEditor}
          <button class="nav__item" data-testid="{testPrefix}-{editor.id}-install" disabled={installing !== null} onclick={() => void install(editor.id)}>{installing === editor.id ? "Installing…" : `Install ${editor.label}`}</button>
        {/if}
        {#if installError?.id === editor.id}
          <Notice kind="error">{installError.message}</Notice>
        {/if}
      {:else}
        <button class="nav__item" data-testid="{testPrefix}-{editor.id}" title={editor.description} onclick={() => onOpenEditor(editor.id)}>{editor.label}</button>
      {/if}
    {/if}
  {/each}
{/snippet}

{#snippet navPane()}
  <Nav repo={repoName} eyebrow="SRS repository">
    {#snippet children()}
    <section class="nav__group" data-part="documents">
      <h2 class="nav__group-label">Documents</h2>
      {#if compositions.length === 0}
        <p class="generic-muted">No compositions declared.</p>
      {:else}
        {#each compositions as composition (composition.id)}
          <button class="nav__item" class:nav__item--active={surface === "document" && selectedCompositionId === composition.id} onclick={() => renderComposition(composition.id)}>
            <span>{composition.name}</span><small class="nav__item-count">{composition.namespace}</small>
          </button>
        {/each}
      {/if}
    </section>

    <section class="nav__group" data-part="structure">
      <h2 class="nav__group-label">Structure</h2>
      {#if navigation}
        <p class="generic-tree-root">{navigation.identity.displayLabel}</p>
      {/if}
      {#each structureContainers as entry (entry.key)}
        {@const container = entry.container}
        <div class="generic-tree-item" data-depth={entry.depth} style:margin-left="{entry.depth}rem">
          <button class="nav__item" class:nav__item--active={surface === "structure" && selectedContainerId === container.containerId} onclick={() => selectContainer(container.containerId)}>
            <span>{entry.label}</span>
            <small class="nav__item-count">{container.containerType ?? "container"}</small>
          </button>
          <button class="nav__item generic-tree-toggle" aria-label={`Toggle ${entry.label}`} aria-expanded={expandedContainerIds.has(container.containerId)} onclick={() => toggleContainer(container.containerId)}>
            {expandedContainerIds.has(container.containerId) ? "−" : "+"}
          </button>
        </div>
        {#if expandedContainerIds.has(container.containerId)}
          {@const members = expandedMembers[container.containerId] ?? []}
          <div class="generic-tree-members">
            {#if members.length === 0}<span class="generic-muted">No members</span>{/if}
            {#each members as member (member.instanceId)}
              <button class="nav__item" onclick={() => openRecord(member.instanceId)}>{member.displayLabel || member.instanceId.slice(0, 8)}</button>
            {/each}
          </div>
        {/if}
      {/each}
    </section>

    <section class="nav__group" data-part="explore">
      <h2 class="nav__group-label">Explore</h2>
      <button class="nav__item" class:nav__item--active={surface === "records"} onclick={openRecords}>Records</button>
      <button class="nav__item" class:nav__item--active={surface === "map"} onclick={openMap}>Map</button>
    </section>

    {#if packageEditors.length > 0}
      <section class="nav__group" data-part="editors">
        <h2 class="nav__group-label">Package editors</h2>
        {@render editorButtons("package-editor")}
      </section>
    {/if}
    {/snippet}
  </Nav>
{/snippet}

{#snippet mainPane()}
  <Main>
    {#snippet bar()}
    <Toolbar title={repoName} actions={barActions} groups={BASE_GROUPS}>
      {#snippet lead()}<NavTrigger />{/snippet}
      {#snippet trail()}<InspectorTrigger />{/snippet}
      {#snippet status()}
        {#if documentDirty}<span data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
      {/snippet}
    </Toolbar>
    {/snippet}
    <!-- The reason is a sentence: a line under the bar (wraps on a phone) rather than in the one-row bar. -->
    {#if !onSave && readOnlyReason}<Notice kind="info" testid="read-only-note">{readOnlyReason}</Notice>{/if}
    <div class="workspace">
      <div class="generic-page">
    {#if surface === "document"}
      <header>
        <p>Document</p>
        <h1>{activeComposition?.name ?? "Composition"}</h1>
      </header>
      {#if documentError}<Notice kind="error">{documentError}</Notice>{/if}
      <Diagnostics variant="notice" testid="document-diagnostics" diagnostics={diagnosticsFromStrings(documentDiagnostics)} documentKey={`${repoName}:${selectedCompositionId}`} />
      {#if activeBlueprint && activeComposition}
        <div class="document-editor-panel document-editor-panel--full" data-testid="document-editor-panel">
          <BlueprintDocumentEditor
            {repo}
            composition={activeComposition}
            saving={saving}
            revision={documentRenderRevision}
            onMutation={onDocumentEditorMutation}
          />
        </div>
        {#if showFullPreview}
          <div class="document-preview-panel document-preview-panel--full" data-testid="document-full-preview">
            <div class="generic-preview"><PreviewPane html={renderedDocument} loading={loadingDocument} /></div>
          </div>
        {/if}
      {:else}
        <div class="generic-preview"><PreviewPane html={renderedDocument} loading={loadingDocument} /></div>
      {/if}
    {:else if surface === "map"}
      <header>
        <p>Scoped map</p>
        <h1>{selectedRecord ? selectedRecord.displayLabel ?? "Record relations" : activeContainer ? activeContainer.title : "Repository records"}</h1>
      </header>
      {#if selectedRecord}<button onclick={() => { clearRecordSelection(); refreshRecords(); }}>Clear record focus</button>{/if}
      <p class="generic-muted">{selectedRecord ? "Direct relations of the selected record." : selectedContainerId ? "Relations resolved by the engine for the active container." : "Select a container or record to view its relations."}</p>
      {#if graph.nodes.length === 0}
        <p class="generic-muted">No records match this scope.</p>
      {:else}
        <div class="generic-graph" data-testid="scoped-graph">
          <svg viewBox="0 0 600 360" role="img" aria-label="Scoped record relation graph">
            {#each graph.relations as relation (relation.relationId)}
              {@const from = graphNodePoint(relation.sourceInstanceId)}
              {@const to = graphNodePoint(relation.targetInstanceId)}
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2}>{relation.relationType}</text>
            {/each}
            {#each graph.nodes as node, index (node.id)}
              {@const point = graphPoint(index, graph.nodes.length)}
              <g
                class:focused={node.id === selectedRecord?.instanceId}
                role="button"
                tabindex="0"
                aria-label={`Inspect ${node.label}`}
                onclick={() => openRecord(node.id)}
                onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") openRecord(node.id); }}
              >
                <circle cx={point.x} cy={point.y} r="28" />
                <text class="node-label" x={point.x} y={point.y + 45}>{node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}</text>
              </g>
            {/each}
          </svg>
        </div>
      {/if}
    {:else}
      <header>
        <p>{surface === "structure" ? "Structure" : "Explore"}</p>
        <h1>{surface === "structure" ? activeContainer?.title ?? "Container" : "Records"}</h1>
      </header>
      <div class="generic-controls">
        <input aria-label="Search records" bind:value={search} oninput={refreshRecords} placeholder="Search repository" />
        <select aria-label="Filter records by type" bind:value={selectedTypeId} onchange={refreshRecords}>
          <option value="">All types</option>
          {#each types as type (type.id)}
            <option value={type.id}>{type.namespace}/{type.name}</option>
          {/each}
        </select>
        {#if surface === "structure"}<button onclick={openRecords}>Search all records</button>{/if}
      </div>
      {#if recordError}<Notice kind="error">{recordError}</Notice>{/if}
      <Diagnostics variant="notice" testid="record-diagnostics" diagnostics={diagnosticsFromStrings(recordDiagnostics)} documentKey={`${repoName}:records:${surface === "records" ? "" : selectedContainerId}`} />
      <p class="generic-muted">{records.length} record{records.length === 1 ? "" : "s"}</p>
      <div class="generic-records">
        {#each records as record (record.instanceId)}
          <button class="generic-record-row" data-testid="record-row" onclick={() => openRecord(record.instanceId)}>
            <strong>{record.label || record.instanceId.slice(0, 8)}</strong>
            <span>{record.typeNamespace}/{record.typeName}{record.lifecycleState ? ` · ${record.lifecycleState}` : ""}</span>
          </button>
        {/each}
      </div>
    {/if}
      </div>
    </div>
  </Main>
{/snippet}

{#snippet inspectorPane()}
  <Inspector label="Record">
    {#if selectedRecord}
      {#if editing && editFormDef}
        <SectionForm
          label={editFormDef.label}
          fields={editFormDef.fields}
          composites={editFormDef.composites}
          record={selectedRecord}
          wide
          onSave={saveEdit}
          onCancel={() => { editing = false; editError = null; }}
          saving={editSaving}
          saveError={editError}
        />
      {:else}
        <header class="generic-inspector-head">
          <p>Record</p>
          <h2>{selectedRecord.displayLabel ?? selectedRecord.instanceId}</h2>
          <span>{selectedRecord.typeNamespace}/{selectedRecord.typeName}</span>
          <button class="generic-edit" disabled={saving} onclick={beginEdit}>Edit fields</button>
          {#if editError}<Notice kind="error" testid="generic-edit-error">{editError}</Notice>{/if}
        </header>
        {#each Object.entries(selectedRecord.fieldValues) as [name, value] (name)}
          <div class="generic-field"><strong>{name}</strong><FieldValueView {value} /></div>
        {/each}
        {#key selectedRecord.instanceId}
          <InstanceNotes {repo} instanceId={selectedRecord.instanceId} revision={documentRevision} heading />
        {/key}
      {/if}
    {:else}
      <p class="generic-muted">Select a record to inspect its fields and relations.</p>
    {/if}
  </Inspector>
{/snippet}

<div class="generic-shell" data-testid="generic-srs-shell">
  <AppShell {shell} nav={navPane} main={mainPane} inspector={inspectorPane} navLabel="Repository navigation" inspectorLabel="Record" />
</div>

