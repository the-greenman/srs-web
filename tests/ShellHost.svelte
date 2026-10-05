<!-- Test host for AppShell: a Toolbar inside main (finds the shell context), a nav and an inspector. -->
<script lang="ts">
  import AppShell from '../src/lib/components/AppShell.svelte';
  import InspectorTrigger from '../src/lib/components/InspectorTrigger.svelte';
  import Main from '../src/lib/components/Main.svelte';
  import NavTrigger from '../src/lib/components/NavTrigger.svelte';
  import Toolbar from '../src/lib/components/Toolbar.svelte';
  import { ShellState } from '../src/lib/shell-context.svelte.js';

  let { badge = 0 }: { badge?: number } = $props();
  const shell = new ShellState();
  // svelte-ignore state_referenced_locally
  shell.inspectorBadge = badge;
</script>

<AppShell {shell}>
  {#snippet nav()}<nav>nav</nav>{/snippet}
  {#snippet main()}
    <Main>
      {#snippet bar()}
        <Toolbar title="crumb" actions={[]} groups={[]}>
          {#snippet lead()}<NavTrigger />{/snippet}
          {#snippet trail()}<InspectorTrigger />{/snippet}
        </Toolbar>
      {/snippet}
    </Main>
  {/snippet}
  {#snippet inspector()}<aside>insp</aside>{/snippet}
</AppShell>
