<!--
  HelpDialog — an editor's help (src/lib/help, decision 9441693e), one feature at a time: title, the
  summary, and More for the explanation. Words come from the help records only; `featureActions` lets the
  screen add a button to a feature (Connect your AI → open the Agents panel). "Don't show again" is
  handed back on close; the screen stores it. Built on Modal (`inline` for the styleguide specimen).
-->
<script lang="ts">
  import type { HelpItem } from '$lib/help/help.js';
  import Button from './Button.svelte';
  import Checkbox from './Checkbox.svelte';
  import Disclosure from './Disclosure.svelte';
  import MarkdownView from './MarkdownView.svelte';
  import Modal from './Modal.svelte';

  let {
    title = 'Welcome',
    items,
    featureActions = {},
    dontShow = false,
    onclose,
    inline = false,
  }: {
    title?: string;
    items: HelpItem[];
    /** Extra buttons by feature id, supplied by the screen. */
    featureActions?: Record<string, { label: string; run: () => void }>;
    /** Start with "Don't show again" ticked (the help was dismissed before). */
    dontShow?: boolean;
    onclose: (dontShow: boolean) => void;
    inline?: boolean;
  } = $props();

  let step = $state(0);
  // svelte-ignore state_referenced_locally -- the dialog mounts fresh on each open, so its initial value is the point
  let hide = $state(dontShow);
  let more = $state(false);
  const item = $derived(items[step]);
  const last = $derived(step === items.length - 1);
  const go = (to: number) => {
    step = to;
    more = false;
  };
</script>

<Modal {inline} {title} testid="help-dialog" onCancel={() => onclose(hide)}>
  {#if item}
    <p class="help-dialog__count" data-part="count">{step + 1} of {items.length}</p>
    <h3 class="help-dialog__title" data-testid="help-step-title">{item.title}</h3>
    <MarkdownView value={item.summary} />
    {#if featureActions[item.featureId]}
      {@const a = featureActions[item.featureId]}
      <Button size="sm" data-testid="help-action" onclick={a.run}>{a.label}</Button>
    {/if}
    {#if item.explanation}
      {#key step}
        <Disclosure label="More" testid="help-more" bind:open={more}><MarkdownView value={item.explanation} /></Disclosure>
      {/key}
    {/if}
  {/if}
  {#snippet actions()}
    <Checkbox bind:checked={hide} data-testid="help-dont-show">Don't show again</Checkbox>
    <Button size="sm" disabled={step === 0} data-testid="help-back" onclick={() => go(step - 1)}>Back</Button>
    {#if last}
      <Button size="sm" variant="primary" data-testid="help-done" onclick={() => onclose(hide)}>Done</Button>
    {:else}
      <Button size="sm" variant="primary" data-testid="help-next" onclick={() => go(step + 1)}>Next</Button>
    {/if}
  {/snippet}
</Modal>
