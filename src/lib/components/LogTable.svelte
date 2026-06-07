<!--
  LogTable — tabular profile view (decision log). Provide column headers; author
  rows as children using the .log-table__* cell classes (so each view controls
  its own columns). Wraps .log-table (src/styles/components/log-table.css).
  B5 profile view shapes:        https://github.com/the-greenman/srs-web/issues/4
  B12 decision log / summary card: https://github.com/the-greenman/srs-web/issues/8
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    columns,
    children,
  }: {
    columns: string[];
    /** <tr> rows for the body. */
    children?: Snippet;
  } = $props();
</script>

<table class="log-table">
  <thead>
    <tr>{#each columns as c}<th>{c}</th>{/each}</tr>
  </thead>
  <tbody>{@render children?.()}</tbody>
</table>
