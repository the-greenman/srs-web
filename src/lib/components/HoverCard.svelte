<!--
  HoverCard — a small read-only preview card (AttachmentPreview + an optional Remove link) in a
  manual Popover, role="tooltip". Presentation only: the host decides when it shows by binding
  `open` and passing the `anchor` it is placed beside (AttachmentGlyph shows it on hover and focus).
  `static` renders it in flow with no popover, so /styleguide can show it without a hover.
  Wraps .hover-card (src/styles/components/attachment.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224 (srs-web#329)
-->
<script lang="ts">
  import AttachmentPreview from './AttachmentPreview.svelte';
  import Button from './Button.svelte';
  import Popover from './Popover.svelte';

  let {
    kind,
    title,
    text = '',
    relation = '',
    onremove,
    ondownload,
    open = $bindable(false),
    anchor,
    static: inFlow = false,
    class: className = '',
  }: {
    kind: string;
    title: string;
    text?: string;
    relation?: string;
    onremove?: () => void;
    /** A file attachment: the Download action. */
    ondownload?: () => void;
    open?: boolean;
    anchor?: HTMLElement;
    static?: boolean;
    class?: string;
  } = $props();
  // A tooltip must not hold interactive content: with Remove link or Download it is a labelled group.
  const role = $derived(onremove || ondownload ? 'group' : 'tooltip');
</script>

{#snippet card()}
  <AttachmentPreview {kind} {title} {text} {relation} />
  {#if onremove}<Button size="sm" variant="ghost" class="hover-card__remove" data-part="remove" onclick={onremove}>Remove link</Button>{/if}
  {#if ondownload}<Button size="sm" variant="ghost" data-part="download" data-testid="file-download" onclick={ondownload}>Download</Button>{/if}
{/snippet}

{#if inFlow}
  <div class="popover__surface popover__surface--static hover-card {className}" role={role} aria-label={title}>{@render card()}</div>
{:else}
  <Popover bind:open mode="manual" card placement="bottom-end" {role} label={title} {anchor} class={`hover-card ${className}`}>{@render card()}</Popover>
{/if}
