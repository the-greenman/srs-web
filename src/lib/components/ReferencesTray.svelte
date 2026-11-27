<!--
  ReferencesTray — the essay's collected sources, quotations and problems, and a drop zone to add more
  (a text file by drop, paste or picker; a URL by paste or drop). Each row shows the type (and a
  source's kind), the whole label and two lines of its text (TrayEntry: the title opens all of it in
  place), a link to its `url` when it has one, and a "relation · ¶ …" chip per paragraph it is
  linked to (a chip focuses its paragraph; no chips = not linked yet). Pin keeps it in the
  pinned pane; an agent's find is thumbed up in place, and the bin takes any entry out (owner ruling,
  vignette eb76738f); "Link to paragraph" picks one of `paragraphs`; the bin unlinks it from every paragraph and
  takes it out of the collection, never deleting the record. Shares the tray stylesheet (draft-tray.css).
  With `oncontext`, context documents (the call the essay answers) are listed first with a form to add
  one by file, URL or pasted text; the rest are the ordinary references.
  With `onsearch` and `onadd`, a search adds a record the repository already holds, such as a claim.
  Issues: https://github.com/the-greenman/srs-web/issues/495, #519, #568, #754, #787
-->
<script lang="ts">
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import LinkIcon from '@lucide/svelte/icons/link';
  import Pin from '@lucide/svelte/icons/pin';
  import ThumbsUp from '@lucide/svelte/icons/thumbs-up';
  import Trash from '@lucide/svelte/icons/trash-2';
  import ActionMenu from './ActionMenu.svelte';
  import AttachDrop from './AttachDrop.svelte';
  import type { AttachFile, AttachPolicy } from './attach-check.js';
  import { BROWSER_BUDGET } from './attach-check.js';
  import Button from './Button.svelte';
  import IconButton from './IconButton.svelte';
  import Input from './Input.svelte';
  import RepoSize from './RepoSize.svelte';
  import Textarea from './Textarea.svelte';
  import TrayEntry from './TrayEntry.svelte';
  import type { EntryText } from './TrayEntry.svelte';
  import TrayRow from './TrayRow.svelte';

  export interface ReferenceItem {
    id: string;
    label: string;
    /** Record type name (source, quotation, problem...). */
    type: string;
    /** A source's kind (transcript, web...); "" otherwise. */
    kind?: string;
    /** A source's URL; "" otherwise. */
    url?: string;
    /** A quotation's source: it is listed under that source when the source is in the tray (#525). */
    sourceId?: string;
    /** A context document (the call the essay answers): listed apart from ordinary references. */
    context?: boolean;
    /** Its opening words, shown under the title. */
    preview?: string;
    /** The paragraphs it is linked to, each with how it relates; none = not linked yet. */
    paragraphs: { id: string; label: string; relation?: string }[];
    /** Set when an agent put it in the pool: its name, so the writer sees who found it (#626). */
    foundBy?: string;
    /** The writer's answer on an agent's find: `agree` = thumbed up; absent = a suggestion still waiting. */
    verdict?: 'agree' | 'disagree';
  }

  let {
    items,
    paragraphs = [],
    usedBytes = 0,
    maxBytes = BROWSER_BUDGET,
    policy,
    attachedBytes = 0,
    read,
    onpin,
    onfocus,
    onremove,
    onfiles,
    onurls,
    onlink,
    onanswer,
    oncontext,
    onsearch,
    onadd,
  }: {
    items: ReferenceItem[];
    /** Every paragraph a reference can be linked to. Absent/empty: no link action. */
    paragraphs?: { id: string; label: string }[];
    /** The whole repository's bytes, against `maxBytes` (the browser budget) on the meter: a warning only. */
    usedBytes?: number;
    maxBytes?: number;
    /** The repository's attachment policy and the bytes already attached: they gate a drop. */
    policy?: AttachPolicy;
    attachedBytes?: number;
    /** An item's whole text, asked for when it is opened. */
    read: (id: string) => EntryText;
    onpin: (id: string) => void;
    onfocus: (paragraphId: string) => void;
    onremove: (id: string) => void;
    /** Absent: no drop zone (the tray only lists). */
    onfiles?: (files: AttachFile[]) => void | Promise<void>;
    onurls?: (urls: string[]) => void | Promise<void>;
    onlink?: (referenceId: string, paragraphId: string) => void;
    /** Thumb up (`agree`) or clear (`withdrawn`) an agent's find. Absent: no thumb. */
    onanswer?: (referenceId: string, kind: 'agree' | 'withdrawn') => void;
    /** Absent: no context-document form. */
    oncontext?: (docs: { files?: AttachFile[]; urls?: string[]; texts?: { title: string; body: string }[] }) => void | Promise<void>;
    /** The repository's records matching a search, that the tray doesn't hold. Absent: no search. */
    onsearch?: (text: string) => { id: string; label: string; type: string }[];
    onadd?: (id: string) => void;
  } = $props();

  let query = $state('');
  const found = $derived(onsearch ? onsearch(query) : []);
  const searched = $derived(query.trim().length >= 2);

  const contextItems = $derived(items.filter((r) => r.context));
  const otherItems = $derived(items.filter((r) => !r.context));
  const ids = $derived(new Set(items.map((r) => r.id)));
  /** Top-level rows: a quotation whose source is present nests under it instead. */
  const topItems = $derived(otherItems.filter((r) => !(r.sourceId && ids.has(r.sourceId))));
  const quotesOf = (id: string) => otherItems.filter((r) => r.sourceId === id);
  let ctxTitle = $state('');
  let ctxUrl = $state('');
  let ctxText = $state('');
  async function addPasted() {
    const body = ctxText.trim();
    if (!body) return;
    await oncontext?.({ texts: [{ title: ctxTitle.trim() || 'Pasted context', body }] });
    ctxTitle = '';
    ctxText = '';
  }
  async function addUrl() {
    const url = ctxUrl.trim();
    if (!url) return;
    await oncontext?.({ urls: [url] });
    ctxUrl = '';
  }

  let pending = $state(0);
  async function files(f: AttachFile[]) {
    pending = f.reduce((n, x) => n + x.bytes.length, 0);
    try {
      await onfiles?.(f);
    } finally {
      pending = 0;
    }
  }
