<!--
  LensSwitcher — the tab lenses (navigation sections, and My set once drawn) as tabs above the panes;
  the other derived lenses under a "More lenses" menu (ActionMenu) in groups: Sections, Documents
  (compositions), All records of a type (folded behind one "Types…" row, most records first), then
  Everything. One row, in one place, in every layout. Presentation only.
  Wraps .lens-switcher (lens.css). Parts: tab, more.
-->
<script lang="ts">
  import type { LensId } from "$lib/address.js";
  import ActionMenu from "$lib/components/ActionMenu.svelte";
  import type { Lens } from "./lens.js";

  let {
    tabs,
    more,
    active,
    onPick,
  }: {
    tabs: Lens[];
    /** Lenses under the menu. */
    more: Lens[];
    active: LensId;
    onPick: (id: LensId) => void;
  } = $props();

  let showTypes = $state(false);
  const row = (l: Lens) => ({ id: l.id, label: l.label, enabled: true, run: () => onPick(l.id) });
  const of = (prefix: string) => more.filter((l) => l.id.startsWith(prefix)).map(row);
  const sections = $derived(
    [
      { label: "Sections", items: of("nav:") },
      { label: "Documents", items: of("comp:") },
      {
        label: "All records of a type",
        items: of("type:").length
          ? [
              {
                id: "types",
                label: "Types…",
                enabled: true,
                checked: showTypes,
                run: () => (showTypes = !showTypes),
              },
              ...(showTypes ? of("type:") : []),
            ]
          : [],
      },
      { label: "", items: of("find") },
    ].filter((g) => g.items.length > 0)
  );
  const activeMore = $derived(more.find((l) => l.id === active));
</script>

<div class="lens-switcher" role="tablist" aria-label="Lenses" data-testid="lens-switcher">
  {#each tabs as lens (lens.id)}
    <button
      type="button"
      role="tab"
      class="lens-switcher__tab"
      aria-selected={lens.id === active}
      data-part="tab"
      data-testid="lens-tab-{lens.id}"
      onclick={() => onPick(lens.id)}
    >{lens.label}</button>
  {/each}
  {#if more.length > 0}
    <ActionMenu
      {sections}
      keepOpenOnCheck
      label=""
      title="More lenses"
      triggerLabel={activeMore ? `More lenses: ${activeMore.label}` : "More lenses"}
      testid="lens-more"
      class="lens-switcher__more"
      data-part="more"
    />
  {/if}
</div>
