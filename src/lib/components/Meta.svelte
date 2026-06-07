<!--
  Meta — key/value metadata list (provenance, ids, timestamps).
  Wraps .meta (src/styles/components/inspector.css).
  B4 read-only viewer: https://github.com/the-greenman/srs-web/issues/3
-->
<script lang="ts">
  let { rows }: { rows: { key: string; val: string }[] } = $props();
</script>

<dl class="meta">
  {#each rows as r}
    <div class="meta__row">
      <dt class="meta__key">{r.key}</dt>
      <dd class="meta__val">{r.val}</dd>
    </div>
  {/each}
</dl>
