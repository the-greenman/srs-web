<!--
  ParagraphMargin — the right margin of one paragraph: renders Annotation[] (essay/annotations.ts).
  The ONE place for order, grouping, overflow ("+N" opens a small list) and each kind's look
  (KINDS: order + presentation). Presentation only: `onopen` reports the click, the shell decides
  what it does. `variant` is the experiment seam: compact = marks only, expanded = marks + text.
  Wraps .margin (src/styles/components/margin.css). Story: srs-web#374 (epic #224).
-->
<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Copy from "@lucide/svelte/icons/copy";
  import AttachmentGlyph from "./AttachmentGlyph.svelte";
  import CommentBadge from "./CommentBadge.svelte";
  import Popover from "./Popover.svelte";
  import type { Annotation, AnnotationKind } from "../essay/annotations.js";

  let {
    annotations,
    variant = "compact",
    active = [],
    max = 4,
    onopen,
    onremove,
  }: {
    annotations: Annotation[];
    variant?: "compact" | "expanded";
    /** Keys currently open / pinned. */
    active?: string[];
    /** Marks shown before "+N". Comments always count toward it but sort first. */
    max?: number;
    onopen: (a: Annotation) => void;
    /** Attachments only: remove the link (a human action). */
    onremove?: (a: Annotation) => void;
  } = $props();

  /** The kind -> presentation map: order (lower first) and whether the mark carries a text chip when expanded. */
  const KINDS: Record<AnnotationKind, { order: number; chip: boolean }> = {
    comments: { order: 0, chip: false },
    attachment: { order: 1, chip: true },
    relation: { order: 2, chip: true },
    shared: { order: 3, chip: true },
  };
  /** Accessible-name wording only; the drawn mark is a Lucide arrow. */
  const ARROW = { out: "→", in: "←" } as const;

  const sorted = $derived([...annotations].sort((a, b) => KINDS[a.kind].order - KINDS[b.kind].order));
  const shown = $derived(sorted.slice(0, max));
  const rest = $derived(sorted.slice(max));
  let more = $state(false);
  const isOn = (a: Annotation) => active.includes(a.key);
</script>

{#snippet mark(a: Annotation)}
  {#if a.kind === "comments"}
    <CommentBadge count={a.count ?? 0} label={a.label} open={isOn(a)} onclick={() => onopen(a)} />
  {:else if a.kind === "attachment"}
    <AttachmentGlyph kind={a.icon ?? "note"} title={a.label} text={a.text} relation={a.relation} pinned={isOn(a)} onpin={() => onopen(a)} onremove={onremove && (() => onremove(a))} />
  {:else if a.kind === "shared"}
    <button type="button" class="margin__relation" data-testid="shared-badge" aria-label={a.label} title={`${a.label} - make a local copy`} onclick={() => onopen(a)}><Copy size={14} aria-hidden="true" /></button>
  {:else}
    <button
      type="button"
      class="margin__relation"
      data-testid="relation-indicator"
      aria-label={`${a.icon} ${ARROW[a.direction ?? "out"]} ${a.label}`}
      title={`${a.icon} ${ARROW[a.direction ?? "out"]} ${a.label}`}
      onclick={() => onopen(a)}
    >{#if (a.direction ?? "out") === "out"}<ArrowRight size={14} aria-hidden="true" />{:else}<ArrowLeft size={14} aria-hidden="true" />{/if}</button>
  {/if}
{/snippet}

<div class="margin margin--{variant}" data-testid="paragraph-margin">
  {#each shown as a (a.key)}
    <div class="margin__item">
      {@render mark(a)}
      {#if variant === "expanded" && KINDS[a.kind].chip}
        <span class="margin__text">{a.kind === "relation" ? `${a.icon} · ` : ""}{a.label}</span>
      {/if}
    </div>
  {/each}
  {#if rest.length}
    <div class="margin__overflow">
      <Popover bind:open={more} placement="bottom-end" role="region" label="More annotations" class="margin__list">
        {#snippet trigger({ props })}
          <button type="button" class="margin__more" data-testid="margin-more" aria-label={`${rest.length} more annotations`} {...props}>+{rest.length}</button>
        {/snippet}
        {#if more}
          <ul class="margin__items" data-testid="margin-overflow" data-part="overflow">
            {#each rest as a (a.key)}
              <li>{@render mark(a)}<span class="margin__text">{a.kind === "relation" ? `${a.icon} · ` : ""}{a.label}</span></li>
            {/each}
          </ul>
        {/if}
      </Popover>
    </div>
  {/if}
</div>
