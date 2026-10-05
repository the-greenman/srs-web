<!--
  LiveRegions — what a screen reader hears for the toasts (#441, ADR-020 j). Two visually-hidden regions,
  ALWAYS rendered (a live region inserted with its content is not reliably announced): a plain polite
  one for non-error toasts, and an assertive, atomic one for sticky errors. The error region has no
  role="alert": an empty always-present alert node would break every "no alert on this path" assertion.
  The text is written into the already-rendered node and cleared when the toast goes. The visual rows
  (ToastHost) are aria-hidden text, so a toast is heard once.
-->
<script lang="ts">
  import { toasts } from '../notices.svelte.js';

  const polite = $derived(toasts.filter((t) => t.kind !== 'error').at(-1)?.text ?? '');
  const assertive = $derived(toasts.filter((t) => t.kind === 'error').at(-1)?.text ?? '');
</script>

<div class="sr-only" aria-live="polite" data-testid="live-polite">{polite}</div>
<div class="sr-only" aria-live="assertive" aria-atomic="true" data-testid="live-assertive">{assertive}</div>
