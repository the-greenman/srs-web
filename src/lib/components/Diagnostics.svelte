<!--
  Diagnostics — the engine's diagnostics[] as grouped rows (#441): identical messages collapse into one
  row with a count (grouping keys on the exact message until the engine exposes a code, srs-rust#1264).
  Two variants. `panel` (default): the validation panel, summary line plus severity rows, or an all-clear
  state. `notice`: the document-level notice, built on Notice: one collapsed line ("2 warnings, 1 error"),
  expandable to the groups, dismissible for the session per `documentKey` (a change in the diagnostics
  re-shows it); nothing renders when there are none. Severity is shown by fill/weight only (brand rule).
  Wraps .diag* (diagnostics.css). Parts (notice): `summary toggle group count dismiss`.
  B4 validation panel:  https://github.com/the-greenman/srs-web/issues/3
  B13 validate-on-save: https://github.com/the-greenman/srs-web/issues/9
-->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import {
    dismissDiagnostics,
    diagnosticsHash,
    groupDiagnostics,
    isDiagnosticsDismissed,
  } from '../notices.svelte.js';
  import type { Diagnostic, DiagnosticSeverity } from '../types';
  import IconButton from './IconButton.svelte';
  import Notice from './Notice.svelte';

  let {
    diagnostics = [],
    variant = 'panel',
    documentKey,
    testid,
    expanded = false,
    ...rest
  }: {
    diagnostics?: Diagnostic[];
    variant?: 'panel' | 'notice';
    /** Notice variant: the dismissal scope. */
    documentKey?: string;
    testid?: string;
    /** Notice variant: start expanded. */
    expanded?: boolean;
  } & Record<`data-${string}`, string | boolean | undefined> = $props();

  const groups = $derived(groupDiagnostics(diagnostics));
  const hash = $derived(diagnosticsHash(groups));
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

  // svelte-ignore state_referenced_locally
  let open = $state(expanded);
  const hidden = $derived(
    variant === 'notice' && documentKey !== undefined && isDiagnosticsDismissed(documentKey, hash)
  );
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const summary = $derived(
    [
      counts.error && plural(counts.error, 'error'),
      counts.warn && plural(counts.warn, 'warning'),
      counts.info && `${counts.info} info`,
    ]
      .filter(Boolean)
      .join(', ')
  );
  // Never `error`: the notice is a status, not an alert (an alert on every load would break the no-alert paths);
  // errors read strong through their own rows.
  const kind = $derived(counts.error || counts.warn ? 'warning' : 'info');
  const listId = `diag-${Math.random().toString(36).slice(2, 8)}`;
</script>

{#snippet rows()}
  {#each groups as g (g.key)}
    <div class="diag diag--{g.severity}" data-part="group">
      <span class="diag__sev">{sevLabel[g.severity]}</span>
      <div>
        <div class="diag__msg">
          {g.message}
          {#if g.count > 1}<span class="diag__count" data-part="count">x{g.count}</span>{/if}
        </div>
        {#if g.where.length}<div class="diag__where">{g.where.join(', ')}</div>{/if}
      </div>
    </div>
  {/each}
{/snippet}

{#if variant === 'notice'}
  {#if diagnostics.length > 0 && !hidden}
    <Notice
      {kind}
      {testid}
      {...rest}
      class={`diag-notice ${open ? '' : 'diag--collapsed'}`}
      onDismiss={documentKey === undefined ? undefined : () => dismissDiagnostics(documentKey, hash)}
    >
      <div class="diag-notice__head">
        <IconButton
          icon={open ? ChevronDown : ChevronRight}
          label={open ? 'Hide diagnostics' : 'Show diagnostics'}
          size="sm"
          data-part="toggle"
          aria-expanded={open}
          aria-controls={listId}
          onclick={() => (open = !open)}
        />
        <span class="diag-notice__summary" data-part="summary">{summary}</span>
      </div>
      <div id={listId} class="diag-list" hidden={!open}>{@render rows()}</div>
    </Notice>
  {/if}
{:else if diagnostics.length === 0}
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
  <div class="diag-list">{@render rows()}</div>
{/if}
