<!--
  Toast — one toast row (#441): kind icon, text, close button. The text is aria-hidden (screen readers
  hear it once, from LiveRegions); never put aria-hidden on the row, it holds the focusable close
  button. Used by ToastHost, and statically by /styleguide. Wraps .toast (toast.css); tokens `--toast-*`.
-->
<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Info from '@lucide/svelte/icons/info';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import X from '@lucide/svelte/icons/x';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { NoticeKind } from '../notices.svelte.js';
  import IconButton from './IconButton.svelte';

  let {
    kind = 'info',
    text,
    testid = 'toast',
    onDismiss,
    ...rest
  }: {
    kind?: NoticeKind;
    text: string;
    testid?: string;
    onDismiss?: () => void;
  } & HTMLAttributes<HTMLDivElement> = $props();

  const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };
  const Icon = $derived(ICONS[kind]);
</script>

<div class={`toast toast--${kind}`} data-testid={testid} {...rest}>
  <span class="toast__icon"><Icon size={16} aria-hidden="true" /></span>
  <span class="toast__text" aria-hidden="true">{text}</span>
  <IconButton icon={X} label="Dismiss" size="sm" onclick={onDismiss} />
</div>
