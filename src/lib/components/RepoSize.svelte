<!--
  RepoSize — the repository's size, against its limit when there is one (#503). A native <meter>
  (warning past 60%, high past 80%) plus the label; without a limit only the label. `pendingBytes`
  is what is about to be added. Wraps .size-meter (size-meter.css); tokens `--size-meter-*`;
  parts `meter label`.
-->
<script lang="ts">
  import { formatBytes } from '../format-bytes.js';

  let { totalBytes, maxBytes, pendingBytes = 0 }: { totalBytes: number; maxBytes?: number; pendingBytes?: number } = $props();

  const label = $derived(
    (maxBytes ? `${formatBytes(totalBytes)} of ${formatBytes(maxBytes)}` : `Repository ${formatBytes(totalBytes)}`) +
      (pendingBytes > 0 ? ` + ${formatBytes(pendingBytes)}` : '')
  );
</script>

<div class="size-meter">
  {#if maxBytes}
    <meter
      class="size-meter__meter"
      data-part="meter"
      min={0}
      max={maxBytes}
      value={totalBytes + pendingBytes}
      low={0.6 * maxBytes}
      high={0.8 * maxBytes}
      optimum={0}
      aria-label="Repository size"
    ></meter>
  {/if}
  <span class="size-meter__label" data-part="label">{label}</span>
</div>
