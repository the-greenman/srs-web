<!--
  BlockStack — an ordered outline list with native drag-and-drop targets. Row content is a
  snippet, so Block, the LayersPanel row and the DraftTray row all reuse the same list/drop
  logic. Each row receives `handle` attributes to spread on its drag handle.
  The stack reports drops; it never mutates data (the shell asks the engine).
  Wraps .block-stack (src/styles/components/block.css).
  Epic: https://github.com/the-greenman/muDemocracy.org/issues/224
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { DRAG_MIME, dragging, endDrag, startDrag, zoneOf } from './dnd';
  import type { DragPayload, Zone } from './dnd';

  export interface StackItem {
    id: string;
    depth: number;
  }
  export interface DropTarget {
    /** null = dropped on empty space: append. */
    id: string | null;
    zone: Zone;
  }
  type HandleAttrs = {
    draggable: true;
    ondragstart: (e: DragEvent) => void;
    ondragend: () => void;
  };

  let {
    items,
    source,
    ondrop,
    row,
    nest = false,
    candrop = () => true,
    onfiles,
    label = 'Paragraphs',
    class: klass = '',
  }: {
    items: StackItem[];
    /** Name of this list, carried in the drag payload. */
    source: string;
    ondrop: (payload: DragPayload, target: DropTarget) => void;
    row: Snippet<[StackItem, HandleAttrs]>;
    /** Allow dropping onto the middle of a row to nest under it (layers). */
    nest?: boolean;
    /** False when dropping `dragId` on `targetId` is illegal (e.g. into its own run): no drop offered. */
    candrop?: (dragId: string, targetId: string) => boolean;
    /** Files dropped onto a row. Absent: file drags are ignored (never a reorder either way). */
    onfiles?: (id: string, files: File[]) => void;
    label?: string;
    class?: string;
  } = $props();

  let over = $state<{ id: string | null; zone: Zone } | null>(null);
  /** The row a file drag is over (a separate state: it has no zone). */
  let fileOver = $state<string | null>(null);

  const accepts = (e: DragEvent) => e.dataTransfer?.types.includes(DRAG_MIME) ?? false;

  const hasFiles = (e: DragEvent) => !!onfiles && (e.dataTransfer?.types.includes('Files') ?? false);

  function handleFor(item: StackItem): HandleAttrs {
    return {
      draggable: true,
      ondragstart: (e) => startDrag(e, { id: item.id, from: source }),
      ondragend: () => {
        endDrag();
        over = null;
      },
    };
  }

  function finish(e: DragEvent, id: string | null, zone: Zone) {
    const p = dragging();
    over = null;
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    ondrop(p, { id, zone });
  }
</script>

<ol
  class={`block-stack ${klass}`}
  aria-label={label}
  ondragover={(e) => {
    if (!accepts(e)) return;
    e.preventDefault();
    if (e.target === e.currentTarget) over = { id: null, zone: 'after' };
  }}
  ondragleave={(e) => {
    if (e.target === e.currentTarget) over = null;
  }}
  ondrop={(e) => finish(e, null, 'after')}
>
  {#each items as item (item.id)}
    <li
      class="block-stack__item"
      class:is-drop-before={over?.id === item.id && over.zone === 'before'}
      class:is-drop-after={over?.id === item.id && over.zone === 'after'}
      class:is-drop-into={over?.id === item.id && over.zone === 'into'}
      class:is-drop-file={fileOver === item.id}
      style:--depth={item.depth}
      data-id={item.id}
      ondragover={(e) => {
        if (hasFiles(e)) {
          e.preventDefault();
          fileOver = item.id;
          return;
        }
        if (!accepts(e)) return;
        e.stopPropagation(); // also keeps the list from offering "append" over a refused row
        const p = dragging();
        if (p && !candrop(p.id, item.id)) {
          over = null;
          return;
        }
        e.preventDefault();
        over = { id: item.id, zone: zoneOf(e, e.currentTarget, nest) };
      }}
      ondragleave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) fileOver = null;
      }}
      ondrop={(e) => {
        if (hasFiles(e)) {
          e.preventDefault();
          e.stopPropagation();
          fileOver = null;
          onfiles?.(item.id, Array.from(e.dataTransfer?.files ?? []));
          return;
        }
        finish(e, item.id, zoneOf(e, e.currentTarget, nest));
      }}
    >
      {@render row(item, handleFor(item))}
    </li>
  {/each}
</ol>
