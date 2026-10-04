<!-- Test host for Popover: a real trigger that spreads the invoker props. -->
<script lang="ts">
  import Popover from '../src/lib/components/Popover.svelte';
  let { label, open = $bindable(false) }: { label: string; open?: boolean } = $props();
</script>

<Popover bind:open role="region" {label}>
  {#snippet trigger({ props })}
    <button type="button" aria-label="Open things" {...props}>t</button>
  {/snippet}
  <p>body</p>
</Popover>
