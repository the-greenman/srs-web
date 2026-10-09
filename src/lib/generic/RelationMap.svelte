<!--
  RelationMap — the Map surface body. With a record selected it asks the core for that record's neighbours
  (bounded, labels inline: no per-node getRecord) and pages them 12 at a time; without one it draws the active
  container's relations, capped (map-layout.ts). Presentation is RelationGraph.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { neighbours, resolveContainerView } from "$lib/srs-client.js";
  import type { Neighbour, SrsRepository } from "$lib/srs-client.js";
  import Button from "$lib/components/Button.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import RelationGraph from "./RelationGraph.svelte";
  import { plainLabel } from "$lib/labels.js";
  import { CONTAINER_NODE_CAP, containerGraph, focusLayout } from "./map-layout.js";

  let {
    repo,
    selected,
    containerId,
    revision = 0,
    onOpen,
  }: {
    repo: SrsRepository;
    selected: { id: string; label: string } | null;
    containerId: string | null;
    /** Changes when the repository is mutated. */
    revision?: number;
    onOpen: (id: string) => void;
  } = $props();

  const NEIGHBOUR_PAGE = 12;
  let loaded = $state<Neighbour[]>([]);
  let total = $state(0);
  let error = $state<string | null>(null);

  function load(id: string, offset: number): void {
    try {
      const page = neighbours(repo, id, { limit: NEIGHBOUR_PAGE, offset });
      loaded = offset === 0 ? page.neighbours : [...loaded, ...page.neighbours];
      total = page.total;
      error = null;
    } catch (e: unknown) {
      loaded = [];
      total = 0;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    const id = selected?.id;
    void revision;
    untrack(() => {
      loaded = [];
      total = 0;
      if (id) load(id, 0);
    });
  });

  const layout = $derived(
    focusLayout(
      loaded.map((n) => ({
        id: n.neighbour.instanceId,
        label: n.neighbour.label,
        relationType: n.relationType,
        direction: n.direction,
      })),
    ),
  );

  const container = $derived.by(() => {
    if (selected || !containerId) return null;
    try {
      const members = resolveContainerView(repo, containerId).members.map((m) => ({
        id: m.instanceId,
        label: plainLabel(m.displayLabel, m.instanceId.slice(0, 8)),
      }));
      // Edges among the kept members only: one bounded neighbours read each, never the container's whole relation set.
      const kept = new Set(members.slice(0, CONTAINER_NODE_CAP).map((m) => m.id));
      const edges = [...kept].flatMap((id) =>
        neighbours(repo, id, { direction: "out", limit: 100 })
          .neighbours.filter((n) => kept.has(n.neighbour.instanceId))
          .map((n) => ({ relationId: n.relationId, relationType: n.relationType, source: id, target: n.neighbour.instanceId })),
      );
      return { graph: containerGraph(members, edges), error: null };
    } catch (e: unknown) {
      // A failed read is an error, not an empty scope (srs-web#483).
      return { graph: null, error: e instanceof Error ? e.message : String(e) };
    }
  });
</script>

{#if error}<Notice kind="error">{error}</Notice>{/if}
{#if selected}
  {#if total === 0 && !error}
    <p class="generic-muted">This record has no relations.</p>
  {:else if total > 0}
    <p class="generic-muted" data-testid="map-note">
      Direct relations of the selected record: inbound on the left, outbound on the right.
      {#if total > loaded.length}Showing {loaded.length} of {total}.{/if}
    </p>
    <RelationGraph view="focus" focus={{ id: selected.id, label: selected.label }} {layout} {onOpen} />
    {#if total > loaded.length}
      <div class="generic-more">
        <Button size="sm" data-testid="map-more" onclick={() => load(selected.id, loaded.length)}>
          {total - loaded.length} more
        </Button>
      </div>
    {/if}
  {/if}
{:else if !containerId}
  <p class="generic-muted">Select a record to see its relations.</p>
{:else if container?.error}
  <Notice kind="error">{container.error}</Notice>
{:else if !container?.graph || container.graph.nodes.length === 0}
  <p class="generic-muted">No records match this scope.</p>
{:else}
  {@const graph = container.graph}
  <p class="generic-muted" data-testid="map-note">
    Relations resolved by the engine for the active container.
    {#if graph.totalNodes > CONTAINER_NODE_CAP}Showing {graph.nodes.length} of {graph.totalNodes} records, select a record to explore.{/if}
  </p>
  <RelationGraph view="container" {graph} {onOpen} />
{/if}
