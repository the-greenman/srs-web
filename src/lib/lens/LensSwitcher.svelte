<!--
  LensSwitcher — the curated lenses as tabs at the top of the Collection pane; the derived lenses
  under a "More lenses" menu (ActionMenu) in groups: Sections, Documents (compositions), All records of a
  type (folded behind one "Types…" row, most records first), then Everything. One row, in one place (above the panes) in every layout.
  Presentation only. Wraps .lens-switcher (src/styles/components/lens.css).
  POC: plans/ux-lenses.md §4.
-->
<script lang="ts">
  import ActionMenu from "$lib/components/ActionMenu.svelte";
  import type { Lens } from "./lens.js";

  let {
    curated,
    extra,
    active,
    onPick,
  }: {
    curated: Lens[];
    /** Derived lenses, under the menu. */
    extra: Lens[];
    active: string;
    onPick: (id: string) => void;
  } = $props();

  let showTypes = $state(false);
  const row = (l: Lens) => ({ id: l.id, label: l.label, enabled: true, run: () => onPick(l.id) });
  const of = (prefix: string) => extra.filter((l) => l.id.startsWith(prefix)).map(row);
  const sections = $derived(
    [
      { label: "Sections", items: of("nav:") },
      { label: "Documents", items: of("comp:") },
      {
        label: "All records of a type",
        items: of("type:").length
          ? [
              { id: "types", label: "Types…", enabled: true, checked: showTypes, run: () => (showTypes = !showTypes) },
              ...(showTypes ? of("type:") : []),
            ]
          : [],
      },
      { label: "", items: of("find") },
    ].filter((g) => g.items.length > 0)
  );
  const activeExtra = $derived(extra.find((l) => l.id === active));
</script>

<div class="lens-switcher" role="tablist" aria-label="Lenses" data-testid="lens-switcher">
  {#each curated as lens (lens.id)}
    <button
      type="button"
      role="tab"
      class="lens-switcher__tab"
      aria-selected={lens.id === active}
      data-testid="lens-tab-{lens.id}"
      onclick={() => onPick(lens.id)}
    >{lens.label}</button>
  {/each}
  {#if extra.length > 0}
    <ActionMenu
      {sections}
      keepOpenOnCheck
      label=""
      title="More lenses"
      triggerLabel={activeExtra ? `More lenses: ${activeExtra.label}` : "More lenses"}
      testid="lens-more"
      class="lens-switcher__more"
    />
  {/if}
</div>
