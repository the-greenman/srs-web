<!--
  MethodBoard — method problems grouped by domain (a section) and cluster (a group), with a status
  filter (Suggested by default). Empty clusters and domains under the filter are not shown. Presentation
  only: the host gives the grouped model (method-document.ts) and owns the selection.
  Wraps .method-board (method.css). Issue: https://github.com/the-greenman/srs-web/issues/526
-->
<script lang="ts">
  import type { MethodDomain, ProblemStatus } from '$lib/method/method-document.js';
  import { STATUS_LABEL } from '$lib/method/method-document.js';
  import ProblemCard from './ProblemCard.svelte';
  import TagChip from './TagChip.svelte';

  type Filter = ProblemStatus | 'all';
  let {
    domains,
    filter = $bindable<Filter>('suggested'),
    selectedId = null,
    onopen,
  }: {
    domains: MethodDomain[];
    filter?: Filter;
    selectedId?: string | null;
    onopen?: (id: string) => void;
  } = $props();

  const FILTERS: [Filter, string][] = [...(Object.entries(STATUS_LABEL) as [Filter, string][]), ['all', 'All']];
  const all = $derived(domains.flatMap((d) => d.clusters.flatMap((c) => c.problems)));
  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((p) => p.status === f).length);
  const shown = $derived(
    domains
      .map((d) => ({
        ...d,
        clusters: d.clusters
          .map((c) => ({ ...c, problems: c.problems.filter((p) => filter === 'all' || p.status === filter) }))
          .filter((c) => c.problems.length),
      }))
      .filter((d) => d.clusters.length)
  );
</script>

<div class="method-board" data-testid="method-board">
  <div class="method-board__filter" role="group" aria-label="Show problems">
    {#each FILTERS as [f, label] (f)}
      <TagChip label={`${label} ${count(f)}`} selected={filter === f} onSelect={() => (filter = f)} />
    {/each}
  </div>
  {#if shown.length === 0}
    <p class="t-muted" data-testid="method-board-empty">No problems here.</p>
  {/if}
  {#each shown as d (d.id)}
    <section class="method-board__domain" data-testid="method-domain">
      <h2 class="method-board__domain-title">{d.title}</h2>
      {#each d.clusters as c (c.id)}
        <div class="method-board__cluster" data-testid="method-cluster">
          <h3 class="method-board__cluster-title">{c.title} <span class="t-muted">{c.problems.length}</span></h3>
          <div class="method-board__cards">
            {#each c.problems as p (p.id)}<ProblemCard problem={p} selected={p.id === selectedId} {onopen} />{/each}
          </div>
        </div>
      {/each}
    </section>
  {/each}
</div>
