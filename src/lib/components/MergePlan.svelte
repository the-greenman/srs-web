<!--
  MergePlan.svelte — Merge changes from a file (srs-web#733), in a Modal: the new items the other
  copy has, each with a tick (`ticked` is the ticked ids, default all), and what will not come in
  and why. Presentation only (ADR-001): the engine planned it (merge_preview, srs-rust#1580) and
  $lib/merge names the rows. The words are help data (`help` = the `merge-from-file` screen's items).
  Apply brings the ticked items in; Cancel closes. `inline` = the styleguide specimen.
-->
<script lang="ts">
  import type { HelpItem } from "$lib/help/help.js";
  import type { MergeChoice, MergeLeftOut } from "$lib/merge.js";
  import Button from "./Button.svelte";
  import Checkbox from "./Checkbox.svelte";
  import MarkdownView from "./MarkdownView.svelte";
  import Modal from "./Modal.svelte";
  import Notice from "./Notice.svelte";

  interface Props {
    help: HelpItem[];
    choices: MergeChoice[];
    leftOut: MergeLeftOut[];
    ticked?: string[];
    busy?: boolean;
    error?: string | null;
    onApply: () => void;
    onCancel: () => void;
    inline?: boolean;
  }

  let { help, choices, leftOut, ticked = $bindable([]), busy = false, error = null, onApply, onCancel, inline = false }: Props = $props();

  const word = (id: string) => help.find((h) => h.featureId === id);
  const intro = $derived(word("merge.intro"));
  const fresh = $derived(word("merge.new"));
  const kept = $derived(word("merge.left-out"));
</script>

<Modal title={intro?.title ?? ""} testid="merge-modal" {inline} {onCancel}>
  <div data-feature="merge.intro">
    {#if intro}<MarkdownView value={intro.summary} />{/if}
  </div>
  <section data-feature="merge.new" data-testid="merge-new">
    <h3>{fresh?.title} <span>{choices.length}</span></h3>
    {#if choices.length}
      {#if fresh}<MarkdownView value={fresh.summary} />{/if}
      <ul>
        {#each choices as c (c.id)}
          <li>
            <Checkbox bind:group={ticked} value={c.id} disabled={busy} data-testid="merge-choice">{c.title} <small>{c.kind}</small></Checkbox>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
  {#if leftOut.length}
    <section data-feature="merge.left-out" data-testid="merge-left-out">
      <h3>{kept?.title} <span>{leftOut.length}</span></h3>
      {#if kept}<MarkdownView value={kept.summary} />{/if}
      <ul>
        {#each leftOut as l (`${l.kind}:${l.id}`)}<li>{l.title}: {l.why}</li>{/each}
      </ul>
    </section>
  {/if}
  {#if error}<Notice kind="error">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="sm" onclick={onCancel} disabled={busy} data-testid="merge-cancel">Cancel</Button>
    <Button size="sm" variant="primary" onclick={onApply} disabled={busy || ticked.length === 0} data-testid="merge-apply">{busy ? "Bringing in…" : `Bring in ${ticked.length}`}</Button>
  {/snippet}
</Modal>
