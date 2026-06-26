<!--
  RecordDispatch — resolves the view component for a record by typeId.
  VIEW_REGISTRY maps typeId → component; falls back to RecordView for unknown types.
  Adding a new type: register its typeId here — no typeName switch needed.
  ADR-006: srs-web/docs/adr/006-dynamic-dispatch-replaces-sections.md
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import ArticleView from './ArticleView.svelte';
  import DecisionView from './DecisionView.svelte';
  import RoleView from './RoleView.svelte';
  import RecordView from './RecordView.svelte';

  const VIEW_REGISTRY: Record<string, typeof RecordView> = {
    "a1142ac3-5385-5c0e-8630-1dd3432cdf7f": ArticleView as unknown as typeof RecordView,
    "1fcad6a2-9f78-5e41-94ba-d82e88b822f3": DecisionView as unknown as typeof RecordView,
    "e53dce11-6b83-5714-a8fe-f730edb500fa": RoleView as unknown as typeof RecordView,
  };

  let { record }: { record: SrsRecord } = $props();

  let ViewComponent = $derived(VIEW_REGISTRY[record.typeId] ?? RecordView);
</script>

<ViewComponent {record} />
