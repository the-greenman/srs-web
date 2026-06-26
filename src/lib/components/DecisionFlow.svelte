<!--
  DecisionFlow.svelte — Opinionated decision-making flow.

  Two modes:
    Quick Capture  (§8.3): title + decision_statement + rationale + status
    Full Deliberation (§8.4): guided wizard over all non-header fields from schema

  Decision Summary Card is shown once both decision_statement and rationale
  are filled in either mode.

  ADR-001: zero SRS semantics in TypeScript. Field metadata (labels, IDs,
  aiGuidance) comes from the TypeFormDef passed as `schema` prop — no UUIDs
  hardcoded in this component.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import type { CreateRecordInput } from "$lib/srs-client.js";
  import type { TypeFormDef, FieldFormDef } from "$lib/governance/types.js";
  import Field from "$lib/components/Field.svelte";
  import Input from "$lib/components/Input.svelte";
  import Textarea from "$lib/components/Textarea.svelte";
  import Select from "$lib/components/Select.svelte";
  import SaveBar from "$lib/components/SaveBar.svelte";

  let {
    schema,
    onSave,
    onCancel,
    saving = false,
    saveError = null,
  }: {
    schema: TypeFormDef;
    onSave: (input: CreateRecordInput) => void;
    onCancel: () => void;
    saving?: boolean;
    saveError?: string | null;
  } = $props();

  // ---------------------------------------------------------------------------
  // Field role assignments (presentation config — snake_case property names)
  // These identify well-known fields by their stable package name, not by UUID.
  // ---------------------------------------------------------------------------

  const HEADER_NAMES = ["title", "status"];

  // Derived field lookups
  const titleField: FieldFormDef | undefined = $derived(schema.fields.find(f => f.name === "title"));
  const statusField: FieldFormDef | undefined = $derived(schema.fields.find(f => f.name === "status"));
  const decisionStatementField: FieldFormDef | undefined = $derived(schema.fields.find(f => f.name === "decision_statement"));
  const rationaleField: FieldFormDef | undefined = $derived(schema.fields.find(f => f.name === "rationale"));
  // Full Deliberation stages: all fields not in the persistent header, in schema order
  const deliberationStages: FieldFormDef[] = $derived(
    schema.fields.filter(f => !HEADER_NAMES.includes(f.name))
  );

  // ---------------------------------------------------------------------------
  // Mode & stage state
  // ---------------------------------------------------------------------------

  let mode = $state<"choose" | "quick" | "deliberate">("choose");
  let stage = $state(0); // 0-indexed, for deliberate mode

  // ---------------------------------------------------------------------------
  // Field values
  // ---------------------------------------------------------------------------

  let title = $state("");
  let status = $state("draft");
  let quickDecisionStatement = $state("");
  let quickRationale = $state("");

  // Stage field values keyed by field name (snake_case). Pre-initialized to ""
  // for all schema fields so bind:value never receives undefined (Svelte 5 rejects
  // bind:value={undefined} when the child prop has a fallback default).
  // untrack() is intentional: we want a one-time snapshot of the schema at mount,
  // not reactive tracking (schema doesn't change during a component instance's life).
  let stageValues = $state<Record<string, string>>(
    untrack(() => Object.fromEntries(schema.fields.map(f => [f.name, ""])))
  );

  // ---------------------------------------------------------------------------
  // Derived: summary card visibility
  // ---------------------------------------------------------------------------

  let summaryDecisionStatement = $derived(
    mode === "quick"
      ? quickDecisionStatement
      : stageValues["decision_statement"] ?? ""
  );

  let summaryRationale = $derived(
    mode === "quick" ? quickRationale : stageValues["rationale"] ?? ""
  );

  let showSummary = $derived(
    summaryDecisionStatement.trim() !== "" && summaryRationale.trim() !== ""
  );

  // ---------------------------------------------------------------------------
  // Copy-to-clipboard helper
  // ---------------------------------------------------------------------------

  let copyDone = $state(false);

  async function copyMarkdown() {
    const md = `## Decision\n\n${summaryDecisionStatement}\n\n## Rationale\n\n${summaryRationale}`;
    try {
      await navigator.clipboard.writeText(md);
      copyDone = true;
      setTimeout(() => {
        copyDone = false;
      }, 2000);
    } catch {
      // clipboard not available in some test environments — silently skip
    }
  }

  // ---------------------------------------------------------------------------
  // Build CreateRecordInput and call onSave
  // ---------------------------------------------------------------------------

  function buildInput(): CreateRecordInput {
    const fvs: { fieldId: string; value: string }[] = [];

    if (titleField && title.trim() !== "") {
      fvs.push({ fieldId: titleField.fieldId, value: title });
    }
    if (statusField) {
      fvs.push({ fieldId: statusField.fieldId, value: status });
    }

    if (mode === "quick") {
      if (decisionStatementField && quickDecisionStatement.trim() !== "") {
        fvs.push({ fieldId: decisionStatementField.fieldId, value: quickDecisionStatement });
      }
      if (rationaleField && quickRationale.trim() !== "") {
        fvs.push({ fieldId: rationaleField.fieldId, value: quickRationale });
      }
    } else {
      for (const s of deliberationStages) {
        const val = stageValues[s.name];
        if (val && val.trim() !== "") {
          fvs.push({ fieldId: s.fieldId, value: val });
        }
      }
    }

    return { fieldValues: fvs };
  }

  function handleQuickSubmit(e: Event) {
    e.preventDefault();
    onSave(buildInput());
  }

  function handleDeliberateSubmit(e: Event) {
    e.preventDefault();
    onSave(buildInput());
  }

  // ---------------------------------------------------------------------------
  // Stage navigation
  // ---------------------------------------------------------------------------

  function nextStage() {
    if (stage < deliberationStages.length - 1) stage += 1;
  }

  function prevStage() {
    if (stage > 0) stage -= 1;
  }

  let currentStage = $derived(deliberationStages[stage]);
  let isLastStage = $derived(stage === deliberationStages.length - 1);
