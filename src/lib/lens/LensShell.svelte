<!--
  LensShell — the built-in Lenses view (ADR-022, ADR-025): the three panes (Collection | Focus |
  Context) over derived lenses, in the trail or reader layout. Owns the selection, the Focus mode
  (read | document | published, + editing) and the distinction per pane ("Tell apart by").
  Address (ADR-023): App owns the one popstate listener and passes the parsed `address` and the history
  `addressState` (the link trail) as props; one $effect re-applies them. This shell adds no window
  listener and writes the hash only through address.ts: picking or following a record and switching
  lens push, a distinction replaces, Go > Explorer pushes the address without the lens keys. Every trail
  move is history.go(-n), so the trail's Back and browser Back agree. The trail holds only links followed
  inside the current lens: a lens switch pushes history (browser Back returns to the old lens and record)
  and empties the trail. An unknown lens falls back to the first tab; an unresolvable id selects nothing.
  Every lens opens on a record inside its set: entered with no id, or switched to a set that lacks the
  selection, it selects its first member. Entering from the explorer returns to the last lens address of
  this session for the same repository (memory only). Edit is hidden while read-only. On a phone, picking
  or following a record closes the nav and inspector drawers. Sits on AppShell + Toolbar; no scoped style
  (lens.css).
-->
<script lang="ts" module>
  import type { Address } from "$lib/address.js";
  import type { SrsRepository } from "$lib/srs-client.js";

  /** The last lens address of this session, per loaded repository: memory only, no storage. */
  const lastVisit = new WeakMap<SrsRepository, Address>();
</script>

