<script lang="ts">
  import PairingLoader from '../src/lib/components/PairingLoader.svelte';
  let { pair, now }: { pair: () => Promise<{ code: string; expiresAt: number; connectorUrl: string }>; now: number } = $props();
</script>

<PairingLoader {pair} {now}>
  {#snippet children(view)}<p>{view.data?.code ?? '-'}|{view.error ?? ''}|{view.minutes}</p>{/snippet}
</PairingLoader>
