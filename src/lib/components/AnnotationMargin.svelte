<!--
  AnnotationMargin — the margin of one instance: renders Annotation[] (src/lib/annotations.ts) as one
  row system. The ONE place for order, grouping, overflow ("+N" opens a small list) and each kind's
  look (KINDS: order + presentation). Every row is a mark on a shared left edge (data-part="mark")
  and, when expanded, a clamped label. Kind icons come from annotation-icons.ts (D3); a mark's hue is
  the attaching actor's (--actor-hue, neutral without one). Presentation only: `onopen` reports the
  click, the shell decides what it does. `variant` mirrors the shell's `data-margin`.
  Wraps .margin (src/styles/components/margin.css). Story: srs-web#374 (epic #224), #422.
-->
<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Copy from "@lucide/svelte/icons/copy";
  import { actorHue } from "$lib/actor-hue.js";
  import type { Annotation, AnnotationKind } from "$lib/annotations.js";
  import AttachmentGlyph from "./AttachmentGlyph.svelte";
  import Button from "./Button.svelte";
  import CommentBadge from "./CommentBadge.svelte";
  import MarginRow from "./MarginRow.svelte";
  import Popover from "./Popover.svelte";

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

  /** The kind -> presentation map: order (lower first) and whether the row carries a label when expanded. */
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
  const labelOf = (a: Annotation) => (a.kind === "relation" ? `${a.icon} · ${a.label}` : a.label);
  const hueOf = (a: Annotation) => (a.actor?.id ? actorHue(a.actor.id) : undefined);
</script>

{#snippet mark(a: Annotation)}
  {#if a.kind === "comments"}
    <CommentBadge count={a.count ?? 0} label={a.label} open={isOn(a)} onclick={() => onopen(a)} />
  {:else if a.kind === "attachment"}
    <AttachmentGlyph kind={a.icon ?? "note"} title={a.label} text={a.text} relation={a.relation} actor={a.actor} pinned={isOn(a)} onpin={() => onopen(a)} onremove={onremove && (() => onremove(a))} />
  {:else if a.kind === "shared"}
    <button type="button" class="margin__relation hue-pill hue-pill--neutral" data-part="mark" data-testid="shared-badge" aria-label={a.label} title={`${a.label} - make a local copy`} onclick={() => onopen(a)}><Copy size={14} aria-hidden="true" /></button>
  {:else}
    <button
      type="button"
      class="margin__relation hue-pill"
      class:hue-pill--neutral={!a.actor?.id}
      style:--actor-hue={hueOf(a)}
      data-part="mark"
      data-testid="relation-indicator"
      aria-label={`${a.icon} ${ARROW[a.direction ?? "out"]} ${a.label}`}
      title={`${a.icon} ${ARROW[a.direction ?? "out"]} ${a.label}`}
      onclick={() => onopen(a)}
    >{#if (a.direction ?? "out") === "out"}<ArrowRight size={14} aria-hidden="true" />{:else}<ArrowLeft size={14} aria-hidden="true" />{/if}</button>
  {/if}
{/snippet}

{#snippet row(a: Annotation, always = false)}
  <MarginRow
    kind={a.kind === "relation" ? (a.icon ?? "relation") : a.kind}
    label={a.label}
    text={always || (variant === "expanded" && KINDS[a.kind].chip) ? labelOf(a) : ""}
    card={a.kind === "relation" || a.kind === "shared"}
  >
    {@render mark(a)}
  </MarginRow>
{/snippet}

<div class="margin margin--{variant}" data-testid="paragraph-margin">
  {#each shown as a (a.key)}
    {@render row(a)}
  {/each}
  {#if rest.length}
    <div class="margin__overflow">
      <Popover bind:open={more} placement="bottom-end" role="region" label="More annotations" class="margin__list">
        {#snippet trigger({ props })}
          <Button size="sm" variant="ghost" class="margin__more" data-part="more" data-testid="margin-more" aria-label={`${rest.length} more annotations`} {...props}>+{rest.length}</Button>
        {/snippet}
        {#if more}
          <ul class="margin__items" data-testid="margin-overflow" data-part="overflow">
            {#each rest as a (a.key)}
              <li>{@render row(a, true)}</li>
            {/each}
          </ul>
        {/if}
      </Popover>
    </div>
  {/if}
</div>
