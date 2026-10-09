<!--
  LensShell — the three panes (Collection | Focus | Context) in one of four layouts, parameterised by a
  Lens (plans/ux-lenses.md §2). Owns {lensId, selectedId} and the address `#repo=&lens=&id=`.
  Switching lens keeps the selected record: the Collection re-roots to the entry whose nested container
  holds it (containersForInstance ∩ collection), Focus re-renders in the new focus kind, Context swaps
  its groups. Layouts: trail (list | focus | context), reader (thin outline | wide document | context
  below), board (table | focus + context in the inspector), graph (list | RelationGraph | focus + context).
  Sits on AppShell + Toolbar; no scoped style (lens.css).
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
  import Panel from "$lib/components/Panel.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import RelationGraph from "$lib/generic/RelationGraph.svelte";
  import { focusLayout } from "$lib/generic/map-layout.js";
  import { ShellState } from "$lib/shell-context.svelte.js";
  import { type SrsRepository, type UpdateRecordInput, containersForInstance, getContainer, updateRecord } from "$lib/srs-client.js";
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
    graphEdges,
    loadCollection,
    loadDocument,
    loadGroup,
    loadReading,
    shownIn,
  } from "./lens-data.js";
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
  const lenses = $derived([...curated, ...extra]);
  const hash = () => new URLSearchParams(location.hash.slice(1));
  const initial = hash();

  let lensId = $state(initial.get("lens") ?? (curated[0] ?? extra[0]).id);
  let selectedId = $state<string | null>(initial.get("id"));
  const lens = $derived(lenses.find((l) => l.id === lensId) ?? lenses[0]);
  let layout = $state<Layout>("trail");
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

  let collection = $state<CollectionData>({ items: [], columns: [], total: 0 });
  let expanded = $state(new Set<string>());
  let focus = $state<FocusData>({ kind: "none" });
  let groups = $state<ContextGroupData[]>([]);
  let containers = $state<{ containerId: string; title: string }[]>([]);
  let shown = $state<Shown[]>([]);

  const defaults = $derived(defaultContext(repo));
  const contextDefs = $derived(lens.context.length > 0 ? lens.context : defaults);

  const fail = (e: unknown) => (error = e instanceof Error ? e.message : String(e));

  // The lens changes: its layout, a fresh collection, then re-root to the selection.
  $effect(() => {
    const l = lens;
    untrack(() => {
      layout = l.layout;
      doc = null;
      editing = false;
      expanded = new Set();
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
    if (next.has(item.id)) {
      next.delete(item.id);
      const at = collection.items.findIndex((i) => i.id === item.id);
      const rest = collection.items.slice(at + 1);
      const end = rest.findIndex((i) => i.depth <= item.depth);
      collection = {
        ...collection,
        items: [...collection.items.slice(0, at + 1), ...rest.slice(end < 0 ? rest.length : end)],
      };
    } else {
      next.add(item.id);
      const at = collection.items.findIndex((i) => i.id === item.id);
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

  function select(item: Item | ContextItem): void {
    selectedId = item.id;
    hint = "sectionContainerId" in item ? item.sectionContainerId : undefined;
    picked = item.label;
    doc = null;
    editing = false;
    if (shell.inspectorDrawer) setTimeout(() => (shell.inspectorOpen = true), 0);
  }

  // The selection (or the focus kind) changes: Focus and Context follow.
  $effect(() => {
    const id = selectedId;
    const l = lens;
    const e = editing;
    const d = doc;
    const defs = contextDefs;
    untrack(() => {
      if (!id) {
        focus = { kind: "none" };
        groups = [];
        containers = [];
        shown = [];
        return;
      }
      try {
        const f = l.focus;
        focus = d
          ? loadDocument(repo, id, d.compositionId, d.containerId)
          : f.kind === "document" && !e
            ? loadDocument(repo, id, f.compositionId, hint)
            : loadReading(repo, id, e ? "form" : "reading", picked);
        groups = defs.map((def) => loadGroup(repo, id, def));
        const cs = containersOf(repo, id);
        containers = cs.map((c) => ({ containerId: c, title: getContainer(repo, c).title }));
        shown = shownIn(repo, cs);
        error = null;
      } catch (err) {
        fail(err);
      }
    });
  });

  // The address: one URL per selection (#426).
  $effect(() => {
    const p = hash();
    p.set("lens", lensId);
    if (selectedId) p.set("id", selectedId);
    else p.delete("id");
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
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  const graph = $derived.by(() => {
    if (layout !== "graph" || !selectedId) return null;
    try {
      const first = lens.context[0]?.relationType;
      const edges = graphEdges(repo, selectedId, first);
      // The lens's first relation type, else every edge, so the graph is never blank for a related record.
      return focusLayout(edges.length > 0 || !first ? edges : graphEdges(repo, selectedId));
    } catch {
      return null;
    }
  });
  const selectedLabel = $derived(
    collection.items.find((i) => i.id === selectedId)?.label ??
      (focus.kind === "reading" || focus.kind === "form" ? focus.record.displayLabel : undefined) ??
      selectedId?.slice(0, 8) ??
      ""
  );
  const layouts: Layout[] = ["trail", "reader", "board", "graph"];
</script>

{#snippet switcher()}
  <LensSwitcher {curated} {extra} active={lensId} onPick={(id) => (lensId = id)} />
{/snippet}

{#snippet list(onDark: boolean)}
  <Collection data={collection} mode="list" {selectedId} {expanded} {onDark} onSelect={select} onExpand={expand} onMore={more} />
{/snippet}

{#snippet focusPane()}
  <Focus data={focus} onEdit={focus.kind === "document" ? undefined : () => (editing = !editing)} onSave={save} {saving} {saveError} />
{/snippet}

{#snippet contextPane()}
  <Context {groups} {containers} {shown} onPick={select} onShow={(s) => (doc = s)} onMore={moreNeighbours} />
{/snippet}

{#snippet navPane()}
  <Nav repo={title} eyebrow={lens.label} wordmark>
    {@render switcher()}
    {@render list(true)}
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
    {#if error}<Notice kind="error">{error}</Notice>{/if}
    <div class="workspace lens-main" data-layout={layout}>
      {#if layout === "board"}
        <div class="lens-board">
          {@render switcher()}
          <Collection data={collection} mode="table" {selectedId} onSelect={select} onMore={more} />
        </div>
      {:else if layout === "graph"}
        {#if graph && graph.placed.length > 0}
          <RelationGraph view="focus" focus={{ id: selectedId ?? "", label: selectedLabel }} layout={graph} onOpen={(id) => select({ id, label: "" })} />
        {:else}
          <p class="lens-empty">{selectedId ? "No relations of this kind." : "Select a record to see its relations."}</p>
        {/if}
      {:else}
        {@render focusPane()}
        {#if layout === "reader"}
          <Panel title="Context" open={false} class="lens-reader-context">{@render contextPane()}</Panel>
        {/if}
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
