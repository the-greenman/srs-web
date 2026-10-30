/**
 * read-model — the Read view's pages (ADR-029): a repository read as a document, one page at a time.
 * A page is one instance read inside one container: its text, then the entries the container's outline
 * nests directly under it, in arranged order. Every structural fact is the engine's: the front door is
 * `repositoryNavigation`'s root container and identity, nesting is the core outline's `parentInstanceId`,
 * labels and section containers come from the resolved container view (`memberItems`). Grouping a wall
 * is ADR-025's presentation grouping. Nothing here decides by repository id, field name or relation key.
 */
import type { CollectionBy } from "$lib/address.js";
import { type Item, type ReadData, loadRead, memberItems, tryRecord } from "$lib/lens/lens-data.js";
import { collectionOptions, groupItems, splittingBy } from "$lib/lens/lens-distinctions.js";
import { firstLine, proseView } from "$lib/prose.js";
import {
  type NoteInstance,
  type SrsRepository,
  getContainerOutline,
  getNote,
  repositoryNavigation,
} from "$lib/srs-client.js";

/** More entries than this under one page and they are grouped (a "wall"), as in the srs-lab Readers. */
export const WALL = 15;

export interface ReadItem extends Item {
  /** The first sentence of the item's main text (proseView's body, or a note's first section). */
  first: string;
}

export interface ReadPage {
  containerId: string;
  /** The instance read; null when the container has no identity or anchor to open on. */
  id: string | null;
  title: string;
  record?: ReadData;
  note?: NoteInstance;
  items: ReadItem[];
  /** How a wall was grouped (items carry `group`); absent when the items are a plain list. */
  groupedBy?: CollectionBy;
}

export interface ReadTarget {
  containerId: string;
  id?: string;
}

/** Where a repository opens: its root container, on its identity record. */
export function frontDoor(repo: SrsRepository): ReadTarget {
  const nav = repositoryNavigation(repo);
  return { containerId: nav.rootContainerId, id: nav.identity?.instanceId || undefined };
}

const noteText = (n: NoteInstance) => n.sections?.find((s) => s.content?.trim())?.content ?? "";

/** The item with its first line; a note is named as one, so its kind, group and label agree. */
function withFirst(repo: SrsRepository, item: Item): ReadItem {
  if (item.record) {
    const r = loadRead(repo, item.id, item.label, item.record);
    return { ...item, first: firstLine(proseView(item.record, r.fields, r.composites).body) };
  }
  const n = getNote(repo, item.id);
  return {
    ...item,
    typeName: item.typeName ?? (n ? "Note" : undefined),
    first: n ? firstLine(noteText(n)) : "",
  };
}

/**
 * The page for `id` read inside `containerId` (default: the container's identity, else its anchor).
 * Its items are the body entries whose parent is the page, or the top-level entries when the page is
 * the container's identity or anchor.
 */
export function readPage(repo: SrsRepository, containerId: string, id?: string): ReadPage {
  const outline = getContainerOutline(repo, containerId);
  const pageId = id ?? outline.identityInstanceId ?? outline.anchorInstanceId ?? null;
  const top =
    pageId === null || pageId === outline.identityInstanceId || pageId === outline.anchorInstanceId;
  const under = top ? null : pageId;
  let items: ReadItem[] = memberItems(repo, containerId)
    .filter((i) => (i.parentId ?? null) === under)
    .map((i) =>
      withFirst(repo, {
        ...i,
        depth: 0,
        // the page's own section container is where we are, not somewhere to go
        sectionContainerId: i.sectionContainerId === containerId ? undefined : i.sectionContainerId,
      })
    );
  let groupedBy: CollectionBy | undefined;
  if (items.length > WALL) {
    groupedBy = splittingBy(items, collectionOptions(items, false), "type");
    if (groupedBy) items = groupItems(items, groupedBy) as ReadItem[];
  }
  const record = pageId ? tryRecord(repo, pageId) : undefined;
  const note = pageId && !record ? (getNote(repo, pageId) ?? undefined) : undefined;
  const read = record && pageId ? loadRead(repo, pageId, "", record) : undefined;
  return {
    containerId,
    id: pageId,
    title: read?.label || note?.title || (pageId ? pageId.slice(0, 8) : ""),
    record: read,
    note,
    items,
    groupedBy,
  };
}

/**
 * Where opening an item leads: into its own section container when it roots one, else deeper here. The
 * section container wins: entries the current outline also nests under a section anchor are not shown
 * (ADR-029); the readability audit reports that as a data fix.
 */
export function openTarget(page: ReadPage, item: Item): ReadTarget {
  return { containerId: item.sectionContainerId ?? page.containerId, id: item.id };
}

/** Whether an item opens onto more: entries nested under it, or a section container it roots. */
export const opensOnto = (item: Item) => !!item.hasChildren || !!item.sectionContainerId;
