<!--
  GenericSrsShell — repository-first SRS reader.

  It deliberately renders only engine-resolved structures: compositions,
  repository navigation, container membership, discovery results, and package
  boundaries. Package-specific editors remain optional entry points.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    find,
    getRecord,
    listContainers,
    listDocumentViews,
    listPackages,
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
    PackageSummary,
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
  import { blueprintForComposition } from "$lib/editor/document-model.js";
  import type { BlueprintSummary } from "$lib/srs-client.js";
  import type { CompositeFormDef } from "$lib/editor/blueprint-fields.js";
  import type { FieldFormDef } from "$lib/governance/types.js";
  import { availablePackageEditors } from "$lib/generic/package-editors.js";

  interface Props {
    repo: SrsRepository;
    repoName: string;
    onExport: () => void;
    /** Write the engine-owned current repository to the opened backend, when allowed. */
    onSave?: () => Promise<void>;
    saving?: boolean;
    saveMessage?: string | null;
    /** App-owned dirty state, shared with non-UI repository writers. */
    documentDirty?: boolean;
    /** Changes after mount invalidate derived browser projections of the repository. */
    documentRevision?: number;
    /** Report a successful in-place repository mutation to the App shell. */
    onDocumentMutation?: () => void;
    onOpenAnother: () => void;
    onOpenGovernance?: () => void;
    onOpenGuides?: () => void;
  }

  let {
    repo,
    repoName,
    onExport,
    onSave,
    saving = false,
    saveMessage = null,
    documentDirty = false,
    documentRevision = 0,
    onDocumentMutation = () => {},
    onOpenAnother,
    onOpenGovernance,
    onOpenGuides,
  }: Props = $props();

  type Surface = "document" | "structure" | "records" | "map";

  let surface = $state<Surface>("document");
  let compositions = $state<DocumentViewSummary[]>([]);
  let containers = $state<ContainerSummary[]>([]);
  let navigation = $state<RepositoryNavigation | null>(null);
  let types = $state<TypeSummary[]>([]);
  let packages = $state<PackageSummary[]>([]);
  let selectedCompositionId = $state<string | null>(null);
  let selectedContainerId = $state<string | null>(null);
  let selectedRecord = $state<SrsRecord | null>(null);
  let renderedDocument = $state<string | null>(null);
  let documentError = $state<string | null>(null);
  let loadingDocument = $state(false);
  let search = $state("");
  let selectedTypeId = $state<string>("");
  let expandedContainerIds = $state<Set<string>>(new Set());
  let expandedMembers = $state<Record<string, ResolvedMember[]>>({});
  let records = $state<DiscoveryHit[]>([]);
  let recordDiagnostics = $state<string[]>([]);
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
  const packageEditors = $derived(availablePackageEditors(packages, types));

  function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function loadCatalog(): void {
    try {
      compositions = listDocumentViews(repo);
      containers = listContainers(repo);
      types = listTypes(repo);
      packages = listPackages(repo);
      try {
        navigation = repositoryNavigation(repo);
      } catch {
        navigation = null;
      }
      selectedCompositionId = compositions[0]?.id ?? null;
      selectedContainerId = navigation?.sections[0]?.sectionContainerId ?? containers[0]?.containerId ?? null;
      refreshRecords();
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
    loadingDocument = true;
    documentError = null;
    try {
      const result = renderDocumentView(repo, compositionId, "html");
      renderedDocument = result.rendered;
      if (result.diagnostics.length > 0) documentError = result.diagnostics.join(" ");
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
    onDocumentMutation();
    documentRenderRevision++;
    if (selectedCompositionId) renderComposition(selectedCompositionId);
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
        recordDiagnostics = [message(error)];
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
    } catch (error: unknown) {
      records = [];
      recordDiagnostics = [message(error)];
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

  function openRecord(instanceId: string): void {
    try {
      editing = false;
      editFormDef = null;
      editError = null;
      selectedRecord = getRecord(repo, instanceId);
    } catch (error: unknown) {
      recordDiagnostics = [message(error)];
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
      onDocumentMutation();
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
      }))
      .filter((entry): entry is { container: ContainerSummary; label: string; key: string } => Boolean(entry.container));
    return navigationContainers.length > 0
      ? navigationContainers
      : containers.map((container) => ({ container, label: container.title, key: container.containerId }));
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
</script>

<div class="generic-shell" data-testid="generic-srs-shell">
  <aside class="generic-nav" aria-label="Repository navigation">
    <div class="generic-brand">
      <p>SRS repository</p>
      <strong>{repoName}</strong>
    </div>

    <section>
      <h2>Documents</h2>
      {#if compositions.length === 0}
        <p class="muted">No compositions declared.</p>
      {:else}
        {#each compositions as composition (composition.id)}
          <button class:active={surface === "document" && selectedCompositionId === composition.id} onclick={() => renderComposition(composition.id)}>
            <span>{composition.name}</span><small>{composition.namespace}</small>
          </button>
        {/each}
      {/if}
    </section>

    <section>
      <h2>Structure</h2>
      {#if navigation}
        <p class="tree-root">{navigation.identity.displayLabel}</p>
      {/if}
      {#each structureContainers as entry (entry.key)}
        {@const container = entry.container}
        <div class="tree-item">
          <button class:active={surface === "structure" && selectedContainerId === container.containerId} onclick={() => selectContainer(container.containerId)}>
            <span>{entry.label}</span>
            <small>{container.containerType ?? "container"}</small>
          </button>
          <button class="tree-toggle" aria-label={`Toggle ${entry.label}`} onclick={() => toggleContainer(container.containerId)}>
            {expandedContainerIds.has(container.containerId) ? "−" : "+"}
          </button>
        </div>
        {#if expandedContainerIds.has(container.containerId)}
          {@const members = expandedMembers[container.containerId] ?? []}
          <div class="tree-members">
            {#if members.length === 0}<span class="muted">No members</span>{/if}
            {#each members as member (member.instanceId)}
              <button onclick={() => openRecord(member.instanceId)}>{member.displayLabel || member.instanceId.slice(0, 8)}</button>
            {/each}
          </div>
        {/if}
      {/each}
    </section>

    <section>
      <h2>Explore</h2>
      <button class:active={surface === "records"} onclick={openRecords}>Records</button>
      <button class:active={surface === "map"} onclick={openMap}>Map</button>
    </section>

    {#if packageEditors.length > 0}
      <section>
        <h2>Package editors</h2>
        {#each packageEditors as editor (editor.id)}
          {#if editor.id === "governance" && onOpenGovernance}
            <button data-testid="package-editor-governance" onclick={onOpenGovernance}>{editor.label}</button>
          {:else if editor.id === "guides" && onOpenGuides}
            <button data-testid="package-editor-guides" onclick={onOpenGuides}>{editor.label}</button>
          {/if}
        {/each}
      </section>
    {/if}

    <div class="generic-nav-actions">
      {#if onSave}<button disabled={saving} onclick={onSave}>{saving ? "Saving…" : "Save"}</button>{/if}
      <button onclick={onExport}>Export</button>
      <button onclick={onOpenAnother}>Open another</button>
      {#if documentDirty}<p class="save-message" data-testid="document-dirty-status" role="status">Unsaved changes</p>{/if}
      {#if saveMessage}<p class="save-message" role="status">{saveMessage}</p>{/if}
    </div>
  </aside>

  <main class="generic-main">
    {#if surface === "document"}
      <header><p>Document</p><h1>{activeComposition?.name ?? "Composition"}</h1></header>
      {#if documentError}<p class="notice">{documentError}</p>{/if}
      {#if activeBlueprint && activeComposition}
        <div class="document-editor-layout">
          <div class="document-editor-panel" data-testid="document-editor-panel">
            <BlueprintDocumentEditor
              {repo}
              composition={activeComposition}
              saving={saving}
              revision={documentRenderRevision}
              onMutation={onDocumentEditorMutation}
            />
          </div>
          <div class="document-preview-panel">
            <PreviewPane html={renderedDocument} loading={loadingDocument} />
          </div>
        </div>
      {:else}
        <PreviewPane html={renderedDocument} loading={loadingDocument} />
      {/if}
    {:else if surface === "map"}
      <header>
        <p>Scoped map</p>
        <h1>{selectedRecord ? selectedRecord.displayLabel ?? "Record relations" : activeContainer ? activeContainer.title : "Repository records"}</h1>
      </header>
      {#if selectedRecord}<button onclick={() => { clearRecordSelection(); refreshRecords(); }}>Clear record focus</button>{/if}
      <p class="muted">{selectedRecord ? "Direct relations of the selected record." : selectedContainerId ? "Relations resolved by the engine for the active container." : "Select a container or record to view its relations."}</p>
      {#if graph.nodes.length === 0}
        <p class="muted">No records match this scope.</p>
      {:else}
        <div class="graph-frame" data-testid="scoped-graph">
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
      <div class="record-controls">
        <input aria-label="Search records" bind:value={search} oninput={refreshRecords} placeholder="Search repository" />
        <select aria-label="Filter records by type" bind:value={selectedTypeId} onchange={refreshRecords}>
          <option value="">All types</option>
          {#each types as type (type.id)}
            <option value={type.id}>{type.namespace}/{type.name}</option>
          {/each}
        </select>
        {#if surface === "structure"}<button onclick={openRecords}>Search all records</button>{/if}
      </div>
      {#if recordDiagnostics.length > 0}<p class="notice">{recordDiagnostics.join(" ")}</p>{/if}
      <p class="muted">{records.length} record{records.length === 1 ? "" : "s"}</p>
      <div class="record-list">
        {#each records as record (record.instanceId)}
          <button class="record-row" onclick={() => openRecord(record.instanceId)}>
            <strong>{record.label || record.instanceId.slice(0, 8)}</strong>
            <span>{record.typeNamespace}/{record.typeName}{record.lifecycleState ? ` · ${record.lifecycleState}` : ""}</span>
          </button>
        {/each}
      </div>
    {/if}
  </main>

  <aside class="generic-inspector">
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
        <header>
          <p>Record</p>
          <h2>{selectedRecord.displayLabel ?? selectedRecord.instanceId}</h2>
          <span>{selectedRecord.typeNamespace}/{selectedRecord.typeName}</span>
          <button class="edit-button" disabled={saving} onclick={beginEdit}>Edit fields</button>
          {#if editError}<p class="notice">{editError}</p>{/if}
        </header>
        {#each Object.entries(selectedRecord.fieldValues) as [name, value] (name)}
          <div class="field"><strong>{name}</strong><FieldValueView {value} /></div>
        {/each}
        {#if selectedRelations.length > 0}
          <h3>Relations</h3>
          {#each selectedRelations as relation (relation.relationId)}
            <p>{relation.relationType}</p>
          {/each}
        {/if}
      {/if}
    {:else}
      <p class="muted">Select a record to inspect its fields and relations.</p>
    {/if}
  </aside>
</div>

<style>
  .generic-shell { display:grid; grid-template-columns:17rem minmax(0, 1fr) 22rem; min-height:100dvh; background:#f7f7f5; color:#1f2328; }
  .generic-nav { background:#1f302d; color:#f7f7f5; padding:1.25rem .8rem; display:flex; flex-direction:column; gap:1.25rem; }
  .generic-brand p, .generic-main header p, .generic-inspector header p { margin:0 0 .2rem; font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; opacity:.65; }
  .generic-brand strong { font-size:1.1rem; overflow-wrap:anywhere; }
  section { display:flex; flex-direction:column; gap:.2rem; }
  section h2 { font-size:.72rem; letter-spacing:.08em; text-transform:uppercase; margin:0 0 .3rem; opacity:.65; }
  .generic-nav button { color:inherit; text-align:left; border:0; background:transparent; border-radius:.25rem; padding:.45rem .5rem; cursor:pointer; display:flex; flex-direction:column; gap:.1rem; }
  .generic-nav button:hover, .generic-nav button.active { background:#405852; }
  .generic-nav button small { opacity:.65; font-size:.68rem; }
  .tree-root { margin:0 0 .3rem; padding:.35rem .5rem; color:#d4dfdb; font-size:.78rem; border-left:2px solid #91afa5; }
  .tree-item { display:grid; grid-template-columns:minmax(0,1fr) 1.8rem; align-items:stretch; }
  .tree-item > button:first-child { min-width:0; }
  .tree-item .tree-toggle { align-items:center; justify-content:center; padding:.25rem; font-size:1rem; }
  .tree-members { display:flex; flex-direction:column; gap:.1rem; margin:0 0 .15rem 1rem; padding-left:.4rem; border-left:1px solid #668078; }
  .tree-members button { font-size:.72rem; opacity:.82; }
  .generic-nav-actions { margin-top:auto; display:flex; gap:.4rem; flex-wrap:wrap; }
  .save-message { flex-basis:100%; margin:.2rem .5rem 0; color:#c8e5d9; font-size:.75rem; }
  .generic-main { min-width:0; display:flex; flex-direction:column; padding:1.5rem; gap:1rem; }
  .generic-main h1, .generic-inspector h2 { margin:0; font-size:1.35rem; }
  .document-editor-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1rem; min-height:0; }
  .document-editor-panel { overflow:auto; }
  .document-preview-panel { overflow:auto; border-left:1px solid #d5dbd8; padding-left:1rem; }
  @media (max-width: 1100px) { .document-editor-layout { grid-template-columns:1fr; } .document-preview-panel { border-left:0; padding-left:0; border-top:1px solid #d5dbd8; padding-top:1rem; } }
  .record-controls { display:flex; gap:.5rem; flex-wrap:wrap; }
  .record-controls input, .record-controls select, .record-controls button { font:inherit; padding:.45rem .6rem; border:1px solid #b9c2be; border-radius:.25rem; background:#fff; }
  .record-controls input { min-width:15rem; flex:1; }
  .record-list { display:flex; flex-direction:column; gap:.35rem; overflow:auto; }
  .record-row { display:flex; flex-direction:column; align-items:flex-start; gap:.15rem; padding:.7rem; border:1px solid #d5dbd8; border-radius:.35rem; background:#fff; text-align:left; cursor:pointer; }
  .record-row:hover { border-color:#52756c; }
  .record-row span, .generic-inspector header span, .muted { color:#69736f; font-size:.8rem; }
  .generic-inspector { border-left:1px solid #d5dbd8; background:#fff; padding:1.5rem; overflow:auto; }
  .field { padding:.65rem 0; border-bottom:1px solid #e7ebe9; display:flex; flex-direction:column; gap:.25rem; font-size:.9rem; }
  .field strong { font-size:.75rem; color:#52605b; }
  .edit-button { margin-top:.75rem; border:1px solid #52756c; color:#23443d; background:#fff; border-radius:.25rem; padding:.35rem .5rem; cursor:pointer; }
  .notice { padding:.65rem .8rem; background:#fff4d6; border-left:3px solid #a56800; }
  .graph-frame { min-height:25rem; border:1px solid #d5dbd8; border-radius:.5rem; background:#fff; overflow:auto; }
  .graph-frame svg { width:100%; min-width:38rem; min-height:25rem; }
  .graph-frame line { stroke:#9aa9a3; stroke-width:1.5; }
  .graph-frame text { fill:#61716b; font-size:10px; text-anchor:middle; pointer-events:none; }
  .graph-frame g { cursor:pointer; }
  .graph-frame circle { fill:#dceae5; stroke:#52756c; stroke-width:2; }
  .graph-frame g:hover circle, .graph-frame g.focused circle { fill:#52756c; stroke:#23443d; }
  .graph-frame g.focused .node-label { font-weight:700; fill:#23443d; }
  @media (max-width: 900px) { .generic-shell { grid-template-columns:13rem minmax(0,1fr); } .generic-inspector { grid-column:1 / -1; border-left:0; border-top:1px solid #d5dbd8; } }
  @media (max-width: 600px) { .generic-shell { display:block; } .generic-nav { min-height:auto; } .generic-nav section { display:none; } .generic-nav section:first-of-type { display:flex; } }
</style>
