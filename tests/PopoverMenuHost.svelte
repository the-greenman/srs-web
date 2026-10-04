<!-- Test host: a role="menu" Popover with a mix of menuitem and menuitemcheckbox rows. -->
<script lang="ts">
  import Popover from '../src/lib/components/Popover.svelte';
  let open = $state(true);
</script>

<Popover bind:open role="menu" label="Mixed">
  {#snippet trigger({ props })}
    <button type="button" aria-label="Open mixed" {...props}>t</button>
  {/snippet}
  <button role="menuitem" data-testid="a">a</button>
  <button role="menuitemcheckbox" aria-checked="true" data-testid="b">b</button>
  <button role="menuitem" disabled data-testid="x">x</button>
  <button role="menuitemcheckbox" aria-checked="mixed" data-testid="c">c</button>
</Popover>
