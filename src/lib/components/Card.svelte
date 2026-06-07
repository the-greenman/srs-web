<!--
  Card — record reading view. Ink header (id · title · status) over a body of
  CardField children. Set `grid` for the two-up compact layout.
  Wraps .card (src/styles/components/card.css).
  B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
-->
<script lang="ts">
import type { Snippet } from "svelte";
import type { Status } from "../types";
import Tag from "./Tag.svelte";

const {
  id,
  title,
  status,
  grid = false,
  children,
}: {
  id?: string;
  title: string;
  status?: Status;
  /** Two-up field grid (roles, summary cards). */
  grid?: boolean;
  children?: Snippet;
} = $props();
</script>

<article class="card">
  <header class="card__header">
    {#if id}<span class="card__id">{id}</span>{/if}
    <span class="card__title">{title}</span>
    {#if status}<span class="card__status"><Tag {status} onDark /></span>{/if}
  </header>
  <div class="card__body" class:card__body--grid={grid}>
    {@render children?.()}
  </div>
</article>
