<!--
  Focus — pane 2: what the centre IS, chosen by the lens and switchable in its header ("Show as": Read |
  Document | As published when a composition applies, plus Edit). The header also shows the selected
  record's lifecycle (Tag, read-only, ADR-012) and who created it (ActorChip).
  read: one record through RecordProse (ADR-024). blocks: the Collection (or a section's container) as
  one document, each record a RecordProse block, the anchoring record as the heading block; the selected
  one is highlighted and scrolled into view, clicking a block selects it. document ("As published"): a
  composition rendered to markdown, then through the core renderMarkdown; read-only. Edit opens
  SectionForm in place: it replaces the record (read) or only the selected block (blocks). Edit is
  absent when `onEdit` is (read-only). Presentation only: data arrives loaded (lens-data.ts).
  Wraps .lens-focus (lens.css). Parts: bar, mode, block.
-->
<script lang="ts">
  import ActorChip from "$lib/components/ActorChip.svelte";
  import Button from "$lib/components/Button.svelte";
  import MarkdownView from "$lib/components/MarkdownView.svelte";
  import Select from "$lib/components/Select.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import SectionForm from "$lib/editor/SectionForm.svelte";
  import type { UpdateRecordInput } from "$lib/srs-client.js";
  import type { Status } from "$lib/types";
  import RecordProse from "../../rendering/RecordProse.svelte";
  import type { FocusData, ReadData } from "./lens-data.js";

  type Mode = "read" | "document" | "published";

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
    mode?: Mode;
    editing?: boolean;
    selectedId?: string | null;
    /** Absent = no mode control. */
    onMode?: (mode: Mode) => void;
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

  const modes = $derived([
    { value: "read", label: "Read" },
    { value: "document", label: "Document" },
    ...(published ? [{ value: "published", label: "As published" }] : []),
  ]);
  /** The record the header describes: the read record, or the selected block. */
  const current = $derived(
    data.kind === "read"
      ? data.block.record
      : data.kind === "blocks"
        ? [data.head, ...data.blocks].find((b) => b?.id === selectedId)?.record
        : undefined
  );

  let root = $state<HTMLDivElement>();
  /** The block the reader clicked: already in view, so no scroll. */
  let clicked: string | null = null;
  $effect(() => {
    const id = selectedId;
    if (data.kind !== "blocks" || !id || !root) return;
    if (id === clicked) return;
    root.querySelector(`[data-instance-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: "start" });
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

{#snippet read(b: ReadData, heading: "h2" | "h3")}
  {#if b.record}
    <RecordProse record={b.record} fields={b.fields} composites={b.composites} {heading} />
  {:else}
    <svelte:element this={heading} class="record-prose__title">{b.label}</svelte:element>
    <!-- ponytail: ADR-025 gap 3 (srs-rust#1379) — a Tier 0 note cannot be read through WASM. -->
    <p class="lens-empty">A note; its text is not shown here.</p>
  {/if}
{/snippet}

<div class="lens-focus" data-testid="lens-focus" data-kind={data.kind} bind:this={root}>
  {#if data.kind !== "none" && (onMode || onEdit || current)}
    <div class="lens-focus__bar" data-part="bar">
      {#if onMode}
        <label class="lens-by" data-part="mode">
          <span>Show as</span>
          <Select
            value={mode}
            options={modes}
            data-testid="lens-mode"
            onchange={(e) => onMode((e.currentTarget as HTMLSelectElement).value as Mode)}
          />
        </label>
      {/if}
      {#if current?.lifecycle}<Tag status={current.lifecycle as Status} />{/if}
      {#if current?.createdBy}<ActorChip actor={current.createdBy} />{/if}
      {#if onEdit && current}
        <Button size="sm" data-testid="lens-edit" onclick={onEdit}>{editing ? "Close editor" : "Edit"}</Button>
      {/if}
    </div>
  {/if}
  {#if data.kind === "none"}
    <p class="lens-empty">Select something to read it here.</p>
  {:else if data.kind === "document"}
    <!-- ponytail: ADR-025 gap 2 (srs-rust#1288) — no per-record anchors, so the selection is not highlighted here. -->
    <MarkdownView class="lens-doc" value={data.markdown} />
  {:else if data.kind === "blocks"}
    {#if !data.head}<h2 class="record-prose__title lens-doc__title">{data.title}</h2>{/if}
    {#each data.head ? [data.head, ...data.blocks] : data.blocks as b, i (`${i}:${b.id}`)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (the Collection is the keyboard path to a block) -->
      <article
        class="lens-block"
        class:lens-block--selected={b.id === selectedId}
        data-instance-id={b.id}
        data-part="block"
        data-testid="lens-block"
        onclick={() => clickBlock(b.id)}
      >
        {#if editing && b.id === selectedId && b.record}
          {@render form(b)}
        {:else}
          {@render read(b, i === 0 && data.head ? "h2" : "h3")}
        {/if}
      </article>
    {/each}
  {:else if editing && data.block.record}
    {@render form(data.block)}
  {:else}
    <article class="lens-block lens-block--single">{@render read(data.block, "h2")}</article>
  {/if}
</div>
