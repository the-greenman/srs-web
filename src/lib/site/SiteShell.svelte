<!--
  SiteShell — the site editor (ADR-029, srs-web#680 B1): a website's pages, built from the blocks
  its own package dispatches. A screen: it composes components over the headless site core
  (site-views, site-model, site-edit) and adds no behaviour of its own (ADR-027). Every write goes
  through `run`, one undo step each; the repository's write bumps `documentRevision`, which reloads.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import BinTray from "$lib/components/BinTray.svelte";
  import BlockStack from "$lib/components/BlockStack.svelte";
  import type { DropTarget } from "$lib/components/BlockStack.svelte";
  import Button from "$lib/components/Button.svelte";
  import Checkbox from "$lib/components/Checkbox.svelte";
  import DraftTray from "$lib/components/DraftTray.svelte";
  import Field from "$lib/components/Field.svelte";
  import Input from "$lib/components/Input.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import InspectorTrigger from "$lib/components/InspectorTrigger.svelte";
  import Main from "$lib/components/Main.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import Select from "$lib/components/Select.svelte";
  import SiteBlock from "$lib/components/SiteBlock.svelte";
  import SiteCanvas from "$lib/components/SiteCanvas.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import ActionMenu from "$lib/components/ActionMenu.svelte";
  import type { DragPayload } from "$lib/components/dnd.js";
  import type { ToolbarAction } from "$lib/components/menu-action.js";
  import { BASE_GROUPS, commonActions } from "$lib/components/shell-actions.js";
  import { DocumentHistory } from "$lib/document.js";
  import type { EditorShellProps } from "$lib/editors/registry.js";
  import { outsideRun } from "$lib/essay/essay-model.js";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import { type OutlineEntry, getContainerOutline, getRecord } from "$lib/srs-client.js";
  import {
    addBlock,
    addItem,
    alternativesFor,
    binIdFor,
    deleteForever,
    draftsIdFor,
    ensureAreas,
    fromBin,
    fromDrafts,
    itemTypes,
    moveBlock,
    nestItems,
    newPage,
    setField,
    setPageKey,
    snapshotPage,
    swapIn,
    toBin,
    toDrafts,
  } from "./site-edit.js";
  import { type PageRef, type Publish, listPages, pageSettings, setPageSettings, typeKey } from "./site-model.js";
  import { type Site, findSite, offeredTypes, viewFor } from "./site-views.js";

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
    onOpenAgents,
    onOpenPackages,
    readOnlyReason = null,
  }: EditorShellProps = $props();

  const shell = new ShellState({ wideEnabled: true });
  // readOnlyReason says the document cannot be saved back (it can be exported): editing is allowed,
  // but the open-time repair of a page's nesting is not made on it, as the essay does not repair.
  const repair = $derived(!readOnlyReason);

  let site = $state<Site | null>(null);
  let pages = $state<PageRef[]>([]);
  let pageId = $state<string | null>(null);
  let body = $state<OutlineEntry[]>([]);
  let drafts = $state<string[]>([]);
  let bin = $state<string[]>([]);
  let selectedId = $state<string | null>(null);
  let showBrief = $state(false);
  let error = $state<string | null>(null);
  /** Bumped by every reload, so derived views re-read the engine (whose object never changes). */
  let version = $state(0);
  const page = $derived(pages.find((p) => p.containerId === pageId) ?? null);

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const label = (s: string) => s.replace(/^.*\//, "").replace(/-view$/, "").replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const entriesOf = (containerId: string): string[] => {
    try {
      return getContainerOutline(repo, containerId).entries.filter((e) => e.depth === 0).map((e) => e.instanceId);
    } catch {
      return []; // the area is made on first use
    }
  };

  function reload(): void {
    try {
      site = findSite(repo);
      pages = site ? listPages(repo, site) : [];
      if (!pages.some((p) => p.containerId === pageId)) pageId = pages[0]?.containerId ?? null;
      const p = pages.find((x) => x.containerId === pageId);
      if (p && repair) nestItems(repo, p.containerId);
      body = p ? getContainerOutline(repo, p.containerId).body : [];
      drafts = p ? entriesOf(draftsIdFor(p)) : [];
      bin = p ? entriesOf(binIdFor(p)) : [];
      if (selectedId && !body.some((e) => e.instanceId === selectedId)) selectedId = null; // undone, moved away
      error = null;
    } catch (e) {
      error = msg(e);
    }
    version++;
  }

  $effect(() => {
    documentRevision;
    untrack(reload);
  });

  /** One undo history per page, for this browser session. */
  const histories = new Map<string, DocumentHistory>();
  const history = (): DocumentHistory | null => {
    if (!page) return null;
    const h = histories.get(page.containerId) ?? new DocumentHistory();
    histories.set(page.containerId, h);
    return h;
  };

  /**
   * Every write is one undo step. A write that fails partway still leaves its writes, so they too
   * become a step to undo. The write bumps `documentRevision`, which reloads (as the essay does).
   * Returns whether it succeeded.
   */
  function run(fn: (p: PageRef) => void): boolean {
    const p = page;
    if (!p) return false;
    let before: ReturnType<typeof snapshotPage> | null = null;
    try {
      ensureAreas(repo, p);
      before = snapshotPage(repo, p);
      fn(p);
      error = null;
      return true;
    } catch (e) {
      error = msg(e);
      return false;
    } finally {
      try {
        if (before) history()?.push(before, snapshotPage(repo, p));
      } catch {
        // the page itself is gone: nothing to undo into
      }
    }
  }

  function step(redo: boolean): void {
    const h = history();
    try {
      redo ? h?.redo(repo) : h?.undo(repo); // the restore writes; the revision bump reloads
    } catch (e) {
      error = msg(e);
    }
  }

  const fieldsOf = (id: string) => {
    void version;
    const rec = getRecord(repo, id);
    const view = rec && site ? viewFor(site, typeKey(rec)) : null;
    return { rec, view };
  };

  const barActions = $derived<ToolbarAction[]>([
    ...commonActions(
      {
        onsave: onSave ? () => void onSave() : undefined,
        onexport: onExport,
        onexportsrsj: onExportSrsj,
        onopenagents: onOpenAgents,
        onopenpackages: onOpenPackages,
        onopenanother: onOpenAnother,
      },
      { shell, saving }
    ),
    { id: "undo", group: "document", kind: "action", label: "Undo", testid: "site-undo", enabled: true, run: () => step(false) },
    { id: "redo", group: "document", kind: "action", label: "Redo", testid: "site-redo", enabled: true, run: () => step(true) },
    { id: "brief", group: "view", kind: "toggle", label: "Show briefs", testid: "site-brief", checked: showBrief, enabled: true, run: () => (showBrief = !showBrief) },
  ]);

  const addActions = $derived(
    site && page
      ? offeredTypes(site).map((key) => ({
          id: key,
          label: label(viewFor(site as Site, key)?.viewName ?? key) + ` (${label(key)})`,
          enabled: true,
          run: () => run((p) => (selectedId = addBlock(repo, site as Site, p, key, selectedId ? { id: selectedId, zone: "after" } : undefined))),
        }))
      : []
  );

  /** Drag sources: the page's BlockStack is "page"; DraftTray's is "draft". */
  type Source = "page" | "draft";
  function onDrop(to: Source, payload: DragPayload, t: DropTarget): void {
    const from = payload.from as Source;
    const zone = t.zone === "before" ? "before" : "after";
    if (to === "page" && from === "page") run((p) => moveBlock(repo, p, payload.id, { id: t.id, zone }));
    else if (to === "page" && from === "draft") run((p) => fromDrafts(repo, p, payload.id, { id: t.id, zone }));
    else if (to === "draft" && from === "page") run((p) => toDrafts(repo, p, payload.id));
  }

  const selected = $derived(selectedId ? fieldsOf(selectedId) : null);
  const settings = $derived.by(() => {
    void version;
    return page ? pageSettings(repo, page) : null;
  });
  const anchor = $derived.by(() => {
    void version;
    return page ? getRecord(repo, page.anchorId) : null;
  });
  const titleOf = (id: string) => {
    const { rec, view } = fieldsOf(id);
    // its first visible field with words in it (a hero's eyebrow may be empty)
    const first = view?.fields.find((f) => f.visible && String(rec?.fieldValues[f.name] ?? "").trim());
    return String((first && rec?.fieldValues[first.name]) || label(rec?.typeName ?? id));
  };