</script>

<section class="tray refs-tray" aria-label="References" data-testid="references">
  {#if onfiles}
    <AttachDrop compact label="Add to references" {policy} {attachedBytes} onfiles={files} {onurls} data-testid="references-drop" />
    <RepoSize totalBytes={usedBytes} {maxBytes} pendingBytes={pending} />
  {/if}
  {#if onsearch && onadd}
    <form class="refs-tray__form" onsubmit={(e) => e.preventDefault()}>
      <Input bind:value={query} aria-label="Find an existing claim or source" placeholder="Find an existing claim or source" data-testid="references-find" />
    </form>
    {#each found as f (f.id)}
      <TrayRow label={`${f.label} (${f.type})`} data-testid="references-found">
        {#snippet actions()}
          <Button size="sm" aria-label={`Add ${f.label} to references`} onclick={() => { onadd(f.id); query = ''; }}>Add</Button>
        {/snippet}
      </TrayRow>
    {/each}
    {#if searched && found.length === 0}<p class="tray__empty" data-testid="references-found-none">Nothing in this repository matches.</p>{/if}
  {/if}
  {#if otherItems.length === 0}<p class="tray__empty">Sources, quotations and problems that agents and attach flows collect for this essay wait here.</p>{/if}
{#snippet rows(list: ReferenceItem[], nested = false)}
  {#each list as r (r.id)}
    {@const free = paragraphs.filter((p) => !r.paragraphs.some((q) => q.id === p.id))}
    <div class="refs-tray__item" class:refs-tray__item--nested={nested} data-testid={nested ? 'reference-quote' : 'reference-row'}>
      <TrayEntry kind={`${r.type}${r.kind ? ` · ${r.kind}` : ''}`} title={r.label} preview={r.preview} read={() => read(r.id)}>
        {#snippet actions()}
          {#if r.foundBy && onanswer}
            {@const up = r.verdict === 'agree'}
            <IconButton icon={ThumbsUp} variant="outline" pressed={up} data-testid="reference-up" label={`Thumbs up ${r.label}`} onclick={() => onanswer(r.id, up ? 'withdrawn' : 'agree')} />
          {/if}
          <IconButton icon={Pin} variant="outline" label={`Pin ${r.label}`} onclick={() => onpin(r.id)} />
          {#if onlink && free.length}
            <ActionMenu
              testid="reference-link"
              title="Link to paragraph"
              triggerIcon={LinkIcon}
              label={r.label}
              actions={free.map((p) => ({ id: p.id, label: p.label, enabled: true, run: () => onlink(r.id, p.id) }))}
              itemTestid={(a) => `reference-link-${a.id}`}
            />
          {/if}
          <IconButton icon={Trash} variant="outline" data-testid="reference-bin" label={`Bin ${r.label}`} onclick={() => onremove(r.id)} />
        {/snippet}
      </TrayEntry>
      {#if r.foundBy && r.verdict !== 'agree'}
        <p class="tray__empty" data-testid="reference-found">Suggested by {r.foundBy}</p>
      {/if}
      {#if r.paragraphs.length || r.url}
        <div class="tray__chips">
          {#if r.url}
            <a class="tray__chip" data-testid="reference-url" href={r.url} target="_blank" rel="noopener noreferrer" title={`Open ${r.url}`}><ExternalLink size={12} aria-hidden="true" /> {r.url}</a>
          {/if}
          {#each r.paragraphs as p (p.id)}
            <button type="button" class="tray__chip tray__chip--wrap" data-testid="reference-chip" title={`Go to ${p.label}`} onclick={() => onfocus(p.id)}>{p.relation ? `${p.relation} · ` : ''}¶ {p.label}</button>
          {/each}
        </div>
      {/if}
      {#if !nested}
        {@const quotes = quotesOf(r.id)}
        {#if quotes.length}
          <div class="refs-tray__quotes" data-testid="reference-quotes">{@render rows(quotes, true)}</div>
        {/if}
      {/if}
    </div>
  {/each}
{/snippet}

  {#if oncontext}
    <div class="refs-tray__context" data-testid="context-documents">
      <h3 class="tray__subhead">Context documents</h3>
      <p class="tray__empty">Documents this essay answers, such as the funding call. Every connected agent reads them.</p>
      {@render rows(contextItems)}
      <AttachDrop compact label="Add a context file" {policy} {attachedBytes} onfiles={(f) => oncontext({ files: f })} data-testid="context-drop" />
      <form class="refs-tray__form" onsubmit={(e) => { e.preventDefault(); addUrl(); }}>
        <Input type="url" bind:value={ctxUrl} aria-label="Context URL" placeholder="Context URL" data-testid="context-url" />
        <Button type="submit" size="sm" disabled={!ctxUrl.trim()}>Add URL</Button>
      </form>
      <form class="refs-tray__form" onsubmit={(e) => { e.preventDefault(); addPasted(); }}>
        <Input bind:value={ctxTitle} aria-label="Context title" placeholder="Title (optional)" data-testid="context-title" />
        <Textarea rows={4} bind:value={ctxText} aria-label="Pasted context text" placeholder="Paste the call text here" data-testid="context-text" />
        <Button type="submit" size="sm" disabled={!ctxText.trim()}>Add pasted text</Button>
      </form>
    </div>
    <h3 class="tray__subhead">References</h3>
  {/if}
  {@render rows(topItems)}
</section>
