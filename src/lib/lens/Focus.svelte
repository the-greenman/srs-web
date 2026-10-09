<!--
  Focus — pane 2: one thing, whole. Three kinds from the lens: reading (fields in typeSchema order with
  the schema's labels and help; long markdown collapsed to ~6 lines; list strings as chips; inline
  composites as a table or list; urls as links; no "required" marker, that belongs to the form), document (the rendered composition of the record's
  container in a PreviewPane) and form (SectionForm). An Edit toggle switches reading ↔ form.
  Presentation only: the record and schema arrive loaded (lens-data.ts). Wraps .lens-focus (lens.css).
-->
<script lang="ts">
  import ActorChip from "$lib/components/ActorChip.svelte";
  import Button from "$lib/components/Button.svelte";
  import CardField from "$lib/components/CardField.svelte";
  import MarkdownView from "$lib/components/MarkdownView.svelte";
  import PreviewPane from "$lib/components/PreviewPane.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import TagChip from "$lib/components/TagChip.svelte";
  import SectionForm from "$lib/editor/SectionForm.svelte";
  import type { UpdateRecordInput } from "$lib/srs-client.js";
  import type { Status } from "$lib/types";
  import type { FocusData } from "./lens-data.js";

  let {
    data,
    onEdit,
    onSave,
    saving = false,
    saveError = null,
  }: {
    data: FocusData;
    /** Toggle reading ↔ form; absent = read-only. */
    onEdit?: () => void;
    onSave?: (input: UpdateRecordInput) => void;
    saving?: boolean;
    saveError?: string | null;
  } = $props();

  /** Field names whose long markdown is expanded. */
  let open = $state(new Set<string>());
  // ponytail: "long" = over 400 characters or 6 lines; a measured line count needs a layout pass.
  const long = (s: string) => s.length > 400 || s.split("\n").length > 6;
  const toggle = (name: string) => {
    const next = new Set(open);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    open = next;
  };
  const isTable = (entries: Record<string, unknown>[]) =>
    entries.some((e) => Array.isArray(e.columns) && Array.isArray(e.rows));
  const str = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const http = (v: unknown) => typeof v === "string" && /^https?:\/\//.test(v);
</script>

<div class="lens-focus" data-testid="lens-focus" data-kind={data.kind}>
  {#if data.kind === "none"}
    <p class="lens-empty">Select something to read it here.</p>
  {:else if data.kind === "note"}
    <h1 class="lens-focus__title">{data.label}</h1>
    <p class="lens-empty">A note; its sections are not shown in the POC.</p>
  {:else if data.kind === "document"}
    <header class="lens-focus__head">
      <p class="lens-focus__eyebrow">Document</p>
      <h1 class="lens-focus__title">{data.title}</h1>
    </header>
    <div class="lens-focus__preview"><PreviewPane html={data.html} /></div>
  {:else if data.kind === "form" && onSave}
    <SectionForm
      label={data.record.typeName ?? "record"}
      fields={data.fields}
      composites={data.composites}
      record={data.record}
      {onSave}
      onCancel={() => onEdit?.()}
      {saving}
      {saveError}
    />
  {:else}
    {@const r = data.record}
    <header class="lens-focus__head">
      <p class="lens-focus__eyebrow">
        {r.typeName?.replaceAll(/[-_]/g, " ") ?? "record"}
        {#if r.lifecycle}<Tag status={r.lifecycle as Status} />{/if}
        {#if r.createdBy}<ActorChip actor={r.createdBy} />{/if}
      </p>
      <h1 class="lens-focus__title">{r.displayLabel || r.instanceId.slice(0, 8)}</h1>
      {#if onEdit}<Button size="sm" data-testid="lens-edit" onclick={onEdit}>Edit</Button>{/if}
    </header>
    {#if data.fields.length === 0 && data.composites.length === 0}
      {#each Object.entries(r.fieldValues) as [name, value] (name)}
        <CardField label={name}>{str(value)}</CardField>
      {/each}
    {/if}
    {#each data.fields as f (f.name)}
      {@const v = r.fieldValues[f.name]}
      <CardField
        label={f.label}
        description={f.description}
        instructions={f.instructions ?? f.aiGuidance}
        id={`lens-f-${f.name}`}
        empty={v == null || v === "" || (Array.isArray(v) && v.length === 0)}
      >
        {#if Array.isArray(v)}
          <span class="lens-chips">
            {#each v as x, i (i)}
              {#if http(x)}<a href={String(x)} target="_blank" rel="noopener noreferrer">{String(x)}</a>{:else}<TagChip label={str(x)} />{/if}
            {/each}
          </span>
        {:else if f.valueType === "url" && http(v)}
          <a href={String(v)} target="_blank" rel="noopener noreferrer">{String(v)}</a>
        {:else if f.valueType === "markdown"}
          {@const text = str(v)}
          <div class="lens-md" class:lens-md--clamped={long(text) && !open.has(f.name)}>
            <MarkdownView value={text} />
          </div>
          {#if long(text)}
            <button type="button" class="lens-more-link" aria-expanded={open.has(f.name)} onclick={() => toggle(f.name)}>
              {open.has(f.name) ? "less" : "more"}
            </button>
          {/if}
        {:else}
          <span class="lens-text">{str(v)}</span>
        {/if}
      </CardField>
    {/each}
    {#each data.composites as c (c.name)}
      {@const entries = (Array.isArray(r.fieldValues[c.name]) ? r.fieldValues[c.name] : []) as Record<string, unknown>[]}
      <CardField label={c.label} empty={entries.length === 0}>
        {#if isTable(entries)}
          {#each entries as e, i (i)}
            <table class="log-table lens-composite-table">
              <thead><tr>{#each (e.columns as unknown[]) ?? [] as col, ci (ci)}<th>{str(col)}</th>{/each}</tr></thead>
              <tbody>
                {#each (e.rows as { cells?: unknown[] }[]) ?? [] as row, ri (ri)}
                  <tr>{#each row.cells ?? [] as cellValue, ci (ci)}<td>{str(cellValue)}</td>{/each}</tr>
                {/each}
              </tbody>
            </table>
          {/each}
        {:else}
          <ol class="lens-composite">
            {#each entries as e, i (i)}
              <li>
                {#each c.fields as sf (sf.name)}
                  {#if e[sf.name] != null && e[sf.name] !== ""}
                    <span class="lens-composite__field"><small>{sf.label}</small> {str(e[sf.name])}</span>
                  {/if}
                {/each}
              </li>
            {/each}
          </ol>
        {/if}
      </CardField>
    {/each}
  {/if}
</div>
