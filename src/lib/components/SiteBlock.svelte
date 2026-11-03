<!--
  SiteBlock — one block of a website page on the site editor canvas (srs-web#680, ADR-029 E1): its
  visible fields in its View's order, each edited in place; the first reads as the block's heading.
  A value that is not text (a list, a table) shows as a muted note. The brief (editor-only intent)
  shows above when that layer is on. A group's items are its children.
  Wraps .site-block (src/styles/components/site.css).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import SiteText from "./SiteText.svelte";

  export interface SiteBlockField {
    name: string;
    label: string;
    value: unknown;
    editable: boolean;
  }

  let {
    typeLabel,
    fields,
    brief = null,
    selected = false,
    readonly = false,
    onselect,
    onedit,
    children,
  }: {
    typeLabel: string;
    fields: SiteBlockField[];
    brief?: { label: string; value: string }[] | null;
    selected?: boolean;
    readonly?: boolean;
    onselect: () => void;
    onedit: (name: string, value: string) => void;
    children?: Snippet;
  } = $props();
</script>

<!-- Tabbing into a field selects the block (focusin), as a click does. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<section
  class="site-block"
  class:site-block--selected={selected}
  aria-label={typeLabel}
  onclick={(e) => {
    e.stopPropagation();
    onselect();
  }}
  onfocusin={() => onselect()}
>
  <p class="site-block__type">{typeLabel}</p>
  {#if brief?.length}
    <dl class="site-block__brief">
      {#each brief as b (b.label)}
        <dt>{b.label}</dt>
        <dd>{b.value || "—"}</dd>
      {/each}
    </dl>
  {/if}
  {#each fields as f, i (f.name)}
    {#if typeof f.value === "string" || f.value === undefined || f.value === null}
      <SiteText
        value={(f.value as string | undefined) ?? ""}
        label={f.label}
        placeholder={f.label}
        heading={i === 0}
        multiline={i !== 0}
        readonly={readonly || !f.editable}
        oncommit={(v) => onedit(f.name, v)}
      />
    {:else}
      <p class="site-block__note">{f.label}: edited elsewhere</p>
    {/if}
  {/each}
  {#if children}<div class="site-block__items">{@render children()}</div>{/if}
</section>
