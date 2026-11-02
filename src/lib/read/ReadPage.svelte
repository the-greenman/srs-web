<!--
  ReadPage — one page of the Read view (ADR-029): the instance's text, then what its outline nests under
  it. A record reads through RecordProse (ADR-024); a note shows its sections. Each item is a link with
  its kind, whether it opens onto more, and its first line. A wall comes grouped (page.groupedBy): one
  <details> per group, closed, so a reader picks a group before an item. Presentation only: the page is
  built by read-model.ts, and `href` / `onOpen` come from the screen. Wraps .read-page (read.css).
  Parts: kind, inside, item, first.
-->
<script lang="ts">
  import MarkdownView from "$lib/components/MarkdownView.svelte";
  import { humanise } from "$lib/labels.js";
  import { type ReadItem, type ReadPage, opensOnto } from "$lib/read/read-model.js";
  import RecordProse from "../../rendering/RecordProse.svelte";

  let {
    page,
    href,
    onOpen,
  }: {
    page: ReadPage;
    /** The address an item opens (a real link, so it can be copied or opened in a new tab). */
    href: (item: ReadItem) => string;
    onOpen: (item: ReadItem) => void;
  } = $props();

  const groups = $derived.by(() => {
    if (!page.groupedBy) return [];
    const m = new Map<string, ReadItem[]>();
    for (const i of page.items) {
      const g = i.group ?? "";
      m.set(g, [...(m.get(g) ?? []), i]);
    }
    return [...m];
  });
  const kind = (i: ReadItem) => i.typeName ?? "";
  const open = (e: MouseEvent, i: ReadItem) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(i);
  };
</script>

{#snippet list(items: ReadItem[])}
  <ul class="read-page__list">
    {#each items as i (i.id)}
      <li>
        <a class="read-page__item" data-part="item" data-testid="read-item" href={href(i)} onclick={(e) => open(e, i)}>
          <span class="read-page__label">{i.label}</span>
          <span class="read-page__kind" data-part="kind">{kind(i)}{#if opensOnto(i)}<span aria-label="opens onto more"> ›</span>{/if}</span>
          {#if i.first}<span class="read-page__first" data-part="first">{i.first}</span>{/if}
        </a>
      </li>
    {/each}
  </ul>
{/snippet}

<article class="read-page" data-testid="read-page">
  {#if page.record?.record}
    <p class="read-page__kind read-page__eyebrow" data-part="kind">{humanise(page.record.record.typeName ?? "")}</p>
    <RecordProse record={page.record.record} fields={page.record.fields} composites={page.record.composites} />
  {:else if page.note}
    <p class="read-page__kind read-page__eyebrow" data-part="kind">Note</p>
    <h2 class="record-prose__title">{page.title}</h2>
    {#each page.note.sections ?? [] as s, k (k)}
      {#if s.content?.trim()}
        {#if (page.note.sections?.length ?? 0) > 1}<h4 class="record-prose__label">{s.label || humanise(s.name ?? "")}</h4>{/if}
        <MarkdownView value={s.content} />
      {/if}
    {/each}
  {:else if page.title}
    <h2 class="record-prose__title">{page.title}</h2>
  {/if}

  {#if page.items.length > 0}
    <section class="read-page__inside" data-part="inside" aria-label="Inside">
      <h3>Inside</h3>
      {#if page.groupedBy}
        <p class="read-page__note">{page.items.length} items, grouped by {page.groupedBy === "type" ? "kind" : humanise(page.groupedBy)}.</p>
        {#each groups as [g, items] (g)}
          <details class="read-page__group" data-testid="read-group">
            <summary>{g || "Other"} <span class="read-page__count">{items.length}</span></summary>
            {@render list(items)}
          </details>
        {/each}
      {:else}
        {@render list(page.items)}
      {/if}
    </section>
  {/if}
</article>