<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import {
    type CollectionBy,
    type ContextBy,
    type LensId,
    type TrailEntry,
    formatAddress,
    parseAddress,
    pushAddress,
    readTrail,
    replaceAddress,
  } from "$lib/address.js";
  import AppShell from "$lib/components/AppShell.svelte";
  import Breadcrumb from "$lib/components/Breadcrumb.svelte";
  import Button from "$lib/components/Button.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import InspectorTrigger from "$lib/components/InspectorTrigger.svelte";
  import Main from "$lib/components/Main.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import NavTrigger from "$lib/components/NavTrigger.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import Select from "$lib/components/Select.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import { BASE_GROUPS } from "$lib/components/shell-actions.js";
  import type { EditorShellProps } from "$lib/editors/registry.js";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import {
    type UpdateRecordInput,
    containersForInstance,
    getContainer,
    listRelationTypes,
    updateRecord,
  } from "$lib/srs-client.js";
  import Collection from "./Collection.svelte";
  import Context from "./Context.svelte";
  import Focus from "./Focus.svelte";
  import LensSwitcher from "./LensSwitcher.svelte";
  import {
    type CollectionData,
    type ContextGroupData,
    type ContextItem,
    type FocusData,
    type Item,
    type Shown,
    containersOf,
    expandItem,
    groupEdges,
    loadBlocks,
    loadCollection,
    loadContainerBlocks,
    loadDocument,
    loadEdges,
    loadRead,
    shownIn,
    tryRecord,
  } from "./lens-data.js";
  import { collectionOptions, groupItems, splitByBoundary } from "./lens-distinctions.js";
  import { type Layout, type Lens, defaultBy, defaultContext, deriveLenses } from "./lens.js";
  import { lensActions } from "./toolbar-actions.js";

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
    /** Opened from a link (ADR-021): no Edit. */
    readOnly?: boolean;
    /** Document > Save a copy…; given only while `readOnly`. */
    onSaveCopy?: () => void;
    /** The parsed hash, kept by App's one popstate listener. */
    address: Address;
    /** history.state at that address (carries the link trail). */
    addressState: unknown;
  } = $props();

  const shell = new ShellState({ wideEnabled: true });
  const EMPTY: CollectionData = { items: [], columns: [], total: 0 };

  // ── Lenses: derived from the engine, re-derived after a write ──
  const lenses = $derived.by(() => {
    void documentRevision;
    try {
      return deriveLenses(repo);
    } catch {
      return [];
    }
  });
  /** Navigation sections are the tabs; with none, the first composition or type lens is the only tab. */
  const tabs = $derived.by(() => {
    const nav = lenses.filter((l) => l.id.startsWith("nav:"));
    if (nav.length > 0) return nav;
    const first = lenses.find((l) => l.id.startsWith("comp:") || l.id.startsWith("type:"));
    return first ? [first] : lenses.slice(0, 1);
  });
  const more = $derived(lenses.filter((l) => !tabs.includes(l)));
  const firstLens = (): Lens | undefined => tabs[0] ?? lenses[0];

  let lensId = $state<LensId | null>(null);
  const lens = $derived(lenses.find((l) => l.id === lensId) ?? firstLens());
  let selectedId = $state<string | null>(null);
  /** The Collection's distinction as chosen (null = the kind default). */
  let by = $state<CollectionBy | null>(null);
  /** The Context's distinction as chosen (null = Link type). */
  let ctxBy = $state<ContextBy | null>(null);
  let trail = $state<TrailEntry[]>([]);
  let layout = $state<Layout>("trail");
  let mode = $state<"read" | "document" | "published">("read");
  /** The container of the last picked section entry: the page Document shows. */
  let hint = $state<string | undefined>();
  /** The selected item's label as the list showed it (a note has no record to read it from). */
  let picked = $state("");
  let editing = $state(false);
  let saveError = $state<string | null>(null);
  let savingRecord = $state(false);
  let error = $state<string | null>(null);
  let railOpen = $state(false);
  let collection = $state<CollectionData>(EMPTY);
  let expanded = $state(new Set<string>());

  const fail = (e: unknown) => (error = e instanceof Error ? e.message : String(e));

  // ── The address ──
  /** This view's address: lens keys only (essay keys belong to Essay). */
  const current = (): Address => ({
    lens: lens?.id,
    instanceId: selectedId ?? undefined,
    by: by ?? undefined,
    ctxBy: ctxBy ?? undefined,
  });
  const resolvable = (id: string): boolean => {
    if (collection.items.some((i) => i.id === id) || tryRecord(repo, id)) return true;
    try {
      return containersForInstance(repo, id).length > 0;
    } catch {
      return false;
    }
  };

  // App's address changed (mount, Back/Forward, a pasted link, a script writing location.hash): re-apply it.
  $effect(() => {
    const a = address;
    const state = addressState;
    untrack(() => apply(a, state));
  });

  let applied = false;
  function apply(given: Address, state: unknown): void {
    // An address without a lens after mount means App is leaving Lenses: nothing to apply.
    if (applied && !given.lens) return;
    // Entering from the explorer returns to where this session last left Lenses on this repository.
    const entering = !applied && !given.lens;
    const a = (entering && lastVisit.get(repo)) || given;
    applied = true;
    const target = lenses.find((l) => l.id === a.lens) ?? firstLens();
    lensId = target?.id ?? null;
    load(target);
    by = a.by ?? null;
    ctxBy = a.ctxBy ?? null;
    trail = readTrail(state);
    // An explicit id wins when it resolves and selects nothing when it does not; no id opens on the first member.
    if (a.instanceId) selectedId = resolvable(a.instanceId) ? a.instanceId : null;
    else selectedId = collection.items[0]?.id ?? null;
    picked = collection.items.find((i) => i.id === selectedId)?.label ?? "";
    if (selectedId) reveal(selectedId);
    editing = false;
    // Entering from the explorer is a navigation (Back returns there); a link is only normalised.
    if (entering) pushAddress(current(), trail);
    else if (formatAddress(current()) !== formatAddress(a)) replaceAddress(current(), trail);
  }

  /** A fresh collection for `l`, with the lens's own focus mode. */
  function load(l: Lens | undefined): void {
    expanded = new Set();
    hint = undefined;
    mode = l?.focus.kind ?? "read";
    if (!l) {
      collection = EMPTY;
      return;
    }
    try {
      collection = loadCollection(repo, l);
      error = null;
    } catch (e) {
      collection = EMPTY;
      fail(e);
    }
  }

  onDestroy(() => {
    if (repo && lens) lastVisit.set(repo, current());
  });

  // A write (Edit > Save, an agent) re-reads the set; selection and distinctions stay.
  let seenRevision = untrack(() => documentRevision);
  $effect(() => {
    const r = documentRevision;
    untrack(() => {
      if (r === seenRevision) return;
      seenRevision = r;
      const keep = expanded;
      load(lens);
      for (const i of collection.items) if (keep.has(i.id)) expand(i);
    });
  });

  /** Show a selection held in a nested section: expand the entry whose container holds it. */
  function reveal(id: string): void {
    const here = collection.items.find((i) => i.id === id);
    if (here) {
      if (here.sectionContainerId) hint = here.sectionContainerId;
      return;
    }
    try {
      const holders = new Set(containersForInstance(repo, id).map((c) => c.containerId));
      const parent = collection.items.find(
        (i) => i.sectionContainerId && holders.has(i.sectionContainerId) && !expanded.has(i.id)
      );
      if (parent) {
        hint = parent.sectionContainerId;
        expand(parent);
      }
    } catch {
      // A selection the engine cannot place stays selected, outside the set.
    }
  }

  function expand(item: Item): void {
    const next = new Set(expanded);
    const at = collection.items.findIndex((i) => i.id === item.id);
    if (at < 0) return;
    if (next.has(item.id)) {
      next.delete(item.id);
      const rest = collection.items.slice(at + 1);
      const end = rest.findIndex((i) => i.depth <= item.depth);
      collection = {
        ...collection,
        items: [...collection.items.slice(0, at + 1), ...rest.slice(end < 0 ? rest.length : end)],
      };
    } else {
      next.add(item.id);
      try {
        const children = expandItem(repo, item);
        collection = {
          ...collection,
          items: [...collection.items.slice(0, at + 1), ...children, ...collection.items.slice(at + 1)],
        };
      } catch (e) {
        fail(e);
      }
    }
    expanded = next;
  }

  function more_(): void {
    if (!lens) return;
    try {
      collection = loadCollection(repo, lens, collection.items.length);
    } catch (e) {
      fail(e);
    }
  }

  // ── Distinctions ──
  const isOutline = $derived(lens?.collection.kind === "outline");
  const byOptions = $derived(collectionOptions(collection.items, isOutline));
  const kindBy = $derived(lens ? defaultBy(lens.collection) : "type");
  const effectiveBy = $derived<CollectionBy>(by && byOptions.some((o) => o.value === by) ? by : kindBy);
  const effectiveCtxBy = $derived<ContextBy>(ctxBy ?? "link-type");
  // ponytail: presentation limit, no ADR-025 gap — one containersForInstance per member, only while "Container" is chosen.
  const containerTitles = $derived.by(() => {
    if (effectiveBy !== "container") return new Map<string, string[]>();
    return new Map(
      collection.items.map((i) => {
        try {
          return [i.id, containersForInstance(repo, i.id).map((c) => c.title)];
        } catch {
          return [i.id, []];
        }
      })
    );
  });
  const grouped = $derived<CollectionData>({
    ...collection,
    items: groupItems(collection.items, effectiveBy, {
      containersOf: (id) => containerTitles.get(id) ?? [],
      kindDefault: kindBy,
    }),
  });
  function setBy(b: CollectionBy): void {
    by = b;
    replaceAddress(current(), trail);
  }
  function setCtxBy(b: ContextBy): void {
    ctxBy = b;
    replaceAddress(current(), trail);
  }

  // ── Selection and the link trail (one history, ADR-023) ──
  /** On a phone, a pick or a followed link shows its result: the nav and inspector drawers close. */
  const closeDrawers = () => {
    if (shell.navDrawer) shell.navOpen = false;
    if (shell.inspectorDrawer) shell.inspectorOpen = false;
  };
  function select(item: { id: string; label: string; sectionContainerId?: string }): void {
    selectedId = item.id;
    if (item.sectionContainerId) hint = item.sectionContainerId;
    picked = item.label;
    editing = false;
    saveError = null;
    closeDrawers();
  }
  /** A pick from the Collection or a Document block starts a new walk: the trail clears. */
  function pick(item: { id: string; label: string; sectionContainerId?: string }): void {
    trail = [];
    select(item);
    pushAddress(current(), trail);
  }
  /** Following a link: remember where we were, then select. */
  function follow(item: ContextItem): void {
    if (selectedId && selectedId !== item.id) trail = [...trail, { id: selectedId, label: selectedLabel }];
    select(item);
    pushAddress(current(), trail);
  }
  /** Every trail move is history.go(-n); App's popstate re-applies the address it lands on. */
  const back = (n = 1) => history.go(-n);
  /**
   * Every lens opens on a record inside its set. The selection stays when the new set holds it (a nested
   * section holding it expands); otherwise the set's first member is selected. `keepSelection` ("Shown
   * in") keeps it even outside the set. The switch pushes, so browser Back returns to the old lens and
   * record; the visible trail starts empty in the new lens (it holds links followed inside one lens).
   */
  function switchLens(id: LensId, keepSelection = false): void {
    if (id === lens?.id) return;
    lensId = id;
    load(lenses.find((l) => l.id === id));
    by = null;
    trail = [];
    editing = false;
    if (selectedId) reveal(selectedId);
    const held = !!selectedId && collection.items.some((i) => i.id === selectedId);
    if (!held && !(keepSelection && selectedId)) {
      const first = collection.items[0];
      if (first) select(first);
      else selectedId = null;
    }
    pushAddress(current(), trail);
  }
  function openExplorer(): void {
    const a = parseAddress(location.hash);
    pushAddress({ essayId: a.essayId, paragraphId: a.paragraphId, zoomId: a.zoomId });
    onOpenExplorer?.();
  }

  // ── Focus ──
  const inSet = $derived(new Set(collection.items.map((i) => i.id)));
  const documentContainer = $derived(
    lens?.collection.kind === "outline" ? (hint ?? lens.collection.containerId) : undefined
  );
  const focus = $derived.by<FocusData>(() => {
    const id = selectedId;
    void documentRevision;
    if (!id || !lens) return { kind: "none" };
    try {
      if (mode === "published")
        return loadDocument(repo, id, lens.focus.kind !== "read" ? lens.focus.compositionId : undefined, documentContainer);
      if (mode === "document" && documentContainer) {
        const page = loadContainerBlocks(repo, documentContainer);
        if (page.head?.id === id || page.blocks.some((b) => b.id === id))
          return { kind: "blocks", title: lens.label, head: page.head, blocks: page.blocks };
      }
      if (mode === "document" && !documentContainer && inSet.has(id))
        return { kind: "blocks", title: lens.label, blocks: loadBlocks(repo, collection.items) };
      return { kind: "read", block: loadRead(repo, id, picked) };
    } catch {
      return { kind: "read", block: loadRead(repo, id, picked) };
    }
  });
  const canEdit = $derived(!readOnly && !!selectedId && mode !== "published" && !!tryRecord(repo, selectedId));

  function save(input: UpdateRecordInput): void {
    if (!selectedId) return;
    savingRecord = true;
    saveError = null;
    try {
      updateRecord(repo, selectedId, input);
      editing = false;
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    } finally {
      savingRecord = false;
    }
  }

  // ── Context: the record's own edges, one read (D10) ──
  let edges = $state<ContextItem[]>([]);
  let containers = $state<{ containerId: string; title: string }[]>([]);
  let shown = $state<Shown[]>([]);
  $effect(() => {
    const id = selectedId;
    void documentRevision;
    untrack(() => {
      edges = [];
      containers = [];
      shown = [];
      if (!id) return;
      try {
        edges = loadEdges(repo, id);
        const cs = containersOf(repo, id);
        containers = cs.map((c) => ({ containerId: c, title: getContainer(repo, c).title }));
        shown = shownIn(repo, cs).filter((s) => lenses.some((l) => l.id === `comp:${s.compositionId}`));
      } catch (e) {
        fail(e);
      }
    });
  });
  const relationTypes = $derived.by(() => {
    void documentRevision;
    try {
      return listRelationTypes(repo);
    } catch {
      return [];
    }
  });
  const groups = $derived.by<ContextGroupData[]>(() => {
    const flat = (label: string, items: ContextItem[]): ContextGroupData => ({
      def: { label, relationType: "", direction: "out" },
      total: items.length,
      items,
    });
    if (effectiveCtxBy === "none") return [flat("Links", edges)];
    if (effectiveCtxBy === "boundary") {
      const { inside, outside } = splitByBoundary(edges, inSet);
      return [flat("Inside this set", inside), flat("Leaving this set", outside)];
    }
    return groupEdges(edges, defaultContext(edges, relationTypes));
  });

  const selectedLabel = $derived(
    collection.items.find((i) => i.id === selectedId)?.label ??
      (focus.kind === "read" ? focus.block.label : undefined) ??
      (picked || selectedId?.slice(0, 8) || "")
  );
  // Only after following a link out of the set.
  const outside = $derived(
    trail.length > 0 && selectedId && collection.items.length > 0 && !inSet.has(selectedId)
      ? `Not in this set — showing ${lens?.label ?? ""}`
      : undefined
  );
  const crumbs = $derived([
    ...trail.map((t, i) => ({ label: t.label, onclick: () => back(trail.length - i) })),
    { label: selectedLabel },
  ]);

  const layouts: { value: Layout; label: string }[] = [
    { value: "trail", label: "Trail" },
    { value: "reader", label: "Reader" },
  ];
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

