<!--
  LensSwitcher — the tab lenses (navigation sections, and My set once drawn) as a <nav> of Buttons
  above the panes, the current one marked aria-current; the other derived lenses under a "More lenses"
  menu (ActionMenu, outside the nav) in groups: Sections, Documents
  (compositions), All records of a type (folded behind one "Types…" row, most records first), then
  Everything. One row, in one place, in every layout. Presentation only.
  Wraps .lens-switcher (lens.css). Parts: tab, more.
-->
<script lang="ts">
  import type { LensId } from "$lib/address.js";
  import ActionMenu from "$lib/components/ActionMenu.svelte";
  import Button from "$lib/components/Button.svelte";
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

<div class="lens-switcher" data-testid="lens-switcher">
  <nav class="lens-switcher__tabs" aria-label="Lenses">
    {#each tabs as lens (lens.id)}
      <Button
        size="sm"
        variant={lens.id === active ? "primary" : "ghost"}
        aria-current={lens.id === active ? "true" : undefined}
        data-part="tab"
        data-testid="lens-tab-{lens.id}"
        onclick={() => onPick(lens.id)}
      >{lens.label}</Button>
    {/each}
  </nav>
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
