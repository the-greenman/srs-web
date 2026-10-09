<!--
  LensSwitcher — the curated lenses as tabs at the top of the Collection pane; the derived lenses
  (one per section, composition, type, plus Everything) under a "More…" menu (ActionMenu).
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

  const menu = $derived(
    extra.map((l) => ({ id: l.id, label: l.label, enabled: true, run: () => onPick(l.id) }))
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
  {#if menu.length > 0}
    <ActionMenu
      actions={menu}
      label=""
      title="More lenses"
      triggerLabel={activeExtra ? activeExtra.label : "More…"}
      testid="lens-more"
      class="lens-switcher__more"
    />
  {/if}
</div>