{#snippet collectionPane()}
  <Collection
    data={grouped}
    {selectedId}
    {expanded}
    onDark
    note={outside}
    by={effectiveBy}
    {byOptions}
    onBy={setBy}
    onSelect={pick}
    onExpand={expand}
    onMore={more_}
  />
{/snippet}

{#snippet focusPane()}
  {#if trail.length > 0}
    <nav class="lens-trail" aria-label="Link trail" data-testid="lens-trail">
      <Button size="sm" data-testid="lens-back" onclick={() => back(1)}>Back</Button>
      <Breadcrumb items={crumbs} />
    </nav>
  {/if}
  <Focus
    data={focus}
    {mode}
    {editing}
    {selectedId}
    published={lens?.focus.kind === "published" || shown.length > 0}
    onMode={(m) => {
      mode = m;
      editing = false;
    }}
    onEdit={canEdit ? () => (editing = !editing) : undefined}
    onSelect={(id) => {
      const item = collection.items.find((i) => i.id === id);
      const block = focus.kind === "blocks" ? [focus.head, ...focus.blocks].find((b) => b?.id === id) : undefined;
      pick(item ?? { id, label: block?.label ?? "" });
    }}
    onSave={canEdit ? save : undefined}
    saving={savingRecord}
    {saveError}
  />
{/snippet}

{#snippet contextPane()}
  {#key selectedId}
    <Context
      {groups}
      {containers}
      {shown}
      by={effectiveCtxBy}
      onBy={setCtxBy}
      onPick={follow}
      onShow={(s) => switchLens(`comp:${s.compositionId}`, true)}
    />
  {/key}
{/snippet}

{#snippet navPane()}
  <Nav repo={documentTitle} eyebrow={`Lens · ${lens?.label ?? ""}`} wordmark>
    <div class="lens-nav-head">
      <Button size="sm" variant="mono" onDark data-testid="lens-explorer" onclick={openExplorer}>Explorer</Button>
    </div>
    {@render collectionPane()}
  </Nav>
{/snippet}

{#snippet mainPane()}
  <Main>
    {#snippet bar()}
      <Toolbar title={selectedLabel || documentTitle} actions={barActions} groups={BASE_GROUPS}>
        {#snippet lead()}<NavTrigger />{/snippet}
        {#snippet trail()}<InspectorTrigger />{/snippet}
        {#snippet status()}
          {#if documentDirty}<span data-testid="document-dirty-status" role="status">Unsaved changes</span>{/if}
          <label class="lens-layout">
            <span>Layout</span>
            <Select bind:value={layout} options={layouts} data-testid="lens-layout" />
          </label>
        {/snippet}
      </Toolbar>
    {/snippet}
    {#if !onSave && readOnlyReason}<Notice kind="info" testid="read-only-note">{readOnlyReason}</Notice>{/if}
    {#if lens}<LensSwitcher {tabs} {more} active={lens.id} onPick={(id) => switchLens(id)} />{/if}
    {#if error}<Notice kind="error">{error}</Notice>{/if}
    <div class="workspace lens-main" data-layout={layout}>
      {#if layout === "reader"}
        <div class="lens-reader__focus">{@render focusPane()}</div>
        <aside class="lens-rail" class:lens-rail--open={railOpen} data-testid="lens-rail" aria-label="Links">
          {#if railOpen}
            <Button size="sm" class="lens-rail__close" aria-expanded="true" aria-controls="lens-rail-panel" onclick={() => (railOpen = false)}>Hide links</Button>
          {:else}
            <Button
              size="sm"
              class="lens-rail__tab"
              data-testid="lens-rail-tab"
              aria-label={`Show links (${edges.length})`}
              aria-expanded="false"
              aria-controls="lens-rail-panel"
              onclick={() => (railOpen = true)}
            >
              Links <span data-testid="lens-rail-count">{edges.length}</span>
            </Button>
          {/if}
          <div id="lens-rail-panel" hidden={!railOpen}>
            {#if railOpen}{@render contextPane()}{/if}
          </div>
        </aside>
      {:else}
        {@render focusPane()}
      {/if}
    </div>
  </Main>
{/snippet}

{#snippet inspectorPane()}
  <Inspector label="Context">
    {@render contextPane()}
  </Inspector>
{/snippet}

<div class="lens-shell" data-testid="lens-shell" data-layout={layout}>
  <AppShell
    {shell}
    nav={navPane}
    main={mainPane}
    inspector={layout === "reader" ? undefined : inspectorPane}
    navLabel="Collection"
    inspectorLabel="Context"
  />
</div>
