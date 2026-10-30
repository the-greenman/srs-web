<!--
  ReadShell — the built-in Read view (ADR-022, ADR-029): a repository read as a document, one column. It
  opens on the front door (the root container, on its identity record); each page is an instance's text
  and what its outline nests under it (read-model.ts, ReadPage). Opening an item pushes the address
  `read=<containerId>&id=<instanceId>` with the link trail (ADR-023); Back and the breadcrumb are
  history.go(-n), so they agree with browser Back. App owns the one popstate listener and passes the
  parsed `address` and `addressState`; this screen adds no listener. Go > Explorer pushes the address
  without the `read` key. Read-only by design: it never writes a record.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { type Address, type TrailEntry, formatAddress, parseAddress, pushAddress, readTrail } from "$lib/address.js";
  import AppShell from "$lib/components/AppShell.svelte";
  import Breadcrumb from "$lib/components/Breadcrumb.svelte";
  import Button from "$lib/components/Button.svelte";
  import Main from "$lib/components/Main.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import { BASE_GROUPS } from "$lib/components/shell-actions.js";
  import type { EditorShellProps } from "$lib/editors/registry.js";
  import { lensActions } from "$lib/lens/toolbar-actions.js";
  import { type ReadItem, type ReadPage as Page, frontDoor, openTarget, readPage } from "$lib/read/read-model.js";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import ReadPage from "./ReadPage.svelte";

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
    onOpenExplorer,
    onOpenAgents,
    onOpenPackages,
    readOnlyReason = null,
    readOnly = false,
    onSaveCopy,
    address,
    addressState,
  }: EditorShellProps & {
    /** Opened from a link (ADR-021). */
    readOnly?: boolean;
    /** Document > Save a copy…; given only while `readOnly`. */
    onSaveCopy?: () => void;
    /** The parsed hash, kept by App's one popstate listener. */
    address: Address;
    /** history.state at that address (carries the link trail). */
    addressState: unknown;
  } = $props();

  const shell = new ShellState({ wideEnabled: true });
  const door = $derived(frontDoor(repo));
  /** Where we are and how we got here: set on a click, re-applied from App's address on popstate. */
  let where = $state<{ containerId: string; id?: string }>({ containerId: "" });
  let trail = $state<TrailEntry[]>([]);
  /** Re-apply App's address; entered with no read key (from the explorer), open the front door once. */
  let entered = false;
  $effect(() => {
    const read = address.read, id = address.instanceId, state = addressState;
    untrack(() => {
      if (read) {
        where = { containerId: read, id };
        trail = readTrail(state);
      } else if (!entered) {
        // the address names the front door, so Back returns here
        go(door, []);
      }
      entered = true;
    });
  });
  const loaded = $derived.by((): { page?: Page; error?: string } => {
    void documentRevision;
    if (!where.containerId) return {};
    try {
      return { page: readPage(repo, where.containerId, where.id) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
  const title = $derived(loaded.page?.title || documentTitle);

  const href = (i: ReadItem) => {
    const t = openTarget(loaded.page!, i);
    return formatAddress({ read: t.containerId, instanceId: t.id }) || "#";
  };
  function go(to: { containerId: string; id?: string }, next: TrailEntry[]): void {
    pushAddress({ read: to.containerId, instanceId: to.id }, next);
    where = to;
    trail = next;
    window.scrollTo(0, 0);
  }
  const open = (i: ReadItem) =>
    go(openTarget(loaded.page!, i), [...trail, { id: loaded.page?.id ?? "", label: title }]);
  /** Every trail move is history.go(-n); App's popstate re-applies the address it lands on. */
  const back = (n = 1) => history.go(-n);
  const crumbs = $derived([
    ...trail.map((t, i) => ({ label: t.label, onclick: () => back(trail.length - i) })),
    { label: title },
  ]);

  function openExplorer(): void {
    const a = parseAddress(location.hash);
    pushAddress({ essayId: a.essayId, paragraphId: a.paragraphId, zoomId: a.zoomId });
    onOpenExplorer?.();
  }
  const barActions = $derived(
    lensActions(
      {
        onsave: onSave && !readOnly ? () => void onSave() : undefined,
        onexport: onExport,
        onexportsrsj: onExportSrsj,
        onsavecopy: readOnly ? onSaveCopy : undefined,
        onopenanother: onOpenAnother,
        onopenagents: onOpenAgents,
        onopenpackages: readOnly ? undefined : onOpenPackages,
        onopenexplorer: openExplorer,
      },
      { shell, saving, dirty: documentDirty }
    )
  );
</script>

{#snippet mainPane()}
  <Main>
    {#snippet bar()}
      <Toolbar title={documentTitle} actions={barActions} groups={BASE_GROUPS}>
        {#snippet status()}
          {#if documentDirty}<span data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
        {/snippet}
      </Toolbar>
    {/snippet}
    <div class="read-main" data-testid="read-shell">
      {#if !onSave && readOnlyReason}<Notice kind="info" testid="read-only-note">{readOnlyReason}</Notice>{/if}
      {#if trail.length > 0}
        <nav class="lens-trail" aria-label="Reading trail" data-testid="read-trail">
          <Button size="sm" data-testid="read-back" onclick={() => back(1)}>Back</Button>
          <Breadcrumb items={crumbs} />
        </nav>
      {/if}
      {#if loaded.page}
        <ReadPage page={loaded.page} {href} onOpen={open} />
      {:else if loaded.error}
        <Notice kind="error">This page cannot be read: {loaded.error}</Notice>
        <Button size="sm" onclick={() => go(door, [])}>Go to the front page</Button>
      {/if}
    </div>
  </Main>
{/snippet}

<div class="read-shell">
  <AppShell {shell} main={mainPane} />
</div>