</script>

<svelte:window
  onkeydown={(e) => {
    // Inside a field the browser's own text undo applies; the page history takes over everywhere else.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "z" && !(e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) {
      e.preventDefault();
      step(e.shiftKey);
    }
    if (e.key === "Escape" && !(e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) selectedId = null;
  }}
/>

<div data-testid="site-shell">
  <AppShell {shell} inspectorLabel="Inspector">
    {#snippet main()}
      <Main>
        {#snippet bar()}
          <Toolbar title={page?.title ?? documentTitle} actions={barActions} groups={BASE_GROUPS}>
            {#snippet titleSlot()}
              <span class="eyebrow">{repoName}</span>
              {#if pages.length}
                <Select
                  aria-label="Page"
                  data-testid="site-page"
                  data-feature="site.pages"
                  value={pageId ?? ""}
                  options={pages.map((p) => ({ value: p.containerId, label: `${p.title} (/${p.key})` }))}
                  onchange={(e) => {
                    pageId = e.currentTarget.value;
                    selectedId = null;
                    reload();
                  }}
                />
              {/if}
            {/snippet}
            {#snippet status()}
              {#if documentDirty}<span data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
            {/snippet}
            {#snippet trail()}<InspectorTrigger />{/snippet}
          </Toolbar>
        {/snippet}
        {#if !onSave && readOnlyReason}<Notice kind="info" testid="readonly-reason">{readOnlyReason}</Notice>{/if}
        {#if error}<Notice kind="error" testid="site-error">{error}</Notice>{/if}
        <div class="workspace">
          {#if !site}
            <Notice kind="info">This repository has no website: install a website package with a site Composition.</Notice>
          {:else}
            <div class="cluster">
                <Button
                  size="sm"
                  variant="mono"
                  data-testid="site-new-page"
                  onclick={() => {
                    if (!site) return;
                    try {
                      const p = newPage(repo, site, "New page", `page-${pages.length + 1}`);
                      pageId = p.containerId;
                    } catch (e) {
                      error = msg(e);
                    }
                  }}>New page</Button>
                {#if page}
                  <ActionMenu actions={addActions} label="Add block" title="Add block" triggerLabel="Add block" testid="site-add-block" data-feature="site.add-block" />
                {/if}
            </div>
            {#if page}
              <!-- A click on the page around the blocks deselects (a block's own click stops here); Esc does too. -->
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <div data-feature="site.canvas" onclick={() => (selectedId = null)}>
                <SiteCanvas label={page.title}>
                    <BlockStack
                      items={body.map((e) => ({ id: e.instanceId, depth: e.depth }))}
                      source="page"
                      label="Page blocks"
                      candrop={(d, t) => outsideRun(body, d, t)}
                      ondrop={(payload, t) => onDrop("page", payload, t)}
                    >
                      {#snippet row(item, handle)}
                        {@const { rec, view } = fieldsOf(item.id)}
                        {#if rec}
                            <SiteBlock
                              typeLabel={label(view?.viewName ?? rec.typeName ?? "")}
                              selected={selectedId === item.id}
                              {handle}
                              brief={showBrief && view ? view.fields.filter((f) => f.hint === "brief").map((f) => ({ label: label(f.name), value: String(rec.fieldValues[f.name] ?? "") })) : null}
                              fields={(view?.fields ?? []).filter((f) => f.visible).map((f) => ({ name: f.name, label: label(f.name), value: rec.fieldValues[f.name], editable: true }))}
                              onselect={() => (selectedId = item.id)}
                              onedit={(name, value) => run(() => setField(repo, item.id, name, value))}
                            />
                        {/if}
                      {/snippet}
                    </BlockStack>
                </SiteCanvas>
              </div>
            {:else}
              <p>No pages yet.</p>
            {/if}
          {/if}
        </div>
      </Main>
    {/snippet}

    {#snippet inspector()}
      <Inspector label="Inspector">
        <div data-feature="site.inspector">
          {#if selected?.rec && page}
            {@const rec = selected.rec}
            {@const view = selected.view}
            <Panel title={label(view?.viewName ?? rec.typeName ?? "Block")} collapsible={false}>
              {#each (view?.fields ?? []).filter((f) => !f.visible && f.hint !== "brief") as f (f.name)}
                <Field label={label(f.name)}>
                  <Input
                    value={String(rec.fieldValues[f.name] ?? "")}
                    onchange={(e) => run(() => setField(repo, rec.instanceId, f.name, e.currentTarget.value))}
                  />
                </Field>
              {/each}
              {#if showBrief}
                {#each (view?.fields ?? []).filter((f) => f.hint === "brief") as f (f.name)}
                  <Field label={label(f.name)}>
                    <Input value={String(rec.fieldValues[f.name] ?? "")} onchange={(e) => run(() => setField(repo, rec.instanceId, f.name, e.currentTarget.value))} />
                  </Field>
                {/each}
              {/if}
              {#if page}
                {@const alts = alternativesFor(repo, page, rec.instanceId)}
                {#each alts as alt (alt)}
                  <p>Alternative: {titleOf(alt)} <Button size="sm" variant="mono" onclick={() => run((p) => swapIn(repo, p, alt, rec.instanceId))}>Swap in</Button></p>
                {/each}
                {#each itemTypes(repo, page, rec.instanceId) as key (key)}
                  <Button size="sm" variant="mono" onclick={() => run((p) => (selectedId = addItem(repo, site as Site, p, rec.instanceId, key)))}>Add {label(key)}</Button>
                {/each}
                <Button size="sm" variant="mono" data-testid="site-to-drafts" onclick={() => run((p) => { toDrafts(repo, p, rec.instanceId); selectedId = null; })}>Move to drafts</Button>
                <Button size="sm" variant="mono" data-testid="site-to-bin" onclick={() => run((p) => { toBin(repo, p, rec.instanceId); selectedId = null; })}>Move to bin</Button>
              {/if}
            </Panel>
          {:else if page && settings}
            <Panel title="Page settings" collapsible={false} data-feature="site.page-settings">
              <Field label="Publish">
                <Select
                  data-testid="site-publish"
                  value={settings.publish}
                  options={[{ value: "no", label: "Not published" }, { value: "draft", label: "Published as draft" }, { value: "yes", label: "Published" }]}
                  onchange={(e) => { const publish = e.currentTarget.value as Publish; run((p) => setPageSettings(repo, p, { publish })); }}
                />
              </Field>
              <Checkbox checked={settings.closingMark} onchange={(e) => { const closingMark = e.currentTarget.checked; run((p) => setPageSettings(repo, p, { closingMark })); }}>Closing mark</Checkbox>
              <Field label="Layout">
                <Input value={settings.layout} onchange={(e) => { const layout = e.currentTarget.value.trim() || "standard"; run((p) => setPageSettings(repo, p, { layout })); }} />
              </Field>
              {#if anchor}
                {#each Object.entries(anchor.fieldValues).filter(([, v]) => typeof v === "string") as [name, value] (name)}
                  <Field label={label(name)}>
                    <Input
                      value={String(value)}
                      onchange={(e) => {
                        const v = e.currentTarget.value;
                        run((p) => (name === "page_key" ? setPageKey(repo, site as Site, p, v) : setField(repo, anchor.instanceId, name, v)));
                      }}
                    />
                  </Field>
                {/each}
              {/if}
            </Panel>
          {/if}
          {#if page}
            <Panel title="Drafts" aside={drafts.length} data-feature="site.drafts">
              <DraftTray
                items={drafts.map((id) => ({ id, label: titleOf(id) }))}
                ondrop={(payload, t) => onDrop("draft", payload, t)}
                onputback={(id) => run((p) => fromDrafts(repo, p, id))}
              />
            </Panel>
            <Panel title="Bin" aside={bin.length} data-feature="site.bin">
              <BinTray
                items={bin.map((id) => ({ id, label: titleOf(id) }))}
                onrestore={(id) => run((p) => fromBin(repo, p, id))}
                onforget={(id) => {
                  if (run((p) => deleteForever(repo, p, id))) history()?.clear(); // a deleted record cannot come back under its id
                }}
              />
            </Panel>
          {/if}
        </div>
      </Inspector>
    {/snippet}
  </AppShell>
</div>
