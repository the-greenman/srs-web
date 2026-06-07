<!--
  Diagnostics — the validation panel. Renders the WASM `diagnostics[]` array as
  a summary line + severity rows, or an all-clear state. Severity is shown by
  fill/weight only (brand rule: no accent colour). Wraps .diag*
  (src/styles/components/diagnostics.css).
  B4 validation panel:  https://github.com/the-greenman/srs-web/issues/3
  B13 validate-on-save: https://github.com/the-greenman/srs-web/issues/9
-->
<script lang="ts">
  import type { Diagnostic, DiagnosticSeverity } from '../types';

  let { diagnostics = [] }: { diagnostics?: Diagnostic[] } = $props();

  const counts = $derived({
    error: diagnostics.filter((d) => d.severity === 'error').length,
    warn: diagnostics.filter((d) => d.severity === 'warn').length,
    info: diagnostics.filter((d) => d.severity === 'info').length,
  });

  const sevLabel: Record<DiagnosticSeverity, string> = {
    error: 'err',
    warn: 'warn',
    info: 'info',
  };
</script>

{#if diagnostics.length === 0}
  <div class="diag-clear">
    <span class="diag-clear__check">&#10003;</span> No diagnostics — record is valid.
  </div>
{:else}
  <div class="diag-summary">
    <span class={counts.error > 0 ? 'diag-summary__strong' : 'diag-summary__dim'}>
      {counts.error} error{counts.error === 1 ? '' : 's'}
    </span>
    <span class="diag-summary__dim">{counts.warn} warning{counts.warn === 1 ? '' : 's'}</span>
    <span class="diag-summary__dim">{counts.info} info</span>
  </div>
  <div class="diag-list">
    {#each diagnostics as d}
      <div class="diag diag--{d.severity}">
        <span class="diag__sev">{sevLabel[d.severity]}</span>
        <div>
          <div class="diag__msg">{d.message}</div>
          {#if d.where}<div class="diag__where">{d.where}</div>{/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
