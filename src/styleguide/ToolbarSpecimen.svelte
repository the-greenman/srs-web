<!--
  ToolbarSpecimen — a Toolbar for /styleguide: forces a tier and can open one group menu after mount
  (the live Toolbar has neither). Specimens only; never used in the app.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import type { Tier } from "$lib/breakpoints";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import type { ToolbarAction } from "$lib/components/menu-action";
  import type { IconComponent } from "$lib/components/icon";

  let {
    tier,
    pinned,
    ...rest
  }: {
    tier: Tier;
    /** Group id whose menu is opened on mount. */
    pinned?: string;
    title: string;
    groups: { id: string; label: string; icon?: IconComponent }[];
    actions: ToolbarAction[];
    status?: Snippet;
    lead?: Snippet;
  } = $props();
  let root = $state<HTMLElement>();
  onMount(() => {
    if (pinned) root?.querySelector<HTMLElement>(`[data-testid="toolbar-menu-${pinned}"]`)?.click();
  });
</script>

<Toolbar {tier} bind:root {...rest} />
