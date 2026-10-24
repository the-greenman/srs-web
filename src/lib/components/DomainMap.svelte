<!--
  DomainMap — the essay's domain: a boundary chosen from the repository's boundary records, and the map
  of what that boundary links (problems the essay touches or leaves untouched, claims, tensions,
  remedies; a boundary that narrows another shows that parent's lists beneath). Each item opens its
  record through `onopen`. Presentation only: the lists come from essay-domain.ts. Shares the tray
  stylesheet (draft-tray.css). Without `onchoose` the choice is read-only.
  Issue: https://github.com/the-greenman/srs-web/issues/571
-->
<script lang="ts">
  import type { DomainItem, DomainLevel, DomainMap } from '$lib/essay/essay-domain.js';
  import Button from './Button.svelte';
  import Select from './Select.svelte';
  import TrayRow from './TrayRow.svelte';

  let {
    boundaries,
    map,
    onchoose,
    onopen,
  }: {
    /** The boundary records the writer can choose from. */
    boundaries: DomainItem[];
    /** The map of the chosen boundary; null when the essay has none. */
    map: DomainMap | null;
    /** Choose a boundary (id) or remove it (null). Absent: read-only. */
    onchoose?: (id: string | null) => void;
    onopen: (id: string) => void;
  } = $props();

  const NONE = '';
  const options = $derived([{ value: NONE, label: 'No domain' }, ...boundaries.map((b) => ({ value: b.id, label: b.label }))]);
  const chosen = $derived(map?.boundary.id ?? NONE);
  const choose = (e: Event) => onchoose?.((e.currentTarget as HTMLSelectElement).value || null);

  /** One titled list, shown only when it has items. */
  type Group = { key: string; title: string; items: DomainItem[] };
  const groups = (l: Pick<DomainMap, 'claims' | 'tensions' | 'remedies'> & { touched: DomainItem[]; untouched: DomainItem[] }): Group[] =>
    [
      { key: 'touched', title: 'Problems the essay touches', items: l.touched },
      { key: 'untouched', title: 'Problems it leaves untouched', items: l.untouched },
      { key: 'claims', title: 'Claims', items: l.claims },
      { key: 'tensions', title: 'Tensions', items: l.tensions },
      { key: 'remedies', title: 'Remedies', items: l.remedies },
    ].filter((g) => g.items.length);
  const own = $derived(map ? groups({ ...map, ...map.problems }) : []);
  const parentGroups = (p: DomainLevel): Group[] =>
    groups({
      claims: p.claims,
      tensions: p.tensions,
      remedies: p.remedies,
      touched: p.problems.filter((x) => x.touched),
      untouched: p.problems.filter((x) => !x.touched),
    });
</script>

{#snippet list(gs: Group[], scope: string)}
  {#each gs as g (g.key)}
    <h4 class="tray__subhead" data-testid={`domain-${scope}-${g.key}`}>{g.title} ({g.items.length})</h4>
    {#each g.items as it (it.id)}
      <TrayRow label={it.label} data-testid="domain-item">
        {#snippet actions()}
          <Button size="sm" variant="mono" onclick={() => onopen(it.id)} aria-label={`Open ${it.label}`}>Open</Button>
        {/snippet}
      </TrayRow>
    {/each}
  {/each}
{/snippet}

<div class="tray" data-testid="domain-map">
  {#if boundaries.length === 0 && !map}
    <p class="tray__empty">This repository holds no boundary records, so there is no domain to choose.</p>
  {:else}
    <label>
      <span class="sr-only">Domain of this essay</span>
      <Select value={chosen} {options} disabled={!onchoose} onchange={choose} data-testid="domain-select" />
    </label>
    {#if map}
      {#if own.length === 0}
        <p class="tray__empty">This domain links no problems, claims, tensions or remedies yet.</p>
      {/if}
      {@render list(own, 'own')}
      {#each map.parents as p (p.boundary.id)}
        <h4 class="tray__subhead" data-testid="domain-parent">Within {p.boundary.label}</h4>
        {@render list(parentGroups(p), `parent-${p.boundary.id}`)}
      {/each}
    {:else}
      <p class="tray__empty">Choose a domain to see its problems, claims, tensions and remedies.</p>
    {/if}
  {/if}
</div>
