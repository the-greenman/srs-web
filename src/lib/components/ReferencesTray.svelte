<!--
  ReferencesTray — the essay's collected sources, claims and problems, and a drop zone to add more
  (a text file by drop, paste or picker; a URL by paste or drop). Each row shows the label, the type
  (and a source's kind), a link to its `url` when it has one, and a "¶ …" chip per paragraph it is
  linked to (a chip focuses its paragraph; no chips = not linked yet). Open reads the record in the
  pinned pane; "Link to paragraph" picks one of `paragraphs`; Remove takes it out of the collection
  only, never deletes the record. Shares the tray stylesheet (draft-tray.css).
  Issues: https://github.com/the-greenman/srs-web/issues/495, #519
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
  import IconButton from './IconButton.svelte';
  import RepoSize from './RepoSize.svelte';
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
  } = $props();

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
  {#if items.length === 0}<p class="tray__empty">Sources, claims and problems that agents and attach flows collect for this essay wait here.</p>{/if}
  {#each items as r (r.id)}
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
</section>
