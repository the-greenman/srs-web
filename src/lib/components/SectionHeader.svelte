<!--
  SectionHeader — "01 Open": a mono number, a mono uppercase label and a hairline filling the row.
  Wraps .section-header (section-header.css); tokens `--section-header-*`; part `rule`.
  The label is the heading (h2) of the section it opens.
-->
<script lang="ts">
  let { number, label }: { number: string; label: string } = $props();
</script>

<h2 class="section-header">
  <span data-part="number">{number}</span>
  <span data-part="label">{label}</span>
  <span class="section-header__rule" data-part="rule" aria-hidden="true"></span>
</h2>
