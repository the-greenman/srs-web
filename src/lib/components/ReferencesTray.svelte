<!--
  ReferencesTray — the essay's collected sources, claims and problems, and a drop zone to add more
  (a text file by drop, paste or picker; a URL by paste or drop). Each row shows the label, the type
  (and a source's kind), a link to its `url` when it has one, and a "¶ …" chip per paragraph it is
  linked to (a chip focuses its paragraph; no chips = not linked yet). Open reads the record in the
  pinned pane; "Link to paragraph" picks one of `paragraphs`; Remove takes it out of the collection
  only, never deletes the record. Shares the tray stylesheet (draft-tray.css).
  With `oncontext`, context documents (the call the essay answers) are listed first with a form to add
  one by file, URL or pasted text; the rest are the ordinary references.
  Issues: https://github.com/the-greenman/srs-web/issues/495, #519, #568
-->
<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import LinkIcon from '@lucide/svelte/icons/link';
  import X from '@lucide/svelte/icons/x';
  import ActionMenu from './ActionMenu.svelte';
  import AttachDrop from './AttachDrop.svelte';
  import type { AttachFile } from './attach-check.js';
  import { DEFAULT_MAX_TOTAL } from './attach-check.js';
  import Button from './Button.svelte';
  import IconButton from './IconButton.svelte';
  import Input from './Input.svelte';
  import RepoSize from './RepoSize.svelte';
  import Textarea from './Textarea.svelte';
  import TrayRow from './TrayRow.svelte';

  export interface ReferenceItem {
    id: string;
    label: string;
    /** Record type name (source, claim, problem...). */
    type: string;
    /** A source's kind (transcript, web...); "" otherwise. */
    kind?: string;
    /** A source's URL; "" otherwise. */
    url?: string;
    /** A context document (the call the essay answers): listed apart from ordinary references. */
    context?: boolean;
    /** The paragraphs it is linked to; none = not linked yet. */
    paragraphs: { id: string; label: string }[];
  }

  let {
    items,
    paragraphs = [],
    usedBytes = 0,
    maxBytes = DEFAULT_MAX_TOTAL,
    onopen,
    onfocus,
    onremove,
    onfiles,
    onurls,
    onlink,
    oncontext,
  }: {
    items: ReferenceItem[];
    /** Every paragraph a reference can be linked to. Absent/empty: no link action. */
    paragraphs?: { id: string; label: string }[];
    usedBytes?: number;
    maxBytes?: number;
    onopen: (id: string) => void;
    onfocus: (paragraphId: string) => void;
    onremove: (id: string) => void;
    /** Absent: no drop zone (the tray only lists). */
    onfiles?: (files: AttachFile[]) => void | Promise<void>;
    onurls?: (urls: string[]) => void | Promise<void>;
    onlink?: (referenceId: string, paragraphId: string) => void;
    /** Absent: no context-document form. File text is not readable by agents yet (srs-rust#1333). */
    oncontext?: (docs: { files?: AttachFile[]; urls?: string[]; texts?: { title: string; body: string }[] }) => void | Promise<void>;
  } = $props();

  const contextItems = $derived(items.filter((r) => r.context));
  const otherItems = $derived(items.filter((r) => !r.context));
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
    <AttachDrop compact label="Add to references" {usedBytes} onfiles={files} {onurls} data-testid="references-drop" />
    <RepoSize totalBytes={usedBytes} {maxBytes} pendingBytes={pending} />
  {/if}
  {#if otherItems.length === 0}<p class="tray__empty">Sources, claims and problems that agents and attach flows collect for this essay wait here.</p>{/if}
{#snippet rows(list: ReferenceItem[])}
  {#each list as r (r.id)}
    {@const free = paragraphs.filter((p) => !r.paragraphs.some((q) => q.id === p.id))}
    <div class="refs-tray__item" data-testid="reference-row">
      <TrayRow label={`${r.label} (${r.type}${r.kind ? ` · ${r.kind}` : ''})`}>
        {#snippet actions()}
          <IconButton icon={BookOpen} variant="outline" label={`Open ${r.label}`} onclick={() => onopen(r.id)} />
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
          <IconButton icon={X} variant="outline" label={`Remove ${r.label} from references`} onclick={() => onremove(r.id)} />
        {/snippet}
      </TrayRow>
      {#if r.paragraphs.length || r.url}
        <div class="tray__chips">
          {#if r.url}
            <a class="tray__chip" data-testid="reference-url" href={r.url} target="_blank" rel="noopener noreferrer" title={`Open ${r.url}`}><ExternalLink size={12} aria-hidden="true" /> {r.url}</a>
          {/if}
          {#each r.paragraphs as p (p.id)}
            <button type="button" class="tray__chip" data-testid="reference-chip" title={`Go to ${p.label}`} onclick={() => onfocus(p.id)}>¶ {p.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
{/snippet}

  {#if oncontext}
    <div class="refs-tray__context" data-testid="context-documents">
      <h3 class="tray__subhead">Context documents</h3>
      <p class="tray__empty">Documents this essay answers, such as the funding call. Every connected agent reads them.</p>
      {@render rows(contextItems)}
      <AttachDrop compact label="Add a context file" {usedBytes} onfiles={(f) => oncontext({ files: f })} data-testid="context-drop" />
      <p class="tray__empty" data-testid="context-file-note">Agents can read a file's text once srs-rust#1333 lands. Pasted text and URLs are readable now.</p>
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
  {@render rows(otherItems)}
</section>
