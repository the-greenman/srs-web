<!--
  LensShell — the three panes (Collection | Focus | Context) in one of four layouts, parameterised by a
  Lens (plans/ux-lenses.md §2, §7). Owns the selection, the Focus mode (read | document, + editing), the
  distinction per pane ("Tell apart by") and the working set drawn by hand. Address:
  `#repo=&lens=&id=&by=&ctxby=` (the working set stays out of the hash: memory + localStorage).
  Switching lens keeps the selection (the Collection re-roots to the entry whose nested container holds
  it); switching a distinction keeps both set and selection. Layouts: trail (list | focus | context),
  reader (thin outline | wide focus | Context as a collapsed right rail), board (table | focus + context
  in the drawer), graph (list | RelationGraph, edges inside vs leaving the set | focus + context).
  Following a link keeps a short trail above Focus with Back. Sits on AppShell + Toolbar; no scoped
  style (lens.css).
-->
<script lang="ts">
  import { untrack } from "svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import InspectorTrigger from "$lib/components/InspectorTrigger.svelte";
  import Main from "$lib/components/Main.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import NavTrigger from "$lib/components/NavTrigger.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import RelationGraph from "$lib/generic/RelationGraph.svelte";
  import { focusLayout } from "$lib/generic/map-layout.js";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import {
    type SrsRepository,
    type UpdateRecordInput,
    containersForInstance,
    getContainer,
    neighbours,
    repositoryId,
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
    allEdges,
    containersOf,
    expandItem,
    graphEdges,
    loadBlocks,
    loadCollection,
    loadDocument,
    loadGroup,
    loadRead,
    selectFields,
    shownIn,
    tryRecord,
  } from "./lens-data.js";
  import {
    type CtxBy,
    collectionOptions,
    groupItems,
    sharedFields,
    splitByBoundary,
  } from "./lens-distinctions.js";
  import { type Layout, type Lens, defaultContext } from "./lens.js";

  let {
    repo,
    title,
    curated,
    extra,
  }: {
    repo: SrsRepository;
    title: string;
    curated: Lens[];
    /** Derived lenses. */
    extra: Lens[];
  } = $props();

  const shell = new ShellState();
  const hash = () => new URLSearchParams(location.hash.slice(1));
  const initial = hash();

  // ── The working set: drawn by hand, kept in memory and localStorage (never the hash) ──
  const SET_KEY = `lens-set:${repositoryId(repo)}`;
  type Member = { id: string; label: string };
  function readSet(): Member[] {
    try {
      const v = JSON.parse(localStorage.getItem(SET_KEY) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  const saved = readSet();
  let working = $state<Member[]>(saved);
  $effect(() => {
    const w = JSON.stringify(working);
    try {
      localStorage.setItem(SET_KEY, w);
    } catch {
      // Private window or blocked storage: the set lives in memory only.
    }
  });
  const checked = $derived(new Set(working.map((w) => w.id)));
  /** The ids behind the "My set" lens, fixed when it was shown (grown by "Add everything"). */
  let mySet = $state<string[] | null>(
    initial.get("lens") === "set" && saved.length > 0 ? saved.map((w) => w.id) : null
  );
  let picking = $state(false);

  const setLens = $derived<Lens | null>(
    mySet
      ? {
          id: "set",
          label: "My set",
          collection: { kind: "ids", ids: mySet },
          focus: { kind: "read" },
          context: [],
          layout: "trail",
          by: "type",
          ctxBy: "boundary",
        }
      : null
  );
  const tabs = $derived(setLens ? [...curated, setLens] : curated);
  const lenses = $derived([...tabs, ...extra]);

  let lensId = $state(initial.get("lens") ?? (curated[0] ?? extra[0]).id);
  let selectedId = $state<string | null>(initial.get("id"));
  const lens = $derived(lenses.find((l) => l.id === lensId) ?? lenses[0]);
  let layout = $state<Layout>("trail");
  let mode = $state<"read" | "document">("read");
  let by = $state(initial.get("by") ?? "");
  let ctxBy = $state<CtxBy>((initial.get("ctxby") as CtxBy) ?? "link");
  /** The selected item's nested container, a hint for document focus (a navigation section). */
  let hint = $state<string | undefined>();
  /** The selected item's label as the list showed it (a note has no record to read it from). */
  let picked = $state("");
  /** "Shown in" pick: show this composition instead of the lens focus. */
  let doc = $state<Shown | null>(null);
  let editing = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let error = $state<string | null>(null);
  /** Bumped by a save so Focus re-reads the record. */
  let version = $state(0);
  let railOpen = $state(false);

  let collection = $state<CollectionData>({ items: [], columns: [], total: 0 });
  let expanded = $state(new Set<string>());
  let groups = $state<ContextGroupData[]>([]);
  let containers = $state<{ containerId: string; title: string }[]>([]);
  let shown = $state<Shown[]>([]);
  let linkCount = $state(0);
  /** Records left by following links (Context, graph), oldest first; cleared by a Collection pick. */
  let trail = $state<{ id: string; label: string }[]>([]);

  const defaults = $derived(defaultContext(repo));
  const contextDefs = $derived(lens.context.length > 0 ? lens.context : defaults);
  /** Document source: a composition (site pages, spec Parts, any lens naming one) or the Collection itself. */
  const docFromComposition = $derived(
    lens.focus.kind === "document" && (!!lens.focus.compositionId || lens.collection.kind === "navigation")
  );
  const inSet = $derived(new Set(collection.items.map((i) => i.id)));

  const fail = (e: unknown) => (error = e instanceof Error ? e.message : String(e));
  const defaultBy = (l: Lens) =>
    l.by ?? (["outline", "navigation", "composition"].includes(l.collection.kind) ? "nesting" : "type");
  const defaultCtxBy = (l: Lens): CtxBy => l.ctxBy ?? (l.layout === "graph" ? "boundary" : "link");

  // A new lens: its layout, focus mode and default distinctions (the hash wins on first load).
  let firstLens = true;
  const lensKey = $derived(lens.id);
  $effect(() => {
    lensKey;
    untrack(() => {
      layout = lens.layout;
      mode = lens.focus.kind;
      if (!firstLens || !by) by = defaultBy(lens);
      if (!firstLens || !initial.get("ctxby")) ctxBy = defaultCtxBy(lens);
      firstLens = false;
      doc = null;
      editing = false;
      expanded = new Set();
    });
  });

  // The lens's set changes (a new lens, or "My set" grew): a fresh collection, re-rooted to the selection.
  $effect(() => {
    const l = lens;
    untrack(() => {
      try {
        collection = loadCollection(repo, l);
        error = null;
        reroot();
      } catch (e) {
        collection = { items: [], columns: [], total: 0 };
        fail(e);
      }
    });
  });

  /** Expand the entry whose nested container holds the selection, so the list shows where it is. */
  function reroot(): void {
    const id = selectedId;
    if (!id) {
      const first = collection.items[0];
      if (first) select(first);
      return;
    }
    if (collection.items.some((i) => i.id === id)) return;
    const holders = new Set(containersForInstance(repo, id).map((c) => c.containerId));
    const parent = collection.items.find((i) => i.sectionContainerId && holders.has(i.sectionContainerId));
    if (parent) expand(parent);
  }

  function expand(item: Item): void {
    const next = new Set(expanded);
    const at = collection.items.findIndex((i) => i.id === item.id);
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

  function more(): void {
    try {
      collection = loadCollection(repo, lens, collection.items.length);
    } catch (e) {
      fail(e);
    }
  }

  // ── Distinctions ──
  const byOptions = $derived(
    collectionOptions(
      collection.items,
      selectFields(repo, collection.items),
      ["outline", "navigation", "composition"].includes(lens.collection.kind)
    )
  );
  const effectiveBy = $derived(byOptions.some((o) => o.value === by) ? by : "type");
  // ponytail: one containersForInstance per member, only while "Container" is chosen.
  const containerTitles = $derived.by(() => {
    if (effectiveBy !== "container") return new Map<string, string[]>();
    return new Map(collection.items.map((i) => [i.id, containersForInstance(repo, i.id).map((c) => c.title)]));
  });
  const grouped = $derived<CollectionData>({
    ...collection,
    items: groupItems(collection.items, effectiveBy, (id) => containerTitles.get(id) ?? []),
    columns:
      effectiveBy === "nothing"
        ? sharedFields(collection.items).map((n) => ({ name: n, label: n.replaceAll(/[-_]/g, " ") }))
        : collection.columns,
  });

  // ── Selection ──
  /** Follow a link: remember where we were, then select. */
  function follow(item: Item | ContextItem): void {
    if (selectedId && selectedId !== item.id)
      trail = [...trail, { id: selectedId, label: selectedLabel }].slice(-5);
    select(item);
  }

  /** Back to the record at `i` in the trail (default: the last one). */
  function back(i = trail.length - 1): void {
    const to = trail[i];
    trail = trail.slice(0, i);
    select(to);
  }

  function pick(item: Item): void {
    trail = [];
    select(item);
  }

  function select(item: Item | ContextItem): void {
    selectedId = item.id;
    hint = "sectionContainerId" in item ? item.sectionContainerId : undefined;
    picked = item.label;
    doc = null;
    editing = false;
    if (shell.inspectorDrawer) setTimeout(() => (shell.inspectorOpen = true), 0);
  }

  // Document from the Collection: every listed record as a block, recomputed only when the set changes.
  const blocks = $derived.by(() => {
    version;
    if (mode !== "document" || docFromComposition) return [];
    try {
      return loadBlocks(repo, collection.items);
    } catch {
      return [];
    }
  });

  const focus = $derived.by<FocusData>(() => {
    const id = selectedId;
    version;
    if (!id) return { kind: "none" };
    try {
      if (doc) return loadDocument(repo, id, doc.compositionId, doc.containerId);
      if (mode === "document" && !docFromComposition && inSet.has(id))
        return { kind: "blocks", title: lens.label, blocks };
      if (mode === "document" && docFromComposition && !editing)
        return loadDocument(repo, id, lens.focus.kind === "document" ? lens.focus.compositionId : undefined, hint);
      return { kind: "read", block: loadRead(repo, id, picked) };
    } catch {
      return { kind: "read", block: loadRead(repo, id, picked) };
    }
  });
  const canEdit = $derived(!!selectedId && !!tryRecord(repo, selectedId));

  // The selection (or the Context distinction) changes: Context follows.
  $effect(() => {
    const id = selectedId;
    const defs = contextDefs;
    const cb = ctxBy;
    const members = inSet;
    version;
    untrack(() => {
      if (!id) {
        groups = [];
        containers = [];
        shown = [];
        linkCount = 0;
        return;
      }
      try {
        linkCount = neighbours(repo, id, { limit: 1 }).total;
        if (cb === "link") {
          groups = defs.map((def) => loadGroup(repo, id, def));
          // A record reached by a link may have none of this lens's relations: show the defaults instead.
          if (defs !== defaults && groups.every((g) => g.total === 0))
            groups = defaults.map((def) => loadGroup(repo, id, def));
        } else {
          const edges = allEdges(repo, id);
          const group = (label: string, items: ContextItem[]): ContextGroupData => ({
            def: { label, relationType: "*", direction: "out" },
            total: items.length,
            items,
          });
          if (cb === "nothing") groups = [group("Links", edges)];
          else {
            const { inside, outside } = splitByBoundary(edges, members);
            groups = [group("Inside this set", inside), group("Leaving this set", outside)];
          }
        }
        const cs = containersOf(repo, id);
        containers = cs.map((c) => ({ containerId: c, title: getContainer(repo, c).title }));
        shown = shownIn(repo, cs);
        error = null;
      } catch (err) {
        fail(err);
      }
    });
  });

  // The address: one URL per selection (#426), plus the distinction per pane.
  $effect(() => {
    const p = hash();
    p.set("lens", lensId);
    if (selectedId) p.set("id", selectedId);
    else p.delete("id");
    p.set("by", by);
    p.set("ctxby", ctxBy);
    history.replaceState(null, "", `#${p}`);
  });

  function moreNeighbours(i: number): void {
    if (!selectedId) return;
    const g = groups[i];
    const page = loadGroup(repo, selectedId, g.def, g.items.length);
    groups[i] = { ...g, items: [...g.items, ...page.items], total: page.total };
  }

  function save(input: UpdateRecordInput): void {
    if (!selectedId) return;
    saving = true;
    saveError = null;
    try {
      updateRecord(repo, selectedId, input);
      editing = false;
      collection = loadCollection(repo, lens);
      version++;
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  // ── Drawing a set ──
  function addToSet(items: Member[]): void {
    const have = new Set(working.map((w) => w.id));
    const fresh = items.filter((i) => !have.has(i.id) && have.add(i.id));
    working = [...working, ...fresh.map((i) => ({ id: i.id, label: i.label }))];
    if (lensId === "set") mySet = working.map((w) => w.id);
  }
  function check(ids: string[], on: boolean): void {
    if (on) addToSet(ids.map((id) => ({ id, label: collection.items.find((i) => i.id === id)?.label ?? id })));
    else working = working.filter((w) => !ids.includes(w.id));
  }
  function addAll(): void {
    if (!selectedId) return;
    addToSet([{ id: selectedId, label: selectedLabel }, ...allEdges(repo, selectedId)]);
  }
  function showSet(): void {
    mySet = working.map((w) => w.id);
    picking = false;
    lensId = "set";
  }

  const graph = $derived.by(() => {
    if (layout !== "graph" || !selectedId) return null;
    try {
      const first = lens.context[0]?.relationType;
      let edges = graphEdges(repo, selectedId, first);
      // The lens's first relation type, else every edge, so the graph is never blank for a related record.
      if (edges.length === 0 && first) edges = graphEdges(repo, selectedId);
      // Edges told apart by the set boundary unless Context tells links apart by type.
      if (ctxBy !== "link")
        edges = edges.map((e) => ({ ...e, relationType: inSet.has(e.id) ? "inside the set" : "leaves the set" }));
      return focusLayout(edges);
    } catch {
      return null;
    }
  });
  const selectedLabel = $derived(
    collection.items.find((i) => i.id === selectedId)?.label ??
      (focus.kind === "read" ? focus.block.label : undefined) ??
      selectedId?.slice(0, 8) ??
      ""
  );
  const outside = $derived(
    selectedId && collection.items.length > 0 && !collection.items.some((i) => i.id === selectedId)
      ? `Not in this set — showing ${lens.label}`
      : undefined
  );
  const layouts: Layout[] = ["trail", "reader", "board", "graph"];
</script>

{#snippet switcher()}
  <LensSwitcher curated={tabs} {extra} active={lensId} onPick={(id) => (lensId = id)} />
{/snippet}

{#snippet collectionPane(listMode: "list" | "table", onDark: boolean)}
  <Collection
    data={grouped}
    mode={listMode}
    {selectedId}
    {expanded}
    {onDark}
    note={outside}
    by={effectiveBy}
    {byOptions}
    onBy={(b) => (by = b)}
    {picking}
    {checked}
    setSize={working.length}
    onPicking={() => (picking = !picking)}
    onCheck={check}
    onShowSet={showSet}
    onClearSet={() => (working = [])}
    onSelect={pick}
    onExpand={expand}
    onMore={more}
  />
{/snippet}

{#snippet focusPane()}
  {#if trail.length > 0}
    <nav class="lens-trail" aria-label="Path" data-testid="lens-trail">
      <button type="button" class="lens-trail__back" data-testid="lens-back" onclick={() => back()}>Back</button>
      <ol>
        {#each trail as t, i (`${i}:${t.id}`)}
          <li><button type="button" onclick={() => back(i)}>{t.label}</button></li>
        {/each}
        <li aria-current="page">{selectedLabel}</li>
      </ol>
    </nav>
  {/if}
  <Focus
    data={focus}
    {mode}
    {editing}
    {selectedId}
    onMode={(m) => {
      mode = m;
      doc = null;
    }}
    onEdit={canEdit ? () => (editing = !editing) : undefined}
    onSelect={(id) => {
      const item = collection.items.find((i) => i.id === id);
      if (item) pick(item);
    }}
    onSave={save}
    {saving}
    {saveError}
  />
{/snippet}

{#snippet contextPane()}
  <Context
    {groups}
    {containers}
    {shown}
    by={ctxBy}
    onBy={(b) => (ctxBy = b)}
    onPick={follow}
    onShow={(s) => (doc = s)}
    onMore={moreNeighbours}
    onAdd={(item) => addToSet([item])}
    onAddAll={addAll}
  />
{/snippet}

{#snippet navPane()}
  <Nav repo={title} eyebrow={lens.label} wordmark>
    {@render collectionPane("list", true)}
  </Nav>
{/snippet}

{#snippet mainPane()}
  <Main>
    {#snippet bar()}
      <Toolbar title={selectedLabel || title} actions={[]} groups={[]}>
        {#snippet lead()}<NavTrigger />{/snippet}
        {#snippet trail()}<InspectorTrigger />{/snippet}
        {#snippet status()}
          <label class="lens-layout">
            <span>Layout</span>
            <select bind:value={layout} data-testid="lens-layout">
              {#each layouts as l (l)}<option value={l}>{l}</option>{/each}
            </select>
          </label>
        {/snippet}
      </Toolbar>
    {/snippet}
    {@render switcher()}
    {#if error}<Notice kind="error">{error}</Notice>{/if}
    <div class="workspace lens-main" data-layout={layout}>
      {#if layout === "board"}
        <div class="lens-board">{@render collectionPane("table", false)}</div>
      {:else if layout === "graph"}
        {#if graph && graph.placed.length > 0}
          {#if ctxBy !== "link"}
            <p class="lens-empty" data-testid="lens-graph-key">Solid lines stay inside this set; dashed lines leave it.</p>
          {/if}
          <RelationGraph view="focus" focus={{ id: selectedId ?? "", label: selectedLabel }} layout={graph} onOpen={(id) => follow({ id, label: "" })} />
        {:else}
          <p class="lens-empty">{selectedId ? "No links of this kind." : "Select a record to see its links."}</p>
        {/if}
      {:else if layout === "reader"}
        <div class="lens-reader__focus">{@render focusPane()}</div>
        <aside class="lens-rail" class:lens-rail--open={railOpen} data-testid="lens-rail" aria-label="Links">
          {#if railOpen}
            <button type="button" class="lens-toggle lens-rail__close" aria-expanded="true" onclick={() => (railOpen = false)}>Hide links</button>
            {@render contextPane()}
          {:else}
            <button type="button" class="lens-rail__tab" data-testid="lens-rail-tab" aria-expanded="false" onclick={() => (railOpen = true)}>
              Links <span data-testid="lens-rail-count">{linkCount}</span>
            </button>
          {/if}
        </aside>
      {:else}
        {@render focusPane()}
      {/if}
    </div>
  </Main>
{/snippet}

{#snippet inspectorPane()}
  <Inspector label="Context">
    {#if layout === "board" || layout === "graph"}
      <div class="lens-inspector-focus">{@render focusPane()}</div>
    {/if}
    {@render contextPane()}
  </Inspector>
{/snippet}

<div class="lens-shell" data-testid="lens-shell" data-layout={layout}>
  <AppShell
    {shell}
    nav={layout === "board" ? undefined : navPane}
    main={mainPane}
    inspector={layout === "reader" ? undefined : inspectorPane}
    navLabel="Collection"
    inspectorLabel="Context"
  />
</div>
