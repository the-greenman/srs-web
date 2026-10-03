<!--
  Panel — a titled, collapsible block for side rails (Layers, Draft, Agents, inspector
  sections). Native <details>/<summary>, so collapse needs no JS; `collapsible={false}` renders
  a static header. `persistKey` remembers open/closed in localStorage (convenience only: every
  access is guarded). Wraps .panel (src/styles/components/panel.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#362)
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    aside,
    open = $bindable(true),
    persistKey,
    collapsible = true,
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
    } catch {}
  })();

  function remember() {
    const key = storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, open ? '1' : '0');
    } catch {}
  }

  const hasAside = $derived(aside !== undefined && aside !== '');
</script>

{#snippet head()}
  <span class="panel__title">{title}</span>
  {#if hasAside}<span class="panel__aside">{aside}</span>{/if}
  {#if actions}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="panel__actions" onclick={(e) => { if (collapsible) e.preventDefault(); }}>{@render actions()}</span>
  {/if}
{/snippet}

{#if collapsible}
  <details class="panel {className}" bind:open ontoggle={remember}>
    <summary class="panel__head">{@render head()}</summary>
    <div class="panel__body">{@render children?.()}</div>
  </details>
{:else}
  <section class="panel {className}">
    <div class="panel__head">{@render head()}</div>
    <div class="panel__body">{@render children?.()}</div>
  </section>
{/if}
