<!-- Test host for ToastHost: provides a ShellState through context, as AppShell does. -->
<script lang="ts">
  import ToastHost from '../src/lib/components/ToastHost.svelte';
  import { type ShellState, setShell } from '../src/lib/shell-context.svelte.js';

  let { shell }: { shell: ShellState } = $props();
  // svelte-ignore state_referenced_locally
  setShell(shell);
</script>

<ToastHost />
