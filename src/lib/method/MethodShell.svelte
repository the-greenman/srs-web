<!--
  MethodShell — review and decide suggested method problems (srs-web#526). The board groups problems
  by domain and cluster (MethodBoard); the inspector shows one problem with its linked records,
  sources, edit form and comments. Decisions are container membership: Set aside and Restore move a
  problem between Suggestions and Set aside and create nothing else. Affirm forks it into Affirmed with
  its links (srs-rust#1354, one engine call); Edit and affirm then opens the form on the fork. Agents
  are guarded out of Affirmed and Set aside.
-->
<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { commentsAvailable } from "$lib/comments.js";
  import ActionBar from "$lib/components/ActionBar.svelte";
  import ActorChip from "$lib/components/ActorChip.svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import CardField from "$lib/components/CardField.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import InspectorTrigger from "$lib/components/InspectorTrigger.svelte";
  import Main from "$lib/components/Main.svelte";
  import MethodBoard from "$lib/components/MethodBoard.svelte";
  import type { MenuAction } from "$lib/components/menu-action.js";
  import Notice from "$lib/components/Notice.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import { BASE_GROUPS, commonActions } from "$lib/components/shell-actions.js";
  import { definitionToComposites, definitionToFields } from "$lib/editor/blueprint-fields.js";
  import SectionForm from "$lib/editor/SectionForm.svelte";
  import type { EditorShellProps } from "$lib/editors/registry.js";
  import InstanceNotes from "$lib/InstanceNotes.svelte";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import { getRecord, typeSchema, updateRecord } from "$lib/srs-client.js";
  import type { AgentWriteGuard, SchemaDefinition, UpdateRecordInput } from "$lib/srs-client.js";
  import type { CompositeFormDef } from "$lib/editor/blueprint-fields.js";
  import type { FieldFormDef } from "$lib/governance/types.js";
  import {
    type MethodModel,
    type ProblemStatus,
    affirmProblem,
    loadMethod,
    methodWriteGuard,
    moveToContainer,
    sourceHref,
  } from "./method-document.js";

  let {
    repo,
    repoName,
    documentTitle = repoName,
    onExport,
    onExportSrsj,
    onSave,
    saving = false,
    documentDirty = false,
    documentRevision = 0,
    onOpenAnother,
    onOpenAgents,
    onOpenPackages,
    readOnlyReason = null,
    onAgentWriteGuard,
  }: EditorShellProps = $props();

  const shell = new ShellState({ wideEnabled: true });
  const barActions = $derived(
    commonActions(
      {
        onsave: onSave ? () => void onSave() : undefined,
        onexport: onExport,
        onexportsrsj: onExportSrsj,
        onopenagents: onOpenAgents,
        onopenpackages: onOpenPackages,
        onopenanother: onOpenAnother,
      },
      { shell, saving }
    )
  );

  let model = $state<MethodModel | null>(null);
  let error = $state<string | null>(null);
  let filter = $state<ProblemStatus | "all">("suggested");
  let selectedId = $state<string | null>(null);
  let editing = $state<{ label: string; fields: FieldFormDef[]; composites: CompositeFormDef[] } | null>(null);
  let editError = $state<string | null>(null);
  let lastGuard: AgentWriteGuard | undefined;

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const selected = $derived(model?.problems.find((p) => p.id === selectedId) ?? null);
  const hasComments = $derived.by(() => {
    void documentRevision;
    try {
      return commentsAvailable(repo);
    } catch {
      return false;
    }
  });

  function reload(): void {
    try {
      model = loadMethod(repo);
      error = null;
    } catch (e) {
      error = msg(e);
    }
    const prev = lastGuard;
    lastGuard = (model && methodWriteGuard(model)) || undefined;
    onAgentWriteGuard?.(lastGuard ?? null, lastGuard ? undefined : prev);
  }
  onDestroy(() => onAgentWriteGuard?.(null, lastGuard));

  // Own writes and agent (MCP) writes both bump documentRevision; this is the one reload.
  $effect(() => {
    documentRevision;
    untrack(reload);
  });

  function open(id: string): void {
    selectedId = id;
    editing = null;
    editError = null;
    if (shell.inspectorDrawer) shell.inspectorOpen = true;
  }

  function run(fn: () => void): void {
    try {
      fn();
      error = null;
    } catch (e) {
      error = msg(e);
    }
  }

  /** Affirm the selected problem and select its fork; `edit` then opens the form on the fork. */
  function affirm(m: MethodModel, id: string, edit: boolean): void {
    try {
      selectedId = affirmProblem(repo, m, id);
      error = null;
    } catch (e) {
      error = msg(e);
      return;
    }
    if (edit) beginEdit(selectedId);
  }

  function beginEdit(id = selected?.id): void {
    const record = id && getRecord(repo, id);
    if (!record) return;
    editError = null;
    try {
      const definition = typeSchema(repo, record.typeId, record.typeVersion).schema as unknown as SchemaDefinition;
      editing = { label: "problem", fields: definitionToFields(definition), composites: definitionToComposites(definition) };
    } catch (e) {
      editError = msg(e);
    }
  }

  function saveEdit(input: UpdateRecordInput): void {
    if (!selected) return;
    try {
      updateRecord(repo, selected.id, input);
      editing = null;
      editError = null;
    } catch (e) {
      editError = msg(e);
    }
  }

  const menuActions = $derived.by((): MenuAction[] => {
    if (!selected || !model) return [];
    const m = model;
    const id = selected.id;
    const canAffirm = !!m.containers.affirmed;
    const why = "This repository has no Affirmed container";
    const affirmActs: MenuAction[] = [
      { id: "affirm", label: "Affirm", enabled: canAffirm, reason: why, run: () => affirm(m, id, false) },
      { id: "edit-affirm", label: "Edit and affirm", enabled: canAffirm, reason: why, run: () => affirm(m, id, true) },
    ];
    const edit: MenuAction = { id: "edit", label: "Edit", enabled: true, run: () => beginEdit() };
    // Order is the recommendation: the first is the primary button (ActionBar).
    if (selected.status === "affirmed") return [edit];
    if (selected.status === "set-aside")
      return [{ id: "restore", label: "Restore", enabled: !!m.containers.suggestions, reason: "No Suggestions container", run: () => run(() => moveToContainer(repo, m, id, "suggestions")) }, ...affirmActs, edit];
    return [...affirmActs, { id: "set-aside", label: "Set aside", enabled: !!m.containers.setAside, reason: "This repository has no Set aside container", run: () => run(() => moveToContainer(repo, m, id, "setAside")) }, edit];
  });
</script>

<div data-testid="method-shell">
  <AppShell {shell} inspectorLabel="Problem">
    {#snippet main()}
      <Main>
        {#snippet bar()}
          <Toolbar title={documentTitle} actions={barActions} groups={BASE_GROUPS}>
            {#snippet status()}
              {#if documentDirty}<span data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
            {/snippet}
            {#snippet trail()}<InspectorTrigger />{/snippet}
          </Toolbar>
        {/snippet}
        {#if !onSave && readOnlyReason}<Notice kind="info" testid="readonly-reason">{readOnlyReason}</Notice>{/if}
        {#if error}<Notice kind="error" testid="method-error">{error}</Notice>{/if}
        <div class="workspace">
          {#if model}
            <MethodBoard domains={model.domains} bind:filter {selectedId} onopen={open} />
          {/if}
        </div>
      </Main>
    {/snippet}

    {#snippet inspector()}
      <Inspector label="Problem">
        {#if selected}
          {#if editing}
            <SectionForm
              label={editing.label}
              fields={editing.fields}
              composites={editing.composites}
              record={getRecord(repo, selected.id)}
              onSave={saveEdit}
              onCancel={() => { editing = null; editError = null; }}
              saveError={editError}
            />
          {:else}
            <Panel title={selected.problemId ? `${selected.problemId} ${selected.title}` : selected.title} collapsible={false} class="inspector__section">
              <ActionBar actions={menuActions} visible={3} label={selected.title} testid="problem-actions" />
              <div data-testid="method-detail">
                {#if selected.statement}<p class="method-detail__statement">{selected.statement}</p>{/if}
                {#if editError}<Notice kind="error">{editError}</Notice>{/if}
                <CardField label={selected.status === "affirmed" ? "Affirmed by" : "Suggested by"}><ActorChip actor={selected.createdBy} /></CardField>
                <CardField label="Kind" empty={!selected.kind}>{selected.kind}</CardField>
                <CardField label="Held by" empty={selected.personas.length === 0}>{selected.personas.map((p) => p.label).join(", ")}</CardField>
                <CardField label="Trade-off" empty={!selected.side}>
                  {#if selected.side}{selected.side.tradeOff ? `${selected.side.tradeOff.label}, side ` : "Side "}{selected.side.label}{selected.imbalance ? `: ${selected.imbalance.replaceAll("-", " ")}` : ""}{/if}
                </CardField>
                <CardField label="Cluster" empty={!selected.cluster}>{selected.cluster?.label}</CardField>
                <CardField label="Sources" empty={selected.sources.length === 0}>
                  <ul class="method-detail__links" data-testid="method-sources">
                    {#each selected.sources as ref (ref)}
                      {@const href = sourceHref(ref)}
                      <li>{#if href}<a {href} target="_blank" rel="noopener noreferrer">{ref}</a>{:else}{ref}{/if}</li>
                    {/each}
                  </ul>
                </CardField>
              </div>
            </Panel>
            {#if hasComments}
              <Panel title="Discussion" collapsible={false} class="inspector__section">
                {#key selected.id}<InstanceNotes {repo} instanceId={selected.id} revision={documentRevision} />{/key}
              </Panel>
            {/if}
          {/if}
        {:else}
          <p class="t-muted">Open a problem to read it and decide.</p>
        {/if}
      </Inspector>
    {/snippet}
  </AppShell>
</div>
