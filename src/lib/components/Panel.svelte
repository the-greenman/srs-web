<!--
  Panel — a titled, collapsible block for side rails (Layers, Draft, Agents, inspector
  sections; `grow` fills remaining rail height). Native <details>/<summary>, so collapse needs no JS; `collapsible={false}` renders
  a static header. `persistKey` remembers open/closed in localStorage (convenience only: every
  access is guarded). Wraps .panel (src/styles/components/panel.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#362)
-->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { Snippet } from 'svelte';

  let {
    title,
    aside,
    open = $bindable(true),
    persistKey,
    collapsible = true,
    collapseWhen,
    grow = false,
    actions,
    class: className = '',
    children,
  }: {
    title: string;
    /** Count or short status shown right-aligned in the header. */
    aside?: string | number;
    open?: boolean;
    /** localStorage suffix (`srs-web.panel.<persistKey>`) remembering the open state. */
    persistKey?: string;
    collapsible?: boolean;
    /** Media query: start collapsed while it matches and the viewer has no remembered state. */
    collapseWhen?: string;
    /** Stretch to fill remaining rail height (static panels). */
    grow?: boolean;
    /** Header buttons; clicking them does not toggle the panel. */
    actions?: Snippet;
    /** Extra classes on the root (e.g. a host block's own styling hook). */
    class?: string;
    children?: Snippet;
  } = $props();

  const storageKey = () => (persistKey ? `srs-web.panel.${persistKey}` : null);
  (() => {
    const key = storageKey();
    if (!key || !collapsible) return;
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) open = stored === '1';
      else if (collapseWhen && matchMedia(collapseWhen).matches) open = false;
    } catch {}
  })();

  function remember() {
    const key = storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, open ? '1' : '0');
    } catch {}
  }

  const cls = $derived(`panel ${grow ? 'panel--grow ' : ''}${className}`);
  const hasAside = $derived(aside !== undefined && aside !== '');
</script>

{#snippet head()}
  {#if collapsible}<ChevronDown class="panel__chevron" size={14} aria-hidden="true" />{/if}
  <span class="panel__title" data-part="title">{title}</span>
  {#if hasAside}<span class="panel__aside" data-part="aside">{aside}</span>{/if}
  {#if actions}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="panel__actions" data-part="actions" onclick={(e) => { if (collapsible) e.preventDefault(); }}>{@render actions()}</span>
  {/if}
{/snippet}

{#if collapsible}
  <details class={cls} bind:open ontoggle={remember}>
    <summary class="panel__head" data-part="head">{@render head()}</summary>
    <div class="panel__body" data-part="body">{@render children?.()}</div>
  </details>
{:else}
  <section class={cls}>
    <div class="panel__head" data-part="head">{@render head()}</div>
    <div class="panel__body" data-part="body">{@render children?.()}</div>
  </section>
{/if}
