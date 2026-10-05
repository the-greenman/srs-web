<!--
  Disclosure — a ghost small Button with a Lucide chevron that shows or hides a region
  (`aria-expanded`, `aria-controls`). Used for the AgentPanel's "Connect an agent" and "Add a relay".
  `Panel` stays a native <details>; this is for inline sections inside a panel. `testid` goes on the
  button; the body is `hidden` when closed (still in the DOM). Story: #442
-->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  let {
    label,
    open = $bindable(false),
    testid,
    children,
  }: { label: string; open?: boolean; testid?: string; children?: Snippet } = $props();

  const id = `disclosure-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="disclosure" data-part="disclosure">
  <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={id} data-testid={testid} onclick={() => (open = !open)}>
    {#if open}<ChevronDown size={14} aria-hidden="true" />{:else}<ChevronRight size={14} aria-hidden="true" />{/if}{label}
  </Button>
  <div {id} class="disclosure__body" data-part="body" hidden={!open}>{@render children?.()}</div>
</div>
