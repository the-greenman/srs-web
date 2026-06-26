<!--
  RecordDispatch — resolves the view component for a record by typeId.
  TYPE_REGISTRY maps typeId → view component; falls back to RecordView for unknown types.
  To add a new known type: add one entry to src/lib/governance/type-registry.ts — no change here.
  ADR-006, ADR-007: srs-web/docs/adr/
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import { TYPE_REGISTRY } from '$lib/governance/type-registry.js';
  import RecordView from './RecordView.svelte';

  let { record }: { record: SrsRecord } = $props();

  let ViewComponent = $derived(TYPE_REGISTRY[record.typeId]?.view ?? RecordView);
</script>

<ViewComponent {record} />
