<!--
  Notice — an inline, persistent message with a kind (#441, ADR-020 j). `error` is strong (error rule and
  fill, medium weight) and `role="alert"`; info, success and warning are quiet and `role="status"`.
  It states a fact about where it sits (a failed export, a read-only note), so it stays until its cause or
  the user clears it; transient events are toasts (ToastHost). `onDismiss` adds the close control. Extra
  attributes (data-*, id) go to the root. Wraps .notice (notice.css); tokens `--notice-*`;
  parts `icon body action dismiss`.
-->
<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Info from '@lucide/svelte/icons/info';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import X from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { NoticeKind } from '../notices.svelte.js';
  import Button from './Button.svelte';
  import IconButton from './IconButton.svelte';

  let {
    kind = 'info',
    onDismiss,
    action,
    testid,
    children,
    class: klass = '',
    ...rest
  }: {
    kind?: NoticeKind;
    onDismiss?: () => void;
    /** One call-to-action beside the message (a pinned notice's "Review upgrade"). */
    action?: { label: string; onAction: () => void };
    testid?: string;
    children?: Snippet;
    class?: string;
  } & Omit<HTMLAttributes<HTMLDivElement>, 'children'> = $props();

  const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };
  const Icon = $derived(ICONS[kind]);
</script>

<div
  class={`notice notice--${kind} ${klass}`}
  role={kind === 'error' ? 'alert' : 'status'}
  data-testid={testid}
  {...rest}
>
  <span class="notice__icon" data-part="icon"><Icon size={16} aria-hidden="true" /></span>
  <div class="notice__body" data-part="body">{@render children?.()}</div>
  {#if action}
    <Button size="sm" data-part="action" data-testid={testid ? `${testid}-action` : undefined} onclick={action.onAction}>{action.label}</Button>
  {/if}
  {#if onDismiss}
    <IconButton icon={X} label="Dismiss" size="sm" data-part="dismiss" onclick={onDismiss} />
  {/if}
</div>
