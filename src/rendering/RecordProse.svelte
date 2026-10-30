<!--
  RecordProse — the one component for reading a record as prose (ADR-024). The title is the heading;
  the main body (the first long markdown field, else the first long field) has no label; other long
  fields sit under small muted labels; short values are one line of chips (a URL as a link); inline
  composites are tables. Lifecycle and createdBy belong to the host's header (Lenses: Focus). Empty fields, aiGuidance, descriptions
  and required markers are never shown, and the field equal to the display label is not repeated.
  Props only, no shell context, so it renders in any shell. Labels come from src/lib/labels.ts
  (fieldLabel, already applied by definitionToFields). The split itself is proseView ($lib/prose.ts), shared with the Read view's first lines. Wraps .record-prose (lens.css).
  Parts: title, meta, body, more, label, composite.
-->
<script lang="ts">
  import MarkdownView from "$lib/components/MarkdownView.svelte";
  import TagChip from "$lib/components/TagChip.svelte";
  import type { CompositeFormDef } from "$lib/editor/blueprint-fields.js";
  import type { FieldFormDef } from "$lib/governance/types.js";
  import { proseView, str } from "$lib/prose.js";
  import type { SrsRecord } from "$lib/srs-client.js";

  let {
    record,
    fields,
    composites,
    heading = "h2",
  }: {
    record: SrsRecord;
    /** The type schema's fields (definitionToFields); empty = every stored value, labelled by its name. */
    fields: FieldFormDef[];
    composites: CompositeFormDef[];
    heading?: "h2" | "h3";
  } = $props();

  const http = (v: unknown) => typeof v === "string" && /^https?:\/\//.test(v);
  const isTable = (entries: Record<string, unknown>[]) =>
    entries.some((e) => Array.isArray(e.columns) && Array.isArray(e.rows));

  const view = $derived(proseView(record, fields, composites));
</script>

<div class="record-prose" data-testid="record-prose">
  <svelte:element this={heading} class="record-prose__title" data-part="title">{record.displayLabel || record.instanceId.slice(0, 8)}</svelte:element>
  {#if view.meta.length > 0}
    <p class="record-prose__meta" data-part="meta" data-testid="record-prose-meta">
      {#each view.meta as m, i (i)}
        {#if http(m.value)}
          <a href={m.value} target="_blank" rel="noopener noreferrer" title={m.label}>{m.value}</a>
        {:else}
          <span title={m.label}><TagChip label={m.value} /></span>
        {/if}
      {/each}
    </p>
  {/if}
  {#if view.body}<MarkdownView class="record-prose__body" data-part="body" value={view.body} />{/if}
  {#each view.secondary as s, i (i)}
    <section class="record-prose__more" data-part="more">
      <h4 class="record-prose__label" data-part="label">{s.label}</h4>
      <MarkdownView value={s.value} />
    </section>
  {/each}
  {#each view.tables as c (c.name)}
    <section class="record-prose__more" data-part="composite">
      <h4 class="record-prose__label" data-part="label">{c.label}</h4>
      {#if isTable(c.entries)}
        {#each c.entries as e, i (i)}
          <table class="log-table record-prose__table">
            <thead><tr>{#each (e.columns as unknown[]) ?? [] as col, ci (ci)}<th>{str(col)}</th>{/each}</tr></thead>
            <tbody>
              {#each (e.rows as { cells?: unknown[] }[]) ?? [] as row, ri (ri)}
                <tr>{#each row.cells ?? [] as cellValue, ci (ci)}<td>{str(cellValue)}</td>{/each}</tr>
              {/each}
            </tbody>
          </table>
        {/each}
      {:else}
        <table class="log-table record-prose__table">
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
</div>
