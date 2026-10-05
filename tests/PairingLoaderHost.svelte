<script lang="ts">
  import PairingLoader from '../src/lib/components/PairingLoader.svelte';
  import type { PairingView } from '../src/lib/components/agent-panel';
  import type { PairingResponse } from '../src/lib/mcp/relay-protocol';
  let { pair, now }: { pair: () => Promise<PairingResponse>; now: number } = $props();
  let view = $state<PairingView>();
  let retry = $state<() => void>();
  let el = $state<HTMLElement>();
</script>

<div bind:this={el} data-testid="host">
  <PairingLoader {pair} {now} scope={() => el} bind:view bind:retry />
  <p>{view?.data?.code ?? '-'}|{view?.error ?? ''}|{view?.minutes ?? 0}</p>
  <button data-testid="retry" onclick={() => retry?.()}>retry</button>
</div>
