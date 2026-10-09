<!--
  Focus — pane 2: what the centre IS, chosen by the lens and switchable in its header (Read | Document |
  As published when a composition applies, plus Edit). read: one record as prose — the title as the heading, the main body (first long markdown
  field) with no label, other long fields under small muted labels, short values as one meta line of
  chips, inline composites as tables; empty fields hidden, never aiGuidance or "required". blocks: the
  Collection (or a section's container) as one document, each record a read block, the anchoring
  record as the heading block; the selected one is highlighted and scrolled into view, clicking a block
  selects it. document ("As published"): a composition rendered to markdown, then through the core
  renderMarkdown; read-only. Edit opens SectionForm in place: it replaces the record (read) or only the
  selected block (blocks). Presentation only: data arrives loaded (lens-data.ts). Wraps .lens-focus.
-->
<script lang="ts">
  import ActorChip from "$lib/components/ActorChip.svelte";
  import Button from "$lib/components/Button.svelte";
  import MarkdownView from "$lib/components/MarkdownView.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import TagChip from "$lib/components/TagChip.svelte";
  import SectionForm from "$lib/editor/SectionForm.svelte";
  import type { UpdateRecordInput } from "$lib/srs-client.js";
  import type { Status } from "$lib/types";
  import type { FocusData, ReadData } from "./lens-data.js";

  let {
    data,
    mode = "read",
    editing = false,
    selectedId = null,
    onMode,
    published = false,
    onEdit,
    onSelect,
    onSave,
    saving = false,
    saveError = null,
  }: {
    data: FocusData;
    mode?: "read" | "document" | "published";
    editing?: boolean;
    selectedId?: string | null;
    /** Absent = no mode control. */
    onMode?: (mode: "read" | "document" | "published") => void;
    /** Offer "As published" (a composition applies). */
    published?: boolean;
    /** Toggle the editor for the selected record; absent = read-only. */
    onEdit?: () => void;
    /** A document block was clicked. */
    onSelect?: (id: string) => void;
    onSave?: (input: UpdateRecordInput) => void;
    saving?: boolean;
    saveError?: string | null;
  } = $props();

  const str = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const http = (v: unknown) => typeof v === "string" && /^https?:\/\//.test(v);
  const has = (v: unknown) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);

  /** A record split into what prose shows: body, secondary long fields, meta chips, composites. */
  function view(b: ReadData) {
    const r = b.record;
    if (!r) return null;
    const vals = r.fieldValues;
    const fields =
      b.fields.length > 0
        ? b.fields
        : Object.keys(vals).map((name) => ({ name, label: name, valueType: "string" as const }));
    const shown = fields.filter((f) => has(vals[f.name]) && vals[f.name] !== r.displayLabel);
    // ponytail: "long" = a markdown field, a text field over 40 characters, any other value over 80, or a
    // line break (a short plain-text id like "C-08" stays a chip); a length heuristic, not a schema fact.
    const isLong = (f: (typeof shown)[number]) => {
      const v = vals[f.name];
      return !Array.isArray(v) && (f.valueType === "markdown" || str(v).length > (f.valueType === "text" ? 40 : 80) || str(v).includes("\n"));
    };
    const long = shown.filter(isLong);
    const body = long.find((f) => f.valueType === "markdown") ?? long[0];
    const meta = shown
      .filter((f) => !isLong(f))
      .flatMap((f) =>
        (Array.isArray(vals[f.name]) ? (vals[f.name] as unknown[]) : [vals[f.name]])
          .filter((x) => x != null && typeof x !== "object")
          .map((x) => ({ label: f.label, value: String(x) }))
      );
    const composites = b.composites
      .map((c) => ({ ...c, entries: (Array.isArray(vals[c.name]) ? vals[c.name] : []) as Record<string, unknown>[] }))
      .filter((c) => c.entries.length > 0);
    return {
      record: r,
      body: body ? str(vals[body.name]) : "",
      secondary: long.filter((f) => f !== body).map((f) => ({ label: f.label, value: str(vals[f.name]) })),
      meta,
      composites,
    };
  }
  const isTable = (entries: Record<string, unknown>[]) =>
    entries.some((e) => Array.isArray(e.columns) && Array.isArray(e.rows));

  let root = $state<HTMLDivElement>();
  /** The block the reader clicked: already in view, so no scroll. */
  let clicked: string | null = null;
  $effect(() => {
    const id = selectedId;
    if (data.kind !== "blocks" || !id || !root) return;
    if (id === clicked) return;
    root.querySelector(`[data-instance-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" });
  });
  function clickBlock(id: string): void {
    if (id === selectedId) return;
    clicked = id;
    onSelect?.(id);
  }
</script>

{#snippet form(b: ReadData)}
  {#if b.record && onSave}
    <SectionForm
      label={b.record.typeName ?? "record"}
      fields={b.fields}
      composites={b.composites}
      record={b.record}
      {onSave}
      onCancel={() => onEdit?.()}
      {saving}
      {saveError}
    />
  {/if}
{/snippet}

{#snippet read(b: ReadData, top: boolean)}
  {@const v = view(b)}
  <svelte:element this={top ? "h1" : "h2"} class="lens-read__title">{b.label}</svelte:element>
  {#if !v}
    <p class="lens-empty">A note; its text is not shown here.</p>
  {:else}
    {#if v.meta.length > 0 || v.record.lifecycle || v.record.createdBy}
      <p class="lens-read__meta" data-testid="lens-read-meta">
        {#if v.record.lifecycle}<Tag status={v.record.lifecycle as Status} />{/if}
        {#if v.record.createdBy}<ActorChip actor={v.record.createdBy} />{/if}
        {#each v.meta as m, i (i)}
          {#if http(m.value)}
            <a href={m.value} target="_blank" rel="noopener noreferrer" title={m.label}>{m.value}</a>
          {:else}
            <span title={m.label}><TagChip label={m.value} /></span>
          {/if}
        {/each}
      </p>
    {/if}
    {#if v.body}<MarkdownView class="lens-read__body" value={v.body} />{/if}
    {#each v.secondary as s, i (i)}
      <section class="lens-read__more">
        <h3 class="lens-read__label">{s.label}</h3>
        <MarkdownView value={s.value} />
      </section>
    {/each}
    {#each v.composites as c (c.name)}
      <section class="lens-read__more">
        <h3 class="lens-read__label">{c.label}</h3>
        {#if isTable(c.entries)}
          {#each c.entries as e, i (i)}
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
          <table class="log-table lens-composite-table">
            <thead><tr>{#each c.fields as sf (sf.name)}<th>{sf.label}</th>{/each}</tr></thead>
            <tbody>
              {#each c.entries as e, i (i)}
                <tr>{#each c.fields as sf (sf.name)}<td>{str(e[sf.name])}</td>{/each}</tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/each}
  {/if}
{/snippet}

<div class="lens-focus" data-testid="lens-focus" data-kind={data.kind} bind:this={root}>
  {#if onMode && data.kind !== "none"}
    <div class="lens-focus__bar">
      <div class="lens-seg" role="group" aria-label="Show as">
        <button type="button" aria-pressed={mode === "read"} data-testid="lens-mode-read" onclick={() => onMode("read")}>Read</button>
        <button type="button" aria-pressed={mode === "document"} data-testid="lens-mode-document" onclick={() => onMode("document")}>Document</button>
        {#if published}
          <button type="button" aria-pressed={mode === "published"} data-testid="lens-mode-published" onclick={() => onMode("published")}>As published</button>
        {/if}
      </div>
      {#if onEdit}
        <Button size="sm" data-testid="lens-edit" onclick={onEdit}>{editing ? "Close editor" : "Edit"}</Button>
      {/if}
    </div>
  {/if}
  {#if data.kind === "none"}
    <p class="lens-empty">Select something to read it here.</p>
  {:else if data.kind === "document"}
    <MarkdownView class="lens-doc" value={data.markdown} />
  {:else if data.kind === "blocks"}
    {#if !data.head}<h1 class="lens-read__title lens-doc__title">{data.title}</h1>{/if}
    {#each data.head ? [data.head, ...data.blocks] : data.blocks as b, i (`${i}:${b.id}`)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (the Collection is the keyboard path to a block) -->
      <article
        class="lens-block"
        class:lens-block--selected={b.id === selectedId}
        data-instance-id={b.id}
        data-testid="lens-block"
        onclick={() => clickBlock(b.id)}
      >
        {#if editing && b.id === selectedId && b.record}
          {@render form(b)}
        {:else}
          {@render read(b, i === 0 && !!data.head)}
        {/if}
      </article>
    {/each}
  {:else if editing && data.block.record}
    {@render form(data.block)}
  {:else}
    <article class="lens-block lens-block--single">{@render read(data.block, true)}</article>
  {/if}
</div>