</script>

<!-- =========================================================================
     Mode chooser
     ========================================================================= -->
{#if mode === "choose"}
  <div class="decision-flow">
    <h2 class="decision-flow__title">New Decision</h2>
    <div class="decision-flow__modes">
      <div class="decision-flow__mode-card">
        <button
          class="decision-flow__mode-btn"
          onclick={() => { mode = "quick"; }}
        >Quick Capture</button>
        <p class="decision-flow__mode-desc">Record a decision that's already clear</p>
      </div>
      <div class="decision-flow__mode-card">
        <button
          class="decision-flow__mode-btn"
          onclick={() => { mode = "deliberate"; stage = 0; }}
        >Full Deliberation</button>
        <p class="decision-flow__mode-desc">Walk through the deliberation process step by step</p>
      </div>
    </div>
    <div class="decision-flow__cancel-row">
      <button class="btn btn--secondary" onclick={onCancel}>Cancel</button>
    </div>
  </div>

<!-- =========================================================================
     Quick Capture
     ========================================================================= -->
{:else if mode === "quick"}
  <div class="decision-flow">
    <h2 class="decision-flow__title">New Decision — Quick Capture</h2>
    <form onsubmit={handleQuickSubmit} class="decision-flow__form">
      {#if titleField}
        <Field label={titleField.label} required id="qc-title" help={titleField.aiGuidance}>
          <Input id="qc-title" bind:value={title} disabled={saving} />
        </Field>
      {/if}

      {#if decisionStatementField}
        <Field
          label={decisionStatementField.label}
          required
          id="qc-statement"
          help={decisionStatementField.aiGuidance}
        >
          <Textarea
            id="qc-statement"
            bind:value={quickDecisionStatement}
            disabled={saving}
            rows={4}
          />
        </Field>
      {/if}

      {#if rationaleField}
        <Field
          label={rationaleField.label}
          id="qc-rationale"
          help={rationaleField.aiGuidance}
        >
          <Textarea
            id="qc-rationale"
            bind:value={quickRationale}
            disabled={saving}
            rows={4}
          />
        </Field>
      {/if}

      {#if statusField}
        <Field label={statusField.label} required id="qc-status">
          <Select
            id="qc-status"
            bind:value={status}
            options={statusField.options ?? []}
            disabled={saving}
          />
        </Field>
      {/if}

      {#if showSummary}
        <div class="decision-summary">
          <div class="decision-summary__header">
            <span class="decision-summary__label">Decision Summary</span>
            <button
              type="button"
              class="decision-summary__copy"
              onclick={copyMarkdown}
            >{copyDone ? "Copied!" : "Copy as Markdown"}</button>
          </div>
          <div class="decision-summary__section">
            <p class="decision-summary__heading">Decision</p>
            <p class="decision-summary__body">{summaryDecisionStatement}</p>
          </div>
          <div class="decision-summary__section">
            <p class="decision-summary__heading">Rationale</p>
            <p class="decision-summary__body">{summaryRationale}</p>
          </div>
        </div>
      {/if}

      {#if saveError}
        <p class="form-error" role="alert">{saveError}</p>
      {/if}

      <SaveBar>
        {#snippet children()}
          <button
            type="button"
            class="btn btn--secondary"
            onclick={onCancel}
            disabled={saving}
          >Cancel</button>
          <button
            type="submit"
            class="btn btn--primary"
            disabled={saving}
          >{saving ? "Saving…" : "Save"}</button>
        {/snippet}
      </SaveBar>
    </form>
  </div>

<!-- =========================================================================
     Full Deliberation
     ========================================================================= -->
{:else}
  <div class="decision-flow">
    <h2 class="decision-flow__title">New Decision — Full Deliberation</h2>

    <!-- Persistent header: title + status on every stage -->
    <div class="decision-flow__persistent">
      {#if titleField}
        <Field label={titleField.label} required id="del-title">
          <Input id="del-title" bind:value={title} disabled={saving} />
        </Field>
      {/if}
      {#if statusField}
        <Field label={statusField.label} required id="del-status">
          <Select
            id="del-status"
            bind:value={status}
            options={statusField.options ?? []}
            disabled={saving}
          />
        </Field>
      {/if}
    </div>

    <!-- Stage progress -->
    {#if currentStage}
      <div class="decision-flow__progress">
        <div class="decision-flow__progress-bar">
          <div
            class="decision-flow__progress-fill"
            style="width: {((stage + 1) / deliberationStages.length) * 100}%"
          ></div>
        </div>
        <span class="decision-flow__progress-label">
          Stage {stage + 1} of {deliberationStages.length}: {currentStage.label}
        </span>
      </div>

      <!-- Current stage form -->
      <form onsubmit={handleDeliberateSubmit} class="decision-flow__form">
        <Field
          label={currentStage.label}
          id="del-stage-field"
          help={currentStage.aiGuidance}
        >
          {#if currentStage.valueType === "text"}
            <Textarea
              id="del-stage-field"
              bind:value={stageValues[currentStage.name]}
              disabled={saving}
              rows={5}
            />
          {:else}
            <Input
              id="del-stage-field"
              bind:value={stageValues[currentStage.name]}
              disabled={saving}
            />
          {/if}
        </Field>

        {#if showSummary}
          <div class="decision-summary">
            <div class="decision-summary__header">
              <span class="decision-summary__label">Decision Summary</span>
              <button
                type="button"
                class="decision-summary__copy"
                onclick={copyMarkdown}
              >{copyDone ? "Copied!" : "Copy as Markdown"}</button>
            </div>
            <div class="decision-summary__section">
              <p class="decision-summary__heading">Decision</p>
              <p class="decision-summary__body">{summaryDecisionStatement}</p>
            </div>
            <div class="decision-summary__section">
              <p class="decision-summary__heading">Rationale</p>
              <p class="decision-summary__body">{summaryRationale}</p>
            </div>
          </div>
        {/if}

        {#if saveError}
          <p class="form-error" role="alert">{saveError}</p>
        {/if}

        <SaveBar>
          {#snippet children()}
            <button
              type="button"
              class="btn btn--secondary"
              onclick={onCancel}
              disabled={saving}
            >Cancel</button>
            {#if stage > 0}
              <button
                type="button"
                class="btn btn--secondary"
                onclick={prevStage}
                disabled={saving}
              >Back</button>
            {/if}
            {#if !isLastStage}
              <button
                type="button"
                class="btn btn--primary"
                onclick={nextStage}
                disabled={saving}
              >Next</button>
            {:else}
              <button
                type="submit"
                class="btn btn--primary"
                disabled={saving}
              >{saving ? "Saving…" : "Save"}</button>
            {/if}
          {/snippet}
        </SaveBar>
      </form>
    {/if}
  </div>
{/if}

<style>
  .decision-flow {
    padding: 1.5rem;
    max-width: 42rem;
  }

  .decision-flow__title {
    margin: 0 0 1.5rem;
    font-size: 1.125rem;
    font-weight: 600;
  }

  /* ---- Mode chooser ---- */
  .decision-flow__modes {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .decision-flow__mode-card {
    flex: 1;
    min-width: 12rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: 4px;
  }

  .decision-flow__mode-btn {
    font-size: 0.9375rem;
    font-weight: 600;
    background: none;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    text-align: left;
  }

  .decision-flow__mode-btn:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  .decision-flow__mode-desc {
    margin: 0;
    font-size: 0.8125rem;
    opacity: 0.65;
    line-height: 1.4;
  }

  .decision-flow__cancel-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  /* ---- Persistent header (deliberate mode) ---- */
  .decision-flow__persistent {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1rem;
    align-items: start;
    margin-bottom: 1.25rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  }

  /* ---- Progress bar ---- */
  .decision-flow__progress {
    margin-bottom: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .decision-flow__progress-bar {
    height: 4px;
    background: color-mix(in srgb, currentColor 12%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }

  .decision-flow__progress-fill {
    height: 100%;
    background: currentColor;
    border-radius: 2px;
    transition: width 0.2s ease;
  }

  .decision-flow__progress-label {
    font-size: 0.8125rem;
    opacity: 0.6;
    font-weight: 500;
  }

  /* ---- Form ---- */
  .decision-flow__form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* ---- Decision Summary Card ---- */
  .decision-summary {
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: 4px;
    padding: 1rem;
    background: color-mix(in srgb, currentColor 3%, transparent);
  }

  .decision-summary__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .decision-summary__label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.55;
  }

  .decision-summary__copy {
    font-size: 0.75rem;
    background: none;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 2px;
    padding: 0.15rem 0.45rem;
    cursor: pointer;
    opacity: 0.7;
  }

  .decision-summary__copy:hover {
    opacity: 1;
  }

  .decision-summary__section {
    margin-bottom: 0.75rem;
  }

  .decision-summary__section:last-child {
    margin-bottom: 0;
  }

  .decision-summary__heading {
    margin: 0 0 0.25rem;
    font-size: 0.8125rem;
    font-weight: 600;
    opacity: 0.75;
  }

  .decision-summary__body {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ---- Shared button styles ---- */
  .btn {
    font-size: 0.8125rem;
    border-radius: 3px;
    padding: 0.3rem 0.75rem;
    cursor: pointer;
    border: 1px solid currentColor;
    background: none;
  }

  .btn--primary {
    font-weight: 600;
  }

  .btn--primary:hover {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  .btn--secondary {
    opacity: 0.65;
  }

  .btn--secondary:hover {
    opacity: 1;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ---- Error ---- */
  .form-error {
    font-size: 0.8125rem;
    color: #c00;
    margin: 0;
  }
</style>
