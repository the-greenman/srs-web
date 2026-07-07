<!-- GovernanceShell.svelte — self-contained governance editor shell.
     Extracted from App.svelte following the GuidesShell pattern.
     See plans/governance-shell-76.md and srs-web#76.
     Nav migrated from TYPE_REGISTRY to container-driven (ADR-009, srs-web#93). -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    listRecords,
    createRecord,
    updateRecord,
    deleteRecord,
    createRecordSuccessor,
    typeSchema,
    addContainerMember,
    listContainers,
    getContainer,
    repositoryNavigation,
    listRelations,
    createRelation,
    deleteRelation,
    resolveContainerView,
    exportSrsj,
  } from "$lib/srs-client.js";
  import { saveWorkingCopy } from "$lib/browser-cache.js";
  import type {
    SrsRepository,
    SrsRecord,
    SrsRelation,
    Diagnostic as WasmDiagnostic,
    CreateRecordInput,
    UpdateRecordInput,
    SchemaDefinition,
    ContainerView,
  } from "$lib/srs-client.js";
  import type { BreadcrumbItem, Diagnostic } from "$lib/types.js";

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
  import CardField from "$lib/components/CardField.svelte";
  import FieldValueView from "../../rendering/FieldValueView.svelte";
  import Diagnostics from "$lib/components/Diagnostics.svelte";
  import RecordForm from "$lib/components/RecordForm.svelte";
  import SuccessorModal from "$lib/components/SuccessorModal.svelte";
  import DecisionLinkPicker from "$lib/components/DecisionLinkPicker.svelte";
  import RecordReading from "$lib/components/RecordReading.svelte";
  import DecisionLogView from "$lib/components/DecisionLogView.svelte";
  import TagChip from "$lib/components/TagChip.svelte";

  import { TYPE_REGISTRY, DECISION_TYPE_ID } from "$lib/governance/type-registry.js";
  import { getStringField, findFieldId } from "$lib/governance/field-utils.js";
  import type { TypeFormDef } from "$lib/governance/types.js";
  import { definitionToFields } from "$lib/guides/blueprint-utils.js";
  import { LIFECYCLE_TRANSITIONS, IMMUTABLE_STATES } from "$lib/governance/lifecycle.js";
  import { setFieldMetaContext, buildFieldMetaMap } from "$lib/governance/field-meta.js";
  import { formatDecisionMarkdown, formatDecisionHtml, triggerDownload } from "$lib/governance/decision-export-utils.js";

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------

  interface Props {
    repo: SrsRepository;
    repoName: string;
    documentProvider: string;
    onExport: () => void;
    /** Write back to the opened cloud/git document. Undefined for read-only handles. */
    onSave?: () => Promise<void>;
    saving?: boolean;
    saveMessage?: string | null;
    onOpenAnother: () => void;
  }
  let {
    repo,
    repoName,
    documentProvider,
    onExport,
    onSave,
    saving = false,
    saveMessage = null,
    onOpenAnother,
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // Local types
  // ---------------------------------------------------------------------------

  interface ContainerNavEntry {
    /** Maps to `section.sectionContainerId` in the RFC-013 nav path. */
    containerId: string;
    title: string;
    rootTypeId?: string;
    rootTypeVersion?: number;
    rootTypeName?: string;
    rootTypeNamespace?: string;
    /** The type this section's records/create-form resolve to: the registry
     * memberTypeId for RFC-013 header roots, else the root type itself.
     * Computed at nav-build time so decision-feature gating does not depend
     * on a later typeSchema() call succeeding. */
    sectionTypeId?: string;
    icon: string;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Container nav entries from repositoryNavigation() (RFC-013) or listContainers() fallback (ADR-009). */
  let containers = $state<ContainerNavEntry[]>([]);

  /** Records per container, keyed by containerId (populated from getContainer.memberInstanceIds). */
  let containerRecords = $state<Record<string, SrsRecord[]>>({});

  /** Active sidebar container — null until first data load. */
  let activeContainerId = $state<string | null>(null);

  /** Selected record instance ID. */
  let selectedId = $state<string | null>(null);

  /** Validation diagnostics mapped to types.ts shape. */
  let diagnostics = $state<Diagnostic[]>([]);
  let instanceCount = $state<number>(0);

  /** TypeFormDef per container, keyed by containerId, derived from root type schema. */
  let containerSchemas = $state<Record<string, TypeFormDef>>({});

  // fieldMetaMap is $derived so buildFieldMetaMap only runs when containerSchemas
  // changes (once at load), not on every reactive access from child components.
  const fieldMetaMap = $derived(buildFieldMetaMap(containerSchemas));

  // Discover the status field ID from the loaded package schema rather than hardcoding
  // the UUID. Returns undefined when the governance package has no "status" field —
  // callers treat undefined as a graceful no-op (see #86).
  const statusFieldId = $derived(findFieldId("status", fieldMetaMap));

  // Provide reactive field metadata to all descendant rendering components.
  setFieldMetaContext(() => fieldMetaMap);

  /** Form mode: null = list view, 'create' = new record, 'edit' = edit existing. */
  let formMode = $state<"create" | "edit" | null>(null);
  let editingRecord = $state<SrsRecord | null>(null);
  let formSaving = $state(false);
  let formError = $state<string | null>(null);
  /** instanceId of a record that was created but whose addContainerMember call failed.
   * Set when transitioning to edit mode after a partial create; cleared on next Save or Cancel.
   * Used to retry addContainerMember when the user saves in edit mode. */
  let partiallyCreatedId = $state<string | null>(null);

  /** Whether the immutability guard modal is shown. */
  let showSuccessorModal = $state(false);

  /** Whether the decision link picker modal is shown. */
  let showLinkPicker = $state(false);

  /** Relations (as source or target) for the currently selected decision. */
  let decisionRelations = $state<SrsRelation[]>([]);

  /** Tag input value for the inspector tag editor. */
  let tagInput = $state<string>("");

  /** Error message for single-decision export (cleared on record selection change). */
  let decisionExportError = $state<string | null>(null);

  /** Topbar autosave indicator state. */
  let saveIndicator = $state<"idle" | "saved">("idle");
  let saveIndicatorTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  let activeRecords = $derived(activeContainerId !== null ? (containerRecords[activeContainerId] ?? []) : []);

  let activeContainer = $derived(
    containers.find((c) => c.containerId === activeContainerId) ?? null,
  );

  /**
   * Structured view of the active container (ADR-010): the core-resolved column spec
   * for the generic list pane. Skipped for the Decision path (it uses DecisionLogView,
   * so resolving here would be a wasted WASM round-trip). Column *selection* and labels
   * come from the DocumentView via the core; the client only reads values at the
   * core-provided fieldIds — no field-name semantics in TS.
   */
  let activeContainerView = $derived.by<ContainerView | null>(() => {
    if (activeContainerId === null) return null;
    if (activeContainer?.sectionTypeId === DECISION_TYPE_ID) return null;
    try {
      const view = resolveContainerView(repo, activeContainerId);
      if (view.diagnostics.length > 0) {
        console.warn("resolveContainerView diagnostics:", view.diagnostics);
      }
      return view;
    } catch (e: unknown) {
      console.error("resolveContainerView failed:", e);
      return null;
    }
  });

  /** Column spec for the active container's list, ordered by the DocumentView's `order`. */
  let activeColumns = $derived(
    [...(activeContainerView?.columns ?? [])].sort((a, b) => a.order - b.order),
  );

  let activeSectionSchema = $derived(
    activeContainerId !== null ? (containerSchemas[activeContainerId] ?? null) : null,
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

  /**
   * Load container nav from repositoryNavigation() (RFC-013 primary path).
   * Falls back to listContainers() for pre-RFC-013 repos without manifest.container.
   * ADR-009: this completes the migration from listContainers() to repository_navigation.
   */
  function loadContainerNav(): void {
    const nav = repositoryNavigation(repo);
    if (nav.diagnostics.length > 0) {
      console.warn("repository_navigation diagnostics:", nav.diagnostics);
    }

    if (nav.diagnostics.length === 0) {
      // RFC-013 path: manifest.container present; sections ordered by precedes.
      const allRecords = listRecords(repo, {});
      const recordMap = new Map<string, SrsRecord>(allRecords.map((r) => [r.instanceId, r]));
      const navEntries: ContainerNavEntry[] = [];
      const recordsByContainer: Record<string, SrsRecord[]> = {};

      for (const section of nav.sections) {
        if (!section.sectionContainerId) {
          // Section root has no container — skip. RFC-013 mandates every section root has
          // a container; diagnostics from repository_navigation already surface this case.
          continue;
        }
        const containerId = section.sectionContainerId;
        const full = getContainer(repo, containerId);
        const members = (full.memberInstanceIds ?? [])
          .map((id) => recordMap.get(id))
          .filter((r): r is SrsRecord => r !== undefined);
        recordsByContainer[containerId] = members;

        const regEntry = TYPE_REGISTRY[section.typeId];
        navEntries.push({
          containerId,
          title: section.displayLabel,
          rootTypeId: section.typeId,
          sectionTypeId: regEntry?.memberTypeId ?? section.typeId,
          rootTypeVersion: section.typeVersion,
          rootTypeName: section.typeName,
          rootTypeNamespace: section.typeNamespace,
          icon: regEntry?.icon ?? "◻",
        });
      }

      containers = navEntries;
      containerRecords = recordsByContainer;
    } else {
      // Pre-RFC-013 fallback: manifest.container is absent; use listContainers() (ADR-009 interim).
      buildContainerNavFromListContainers();
    }

    if (activeContainerId === null && containers.length > 0) {
      activeContainerId = containers[0].containerId;
    }
  }

  /**
   * Fallback nav builder for pre-RFC-013 repos (no manifest.container).
   * Used by loadContainerNav() when repository_navigation returns empty sections.
   */
  function buildContainerNavFromListContainers(): void {
    const allRecords = listRecords(repo, {});
    const recordMap = new Map<string, SrsRecord>(allRecords.map((r) => [r.instanceId, r]));
    const allContainers = listContainers(repo, {});

    const navEntries: ContainerNavEntry[] = [];
    const recordsByContainer: Record<string, SrsRecord[]> = {};

    for (const summary of allContainers) {
      const full = getContainer(repo, summary.containerId);
      const members = (full.memberInstanceIds ?? [])
        .map((id) => recordMap.get(id))
        .filter((r): r is SrsRecord => r !== undefined);
      recordsByContainer[summary.containerId] = members;

      const rootId = full.rootInstanceIds?.[0];
      const rootRecord = rootId ? recordMap.get(rootId) : undefined;
      const rootTypeId = rootRecord?.typeId;
      const rootTypeVersion = rootRecord?.typeVersion;
      const rootTypeName = rootRecord?.typeName;
      const rootTypeNamespace = rootRecord?.typeNamespace;
      const regEntry = rootTypeId ? TYPE_REGISTRY[rootTypeId] : undefined;

      navEntries.push({
        containerId: summary.containerId,
        title: summary.title,
        rootTypeId,
        sectionTypeId: rootTypeId ? (regEntry?.memberTypeId ?? rootTypeId) : undefined,
        rootTypeVersion,
        rootTypeName,
        rootTypeNamespace,
        icon: regEntry?.icon ?? "◻",
      });
    }

    containers = navEntries;
    containerRecords = recordsByContainer;
  }

  function buildContainerSchemas(): void {
    const result: Record<string, TypeFormDef> = {};
    for (const container of containers) {
      if (!container.rootTypeId) continue;
      // RFC-013 root-header containers (e.g. a scaffolded Decision Log): the root record
      // is a header type; "New …" must create the container's MEMBER type instead.
      // Interim registry config until the blueprint schema projects member types
      // (srs-rust#382) and the list pane is view-driven (srs-web#94/#95).
      const memberTypeId = TYPE_REGISTRY[container.rootTypeId]?.memberTypeId;
      const memberEntry = memberTypeId ? TYPE_REGISTRY[memberTypeId] : undefined;
      const createTypeId = container.sectionTypeId ?? memberTypeId ?? container.rootTypeId;
      const createTypeVersion = memberTypeId
        ? (memberEntry?.typeVersion ?? 1)
        : (container.rootTypeVersion ?? 1);
      try {
        const schemaResult = typeSchema(repo, createTypeId, createTypeVersion);
        if (schemaResult.diagnostics.length > 0) {
          console.warn("typeSchema diagnostics for container", container.containerId, schemaResult.diagnostics);
        }
        const rawSchema = schemaResult.schema;
        if (
          typeof rawSchema !== "object" || rawSchema === null ||
          typeof rawSchema["properties"] !== "object" || rawSchema["properties"] === null
        ) {
          console.warn("typeSchema returned unexpected shape for container", container.containerId, rawSchema);
          continue;
        }
        const schema = rawSchema as unknown as SchemaDefinition;
        result[container.containerId] = {
          typeId: createTypeId,
          typeVersion: createTypeVersion,
          typeNamespace: memberEntry?.typeNamespace ?? container.rootTypeNamespace ?? "",
          typeName: memberEntry?.typeName ?? container.rootTypeName ?? "",
          label: memberTypeId
            ? (memberEntry?.typeName ?? "record")
            : (container.rootTypeName ?? container.title),
          fields: definitionToFields(schema),
        };
      } catch (e: unknown) {
        console.error("typeSchema failed for container", container.containerId, e);
      }
    }
    containerSchemas = result;
  }

  function persistWorkingCopy(): void {
    try {
      const saved = saveWorkingCopy(repoName, exportSrsj(repo));
      if (!saved) return;
      if (saveIndicatorTimer !== null) clearTimeout(saveIndicatorTimer);
      saveIndicator = "saved";
      saveIndicatorTimer = setTimeout(() => {
        saveIndicator = "idle";
        saveIndicatorTimer = null;
      }, 2000);
    } catch (e: unknown) {
      console.warn("persistWorkingCopy failed:", e);
    }
  }

  onDestroy(() => {
    if (saveIndicatorTimer !== null) clearTimeout(saveIndicatorTimer);
  });

  function refreshValidation(): void {
    const report = repo.validate();
    instanceCount = report.instanceCount;
    diagnostics = report.diagnostics.map(mapDiagnostic);
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  onMount(() => {
    // Order matters: buildContainerSchemas reads containers set by loadContainerNav.
    loadContainerNav();
    buildContainerSchemas();
    refreshValidation();
  });

  // ---------------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------------

  function governanceCrumbItems(): BreadcrumbItem[] {
    const items: BreadcrumbItem[] = [{ label: repoName, title: `Opened from ${documentProvider}` }];
    if (formMode !== null) {
      items.push({ label: activeContainer?.title ?? "", onclick: handleFormCancel });
      if (formMode === "create") {
        items.push({ label: `New ${(activeContainer?.title ?? "").replace(/s$/, "")}` });
      } else if (editingRecord) {
        const title = editingRecord.fieldValues[0]?.value as string | undefined;
        items.push({ label: title ?? "Record" });
      }
    } else {
      items.push({ label: activeContainer?.title ?? "" });
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
        const typeDef = activeContainerId ? containerSchemas[activeContainerId] : undefined;
        if (!typeDef) return;
        const created = createRecord(repo, typeDef.typeId, typeDef.typeVersion, input as CreateRecordInput);
        if (activeContainerId) {
          try {
            addContainerMember(repo, activeContainerId, created.instanceId);
          } catch (e: unknown) {
            editingRecord = created;
            formMode = "edit";
            partiallyCreatedId = created.instanceId;
            console.error("addContainerMember failed:", e);
            formError = e instanceof Error
              ? `Record saved, but container registration failed: ${e.message}`
              : "Record saved, but could not register in container.";
            loadContainerNav();
            selectedId = created.instanceId;
            refreshValidation();
            persistWorkingCopy();
            return;
          }
        }
        formMode = null;
        loadContainerNav();
        selectedId = created.instanceId;
        refreshValidation();
        persistWorkingCopy();
      } else if (formMode === "edit" && editingRecord) {
        const instanceId = editingRecord.instanceId;
        updateRecord(repo, instanceId, input as UpdateRecordInput);
        if (activeContainerId && partiallyCreatedId === instanceId) {
          partiallyCreatedId = null;
          try {
            addContainerMember(repo, activeContainerId, instanceId);
          } catch (e: unknown) {
            console.error("addContainerMember retry failed:", e);
            formError = e instanceof Error
              ? `Record updated, but container registration still failed: ${e.message}`
              : "Record updated, but could not register in container.";
            loadContainerNav();
            refreshValidation();
            persistWorkingCopy();
            return;
          }
        }
        formMode = null;
        editingRecord = null;
        loadContainerNav();
        refreshValidation();
        persistWorkingCopy();
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
    partiallyCreatedId = null;
  }

  function handleEditRecord() {
    if (!selectedRecord) return;
    if (statusFieldId !== undefined) {
      const status = selectedRecord.fieldValues.find(
        (fv) => fv.fieldId === statusFieldId
      )?.value as string | undefined;
      if (status && IMMUTABLE_STATES.has(status)) {
        showSuccessorModal = true;
        return;
      }
    }
    editingRecord = selectedRecord;
    formError = null;
    formMode = "edit";
  }

  function handleDeleteRecord() {
    if (!selectedRecord) return;
    deleteRecord(repo, selectedRecord.instanceId);
    selectedId = null;
    showLinkPicker = false;
    loadContainerNav();
    refreshValidation();
    persistWorkingCopy();
  }

  function handleLifecycleTransition(toState: string) {
    if (!selectedRecord || statusFieldId === undefined) return;
    try {
      // Governance status is stored as a field value, not ext:lifecycle state.
      // Update the status field to the new state via updateRecord.
      const existingValues = selectedRecord.fieldValues.filter((fv) => fv.fieldId !== statusFieldId);
      updateRecord(repo, selectedRecord.instanceId, {
        fieldValues: [...existingValues, { fieldId: statusFieldId, value: toState }],
        groupValues: selectedRecord.groupValues ?? null,
      });
      loadContainerNav();
      persistWorkingCopy();
      // refreshValidation(); // called by B13
    } catch (e: unknown) {
      // silently ignore for now — errors will surface via validate()
    }
  }

  function handleCreateSuccessor() {
    if (!selectedRecord) return;
    if (statusFieldId === undefined) return;
    showSuccessorModal = false;
    formError = null;
    try {
      const baseValues = selectedRecord.fieldValues.filter((fv) => fv.fieldId !== statusFieldId);
      const result = createRecordSuccessor(repo, selectedRecord.instanceId, {
        relationType: "supersedes",
        fieldValues: [...baseValues, { fieldId: statusFieldId, value: "draft" }],
      });
      if (activeContainerId) {
        try {
          addContainerMember(repo, activeContainerId, result.record.instanceId);
        } catch (e: unknown) {
          console.error("addContainerMember failed for successor:", e);
          formError = e instanceof Error
            ? `Successor created, but container registration failed: ${e.message}`
            : "Successor created, but could not register in container.";
        }
      }
      loadContainerNav();
      selectedId = result.record.instanceId;
      persistWorkingCopy();
    } catch (e: unknown) {
      console.error("Failed to create successor:", e);
      loadContainerNav();
    }
  }

  function loadDecisionRelations(instanceId: string): void {
    try {
      const asSource = listRelations(repo, { source: instanceId });
      const asTarget = listRelations(repo, { target: instanceId });
      decisionRelations = [...asSource, ...asTarget];
    } catch (e: unknown) {
      console.error("loadDecisionRelations failed:", e);
      decisionRelations = [];
    }
  }

  function handleAddRelation(relationType: string, targetInstanceId: string): void {
    if (!selectedRecord) return;
    try {
      createRelation(repo, {
        relationType,
        sourceInstanceId: selectedRecord.instanceId,
        targetInstanceId,
      });
      showLinkPicker = false;
      loadDecisionRelations(selectedRecord.instanceId);
      refreshValidation();
      persistWorkingCopy();
    } catch (e: unknown) {
      console.error("createRelation failed:", e);
    }
  }

  function handleDeleteRelation(relationId: string): void {
    if (!selectedRecord) return;
    try {
      deleteRelation(repo, relationId);
      loadDecisionRelations(selectedRecord.instanceId);
      refreshValidation();
      persistWorkingCopy();
    } catch (e: unknown) {
      console.error("deleteRelation failed:", e);
    }
  }

  function handleUpdateTags(newTags: string[]): void {
    if (!selectedRecord) return;
    try {
      updateRecord(repo, selectedRecord.instanceId, {
        fieldValues: selectedRecord.fieldValues,
        groupValues: selectedRecord.groupValues ?? null,
        tags: newTags,
      });
      loadContainerNav();
      refreshValidation();
      persistWorkingCopy();
    } catch (e: unknown) {
      console.error("handleUpdateTags failed:", e);
    }
  }

  function handleAddTag(): void {
    const trimmed = tagInput.trim();
    if (trimmed && selectedRecord && !(selectedRecord.tags ?? []).includes(trimmed)) {
      handleUpdateTags([...(selectedRecord.tags ?? []), trimmed]);
    }
    tagInput = "";
  }

  $effect(() => {
    if (selectedRecord && activeContainer?.sectionTypeId === DECISION_TYPE_ID) {
      loadDecisionRelations(selectedRecord.instanceId);
    } else {
      decisionRelations = [];
    }
  });

  $effect(() => {
    void selectedId;
    tagInput = "";
    decisionExportError = null;
  });

  function handleExportDecision(format: "markdown" | "html"): void {
    decisionExportError = null;
    if (!selectedRecord) return;
    try {
      const content =
        format === "html"
          ? formatDecisionHtml(selectedRecord, fieldMetaMap)
          : formatDecisionMarkdown(selectedRecord, fieldMetaMap);
      const mimeType = format === "html" ? "text/html" : "text/markdown";
      const ext = format === "html" ? "html" : "md";
      const label = selectedRecord.displayLabel ?? selectedRecord.instanceId.slice(0, 8);
      const slug = label
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      const blob = new Blob([content], { type: mimeType });
      triggerDownload(blob, `${slug || "decision"}.${ext}`);
    } catch (e) {
      decisionExportError = `Export failed: ${e instanceof Error ? e.message : String(e)}`;
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
          {#each containers as container (container.containerId)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={(e) => {
                e.preventDefault();
                activeContainerId = container.containerId;
                selectedId = null;
                formMode = null;
                editingRecord = null;
                formError = null;
                showLinkPicker = false;
              }}
            >
              <NavItem
                label={container.title}
                id={container.icon}
                count={containerRecords[container.containerId]?.length ?? 0}
                active={activeContainerId === container.containerId}
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
          <span
            class="topbar__save-indicator"
            class:topbar__save-indicator--visible={saveIndicator === "saved"}
            role="status"
            aria-live="polite"
          >Saved</span>
          {#if onSave}
            <button
              class="topbar__export"
              data-testid="save-document"
              onclick={onSave}
              disabled={saving}
            >{saving ? "Saving…" : "Save"}</button>
          {/if}
          {#if saveMessage}
            <span
              class="topbar__save-message"
              data-testid="save-status"
              role="status"
              aria-live="polite"
            >{saveMessage}</span>
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
        {:else if selectedRecord && formMode === null && activeContainer?.sectionTypeId !== DECISION_TYPE_ID}
          <RecordReading
            record={selectedRecord}
            sectionLabel={activeContainer?.title ?? ""}
            onBack={() => { selectedId = null; }}
          />
        {:else}
          {#if activeContainer?.sectionTypeId === DECISION_TYPE_ID}
            <div class="section-heading">
              <h2 class="section-heading__title">{activeContainer?.title ?? ""}</h2>
              <span class="section-heading__count">{activeRecords.length}</span>
            </div>
            <DecisionLogView
              records={activeRecords}
              {repo}
              selectedId={selectedId}
              onSelect={(id) => { selectedId = id; }}
            />
          {:else}
            <div class="section-heading">
              <h2 class="section-heading__title">{activeContainer?.title ?? ""}</h2>
              <span class="section-heading__count">{activeRecords.length}</span>
            </div>

            {#if activeRecords.length === 0}
              <p class="empty-state">No {activeContainer?.title?.toLowerCase() ?? ""} records in this repository.</p>
            {:else}
              <div class="record-list">
                {#each activeRecords as record (record.instanceId)}
                  {@const title = record.displayLabel ?? record.instanceId}
                  {@const isSelected = selectedId === record.instanceId}

                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="record-list__item"
                    class:record-list__item--selected={isSelected}
                    onclick={() => {
                      selectedId = isSelected ? null : record.instanceId;
                      formError = null;
                    }}
                  >
                    <!-- Columns come from the DocumentView spec (ADR-010), not hardcoded
                         per type. Values are read positionally by the core-provided
                         fieldId; empty columns → title-only card. -->
                    <Card title={title} grid={activeColumns.length > 0}>
                      {#each activeColumns as col (col.fieldId)}
                        {@const value = record.fieldValues.find((fv) => fv.fieldId === col.fieldId)?.value}
                        <CardField
                          label={col.displayLabel}
                          empty={value === undefined || value === null || value === ""}
                        >
                          <FieldValueView fv={{ fieldId: col.fieldId, value }} />
                        </CardField>
                      {/each}
                    </Card>
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
        <InspectorSection title={(activeContainer?.title ?? "").replace(/s$/, "")} aside={selectedRecord.typeName}>
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
          {#if formError}
            <p class="inspector__error" role="alert">{formError}</p>
          {/if}
        </InspectorSection>
      {/if}
      {#if selectedRecord && formMode === null && activeContainer?.sectionTypeId === DECISION_TYPE_ID}
        <InspectorSection title="Decision Links" aside={decisionRelations.length === 0 ? "" : String(decisionRelations.length)}>
          {#if decisionRelations.length === 0}
            <p class="inspector__empty">No links yet.</p>
          {:else}
            <ul class="inspector__relations" data-testid="decision-relations-list">
              {#each decisionRelations as rel (rel.relationId)}
                {@const peerId = rel.sourceInstanceId === selectedRecord.instanceId ? rel.targetInstanceId : rel.sourceInstanceId}
                {@const peerLabel = activeRecords.find(r => r.instanceId === peerId)?.displayLabel ?? peerId.slice(0, 8) + "…"}
                {@const direction = rel.sourceInstanceId === selectedRecord.instanceId ? "→" : "←"}
                <li class="inspector__relation-item" data-testid="relation-item">
                  <span class="inspector__relation-type">{rel.relationType}</span>
                  <span class="inspector__relation-dir">{direction}</span>
                  <span class="inspector__relation-peer">{peerLabel}</span>
                  <button
                    class="inspector__relation-delete"
                    data-testid="delete-relation-btn"
                    aria-label="Delete relation"
                    onclick={() => handleDeleteRelation(rel.relationId)}
                  >✕</button>
                </li>
              {/each}
            </ul>
          {/if}
          <button
            class="inspector__btn"
            data-testid="add-relation-btn"
            onclick={() => { showLinkPicker = true; }}
          >Link to decision</button>
        </InspectorSection>
      {/if}

      {#if selectedRecord && formMode === null && activeContainer?.sectionTypeId === DECISION_TYPE_ID}
        <InspectorSection title="Tags" aside={selectedRecord.tags?.length ? String(selectedRecord.tags.length) : ""}>
          <div class="inspector__tags" data-testid="inspector-tags">
            {#each selectedRecord.tags ?? [] as tag (tag)}
              <TagChip label={tag} onRemove={() => handleUpdateTags((selectedRecord?.tags ?? []).filter((t) => t !== tag))} />
            {/each}
          </div>
          <div class="inspector__tag-add">
            <input
              type="text"
              class="inspector__tag-input"
              data-testid="tag-input"
              placeholder="Add tag…"
              bind:value={tagInput}
              onkeydown={(e) => { if (e.key === "Enter") handleAddTag(); }}
            />
            <button
              type="button"
              class="inspector__btn"
              data-testid="tag-add-btn"
              onclick={handleAddTag}
            >Add</button>
          </div>
        </InspectorSection>
      {/if}

      {#if selectedRecord && formMode === null && activeContainer?.sectionTypeId === DECISION_TYPE_ID}
        <InspectorSection title="Export decision">
          <div class="inspector__export-row" data-testid="decision-export-group">
            <button
              class="inspector__btn"
              data-testid="decision-export-md"
              onclick={() => handleExportDecision("markdown")}
            >MD</button>
            <button
              class="inspector__btn"
              data-testid="decision-export-html"
              onclick={() => handleExportDecision("html")}
            >HTML</button>
          </div>
          {#if decisionExportError}
            <p class="inspector__error" role="alert">{decisionExportError}</p>
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

{#if showLinkPicker && selectedRecord && activeContainer?.sectionTypeId === DECISION_TYPE_ID && formMode === null}
  <DecisionLinkPicker
    sourceInstanceId={selectedRecord.instanceId}
    sourceLabel={selectedRecord.displayLabel ?? selectedRecord.instanceId.slice(0, 8)}
    decisions={activeRecords.filter(r => r.instanceId !== selectedRecord.instanceId)}
    onLink={handleAddRelation}
    onCancel={() => { showLinkPicker = false; }}
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

  .topbar__export:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .topbar__save-message {
    font-size: 0.7rem;
    opacity: 0.75;
    max-width: 22rem;
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

  /* ---- Inspector decision relations ---- */
  .inspector__empty {
    font-size: 0.75rem;
    opacity: 0.5;
    margin: 0.25rem 0 0.5rem;
  }

  .inspector__relations {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .inspector__relation-item {
    display: flex;
    gap: 0.35rem;
    align-items: baseline;
    font-size: 0.75rem;
    padding: 0.2rem 0;
    border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  }

  .inspector__relation-type {
    font-style: italic;
    opacity: 0.65;
    min-width: 5rem;
  }

  .inspector__relation-dir {
    opacity: 0.45;
  }

  .inspector__relation-peer {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 8rem;
  }

  .inspector__relation-delete {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.7rem;
    opacity: 0.4;
    padding: 0 0.15rem;
    line-height: 1;
    color: #c00;
    flex-shrink: 0;
  }
  .inspector__relation-delete:hover { opacity: 1; }

  /* ---- Nav footer ---- */
  .nav__footer-stat {
    font-size: 0.6875rem;
    opacity: 0.4;
    padding: 0.5rem 0;
  }

  /* ---- Inspector tag editor ---- */
  .inspector__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 0.5rem;
    min-height: 1.5rem;
  }

  .inspector__tag-add {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    margin-top: 0.25rem;
  }

  .inspector__tag-input {
    flex: 1;
    font-size: 0.75rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--grey-3, #ccc);
    border-radius: 3px;
    background: var(--surface, #fff);
    color: var(--ink);
    min-width: 0;
  }

  .inspector__tag-input:focus {
    outline: 2px solid var(--accent, #0066cc);
    outline-offset: 1px;
  }

  .inspector__export-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .inspector__error {
    font-size: 0.7rem;
    color: var(--error, #cc0000);
    margin: 0.25rem 0 0;
  }

  /* ---- Autosave indicator ---- */
  @keyframes save-fade {
    0%   { opacity: 1; }
    60%  { opacity: 1; }
    100% { opacity: 0; }
  }

  .topbar__save-indicator {
    font-size: 0.75rem;
    opacity: 0;
    pointer-events: none;
    color: var(--accent, #0066cc);
  }

  .topbar__save-indicator--visible {
    animation: save-fade 2s ease-out forwards;
  }
</style>
