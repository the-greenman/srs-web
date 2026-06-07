<!--
  RecordDispatch — picks the right profile view for a record's typeName.
  Falls back to the generic RecordView for unknown types.
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
  import type { SrsRecord } from '$lib/srs-client.js';
  import ArticleView from './ArticleView.svelte';
  import DecisionView from './DecisionView.svelte';
  import ExerciseView from './ExerciseView.svelte';
  import RoleView from './RoleView.svelte';
  import RecordView from './RecordView.svelte';

  let { record }: { record: SrsRecord } = $props();
</script>

{#if record.typeName === 'article'}
  <ArticleView {record} />
{:else if record.typeName === 'decision'}
  <DecisionView {record} />
{:else if record.typeName === 'exercise'}
  <ExerciseView {record} />
{:else if record.typeName === 'role'}
  <RoleView {record} />
{:else}
  <RecordView {record} />
{/if}
