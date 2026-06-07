<!--
  Lifecycle — current status + legal transitions out of it. A transition marked
  `successor` spawns a follow-on record (supersede/amend). Legal transitions are
  decided in Rust and surfaced via WASM — this is presentation only (ADR-001).
  Wraps .lifecycle (src/styles/components/lifecycle.css).
  B11 lifecycle/supersession: https://github.com/the-greenman/srs-web/issues/7
-->
<script lang="ts">
  import type { Status, LifecycleTransition } from '../types';
  import Tag from './Tag.svelte';

  let {
    status,
    transitions = [],
    onTransition,
  }: {
    status: Status;
    transitions?: LifecycleTransition[];
    onTransition?: (to: Status) => void;
  } = $props();
</script>

<div class="lifecycle">
  <div class="lifecycle__current">
    <span class="lifecycle__current-label">Status</span>
    <Tag {status} />
  </div>
  {#if transitions.length > 0}
    <div class="lifecycle__transitions">
      {#each transitions as t}
        <button
          class="transition"
          class:transition--successor={t.successor}
          onclick={() => onTransition?.(t.to)}
        >{t.to}</button>
      {/each}
    </div>
  {/if}
</div>
