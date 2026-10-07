<!--
  RecordsExplorer — Records and the container "search all" view. Owns the engine calls; RecordsView draws.
  Every count comes from the core: `find` returns `total` and `facets` over the whole filtered set, so
  nothing here loads records to count them. Search is debounced (200 ms) and ranked; with no search text a
  repository larger than one page is grouped by type, each group paged at 50 when opened. Real markdown
  rendering of labels is #479; here backticks are only stripped for display.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import Diagnostics from "$lib/components/Diagnostics.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import { diagnosticsFromStrings } from "$lib/notices.svelte.js";
  import { find } from "$lib/srs-client.js";
  import type { DiscoveryFacets, DiscoveryHit, DiscoveryQuery, SrsRepository } from "$lib/srs-client.js";
  import RecordsView, { type GroupView } from "./RecordsView.svelte";
  import { NOTES, PAGE, typeGroups } from "./records-model.js";

  let {
    repo,
    containerId = null,
    revision = 0,
    documentKey,
    onOpen,
    onSearchAll,
  }: {
    repo: SrsRepository;
    /** Scope every query to this container's membership (the Structure surface). */
    containerId?: string | null;
    /** Changes when the repository is mutated: counts and open groups reload. */
    revision?: number;
    documentKey: string;
    onOpen: (instanceId: string) => void;
    onSearchAll?: () => void;
  } = $props();

  let search = $state("");
  /** `search` after the debounce. */
  let query = $state("");
  let typeId = $state("");
  let error = $state<string | null>(null);
  let diagnostics = $state<string[]>([]);

  /** The scope without search or type filter: group counts, type options and the unfiltered first page. */
  let scope = $state<{ total: number; facets: DiscoveryFacets; hits: DiscoveryHit[] }>({
    total: 0,
    facets: { byType: [], otherTypes: 0, notes: 0 },
    hits: [],
  });
  let flat = $state<{ total: number; hits: DiscoveryHit[] }>({ total: 0, hits: [] });
  let opened = $state<Record<string, DiscoveryHit[]>>({});

  $effect(() => {
    const text = search.trim();
    const timer = setTimeout(() => (query = text), 200);
    return () => clearTimeout(timer);
  });

  const scoped = (): DiscoveryQuery => ({ containerId: containerId || undefined });
  const withType = (key: string): DiscoveryQuery => (key === NOTES ? { ...scoped(), tier: 0 } : { ...scoped(), typeId: key });

  const fail = (e: unknown) => (error = e instanceof Error ? e.message : String(e));

  /** Facets and the first page of the whole scope: depends on the container and mutations only. */
  function runScope(): void {
    try {
      const base = find(repo, scoped(), { limit: PAGE, byTypeLimit: 0, facets: true });
      scope = { total: base.total, facets: base.facets, hits: base.hits };
      diagnostics = base.diagnostics;
      error = null;
      for (const key of Object.keys(opened)) opened[key] = find(repo, withType(key), { limit: Math.max(PAGE, opened[key].length) }).hits;
    } catch (e: unknown) {
      fail(e);
      scope = { total: 0, facets: { byType: [], otherTypes: 0, notes: 0 }, hits: [] };
    }
  }

  /** The searched or type-filtered list: depends on the query, the type and mutations. */
  function runFlat(): void {
    if (!query && !typeId) return;
    try {
      const q: DiscoveryQuery = { ...(typeId ? withType(typeId) : scoped()), contentMatch: query || undefined };
      const page = find(repo, q, { limit: PAGE, rank: Boolean(query) });
      flat = { total: page.total, hits: page.hits };
    } catch (e: unknown) {
      fail(e);
      flat = { total: 0, hits: [] };
    }
  }

  // A mutation (revision) reloads both; a new scope remounts (the shell keys on it).
  $effect(() => {
    void [containerId, revision];
    untrack(runScope);
  });
  $effect(() => {
    void [query, typeId, containerId, revision];
    untrack(runFlat);
  });

  const options = $derived(typeGroups(scope.facets));
  const filtering = $derived(Boolean(query || typeId));
  const grouped = $derived(!filtering && scope.total > PAGE);

  const groups = $derived<GroupView[] | null>(
    grouped ? options.map((g) => ({ ...g, open: g.key in opened, hits: opened[g.key] ?? [] })) : null,
  );

  function toggle(key: string): void {
    if (key in opened) {
      delete opened[key];
      return;
    }
    try {
      opened[key] = find(repo, withType(key), { limit: PAGE }).hits;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function more(key: string | null): void {
    try {
      if (key === null) {
        const q: DiscoveryQuery = { ...(typeId ? withType(typeId) : scoped()), contentMatch: query || undefined };
        flat.hits = [...flat.hits, ...find(repo, q, { limit: PAGE, offset: flat.hits.length, rank: Boolean(query) }).hits];
      } else {
        opened[key] = [...opened[key], ...find(repo, withType(key), { limit: PAGE, offset: opened[key].length }).hits];
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<RecordsView
  bind:search
  bind:typeId
  typeOptions={options}
  searching={Boolean(query)}
  total={filtering ? flat.total : scope.total}
  {groups}
  hits={filtering ? flat.hits : scope.hits}
  {onOpen}
  onToggle={toggle}
  onMore={more}
  {onSearchAll}
>
  {#snippet notices()}
    {#if error}<Notice kind="error">{error}</Notice>{/if}
    <Diagnostics variant="notice" testid="record-diagnostics" diagnostics={diagnosticsFromStrings(diagnostics)} {documentKey} />
  {/snippet}
</RecordsView>
