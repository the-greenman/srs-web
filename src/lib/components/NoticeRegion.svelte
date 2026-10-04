<!--
  NoticeRegion — the pinned, document-level notices (#441): today the catalog diagnostics. Main places it
  directly below the bar and above the scroller (real DOM order, no CSS order), so every shell shows it.
  A pinned notice with diagnostics is the grouped, collapsible Diagnostics notice; one with text is a Notice.
-->
<script lang="ts">
  import { pinned } from '../notices.svelte.js';
  import Diagnostics from './Diagnostics.svelte';
  import Notice from './Notice.svelte';
</script>

{#each pinned as n (n.key)}
  {#if n.diagnostics}
    <Diagnostics variant="notice" diagnostics={n.diagnostics} documentKey={n.documentKey} testid={n.testid} />
  {:else}
    <Notice kind={n.kind} testid={n.testid}>{n.text}</Notice>
  {/if}
{/each}
