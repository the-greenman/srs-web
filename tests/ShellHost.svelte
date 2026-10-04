<!-- Test host for AppShell: a Topbar inside main (finds the shell context), a nav and an inspector. -->
<script lang="ts">
  import AppShell from '../src/lib/components/AppShell.svelte';
  import Main from '../src/lib/components/Main.svelte';
  import Topbar from '../src/lib/components/Topbar.svelte';
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
      <Topbar>
        {#snippet crumb()}crumb{/snippet}
        {#snippet actions()}<button type="button">act</button>{/snippet}
      </Topbar>
    </Main>
  {/snippet}
  {#snippet inspector()}<aside>insp</aside>{/snippet}
</AppShell>
