/**
 * Editing a website's pages (ADR-029 "Editing", srs-web#680 B1): headless, generic. Moves are
 * `$lib/document` calls; nothing here re-implements them, and no site is named.
 */
import {
  type DocumentSnapshot,
  type Target,
  areaId,
  deleteFromBin,
  ensureContainer,
  moveEntry,
  snapshotDocument,
  transfer,
} from "$lib/document.js";
import {
  type SrsRepository,
  containersForInstance,
  createContainer,
  createRecord,
  createRecordInContainer,
  createRelation,
  deleteRelation,
  getContainerOutline,
  getRecord,
  listRelations,
  listTypes,
  typeSchema,
  updateRecord,
} from "$lib/srs-client.js";
import { typeVersion } from "$lib/type-version.js";
import { uuid5 } from "$lib/uuid5.js";
import { type PageRef, listPages, outgoing, pageBlocks, typeKey } from "./site-model.js";
import { type Site, viewFor } from "./site-views.js";

/**
 * A new page: a record of the site's page type (its `page_key` and `page_title`, ADR-029 E4) and
 * the container anchored on it, the record its first entry, as a new essay is made.
 */
export function newPage(repo: SrsRepository, site: Site, title: string, wanted: string): PageRef {
  const key = freeKey(repo, site, wanted);
  // Every other field the page type requires starts empty; the writer fills it in the inspector.
  const required =
    (typeSchema(repo, site.pageTypeId).schema.required as string[] | undefined) ?? [];
  const fieldValues: Record<string, string> = Object.fromEntries(
    required.map((name) => [name, ""])
  );
  const anchor = createRecord(repo, site.pageTypeId, typeVersion(repo, site.pageTypeId), {
    fieldValues: { ...fieldValues, page_key: key, page_title: title },
  });
  const container = createContainer(repo, {
    title,
    anchorInstanceId: anchor.instanceId,
    identityInstanceId: anchor.instanceId,
    memberInstanceIds: [{ instanceId: anchor.instanceId }],
  });
  return { containerId: container.containerId, anchorId: anchor.instanceId, title, key };
}

/** `key`, or `key-2`, `key-3`, ...: the first a page of the site does not already have (it is the page's address). */
function freeKey(repo: SrsRepository, site: Site, key: string): string {
  const taken = new Set(listPages(repo, site).map((p) => p.key));
  if (!taken.has(key)) return key;
  let n = 2;
  while (taken.has(`${key}-${n}`)) n++;
  return `${key}-${n}`;
}

/** Change a page's key (its address on the site): never empty, never another page's. */
export function setPageKey(repo: SrsRepository, site: Site, page: PageRef, key: string): void {
  const k = key.trim();
  if (!k) throw new Error("A page needs a key: it is the page's address on the site");
  if (listPages(repo, site).some((p) => p.key === k && p.containerId !== page.containerId))
    throw new Error(`Another page already has the key "${k}"`);
  setField(repo, page.anchorId, "page_key", k);
}

// --- a page's areas (ADR-029 E2) -----------------------------------------------------------------

/**
 * A page's drafts. Not `areaId`: the prototype site editor made these containers first, under its own
 * namespace, and muSrs holds them; the id stays so nothing moves (successor over overwrite).
 */
const DRAFTS_NS = "6f1d2c4e-8a3b-5c7d-9e0f-1a2b3c4d5e6f";
export const draftsIdFor = (page: PageRef): string =>
  uuid5(DRAFTS_NS, `${page.containerId}:drafts`);
export const binIdFor = (page: PageRef): string => areaId(page.anchorId, "bin");

/** Make a page's drafts and Bin before the first write that may need them (each once). */
export function ensureAreas(repo: SrsRepository, page: PageRef): void {
  ensureContainer(repo, draftsIdFor(page), `Drafts · ${page.title}`);
  ensureContainer(repo, binIdFor(page), `Bin · ${page.title}`);
}

/** The page's own state, for undo: its outline, its drafts and Bin, and the records in them. */
export const snapshotPage = (repo: SrsRepository, page: PageRef): DocumentSnapshot =>
  snapshotDocument(
    repo,
    [page.containerId, draftsIdFor(page), binIdFor(page)].filter((c) => exists(repo, c)),
    [page.anchorId]
  );

/** Whether a container exists: a page's drafts and Bin are made on first use. */
function exists(repo: SrsRepository, containerId: string): boolean {
  try {
    getContainerOutline(repo, containerId);
    return true;
  } catch {
    return false;
  }
}

// --- groups: `contains` says what a group holds, depth arranges it (ADR-029 E3) ------------------

/** The group that `contains` an id, if any: the relation, not the outline. */
const groupOf = (repo: SrsRepository, id: string): string | undefined =>
  listRelations(repo, { target: id, relationType: "contains" })[0]?.sourceInstanceId;

/**
 * Nest every item at depth 1 under the group that `contains` it, keeping the container's order.
 * Depth is repaired from `contains`, never the reverse; an item is never made a group. Returns
 * whether anything moved (so a repaired page is a no-op the second time).
 */
export function nestItems(repo: SrsRepository, containerId: string): boolean {
  let entries: { instanceId: string; parentInstanceId?: string | null }[];
  try {
    entries = getContainerOutline(repo, containerId).entries;
  } catch {
    return false; // no such container: a page's drafts before the first draft
  }
  const ids = new Set(entries.map((e) => e.instanceId));
  const last = new Map<string, string>(); // each group's last nested item so far
  let moved = false;
  for (const e of entries) {
    const group = listRelations(repo, { target: e.instanceId, relationType: "contains" })
      .map((r) => r.sourceInstanceId)
      .find((g) => ids.has(g) && g !== e.instanceId);
    if (!group) continue;
    const prev = last.get(group);
    if (e.parentInstanceId !== group) {
      moveEntry(
        repo,
        containerId,
        e.instanceId,
        prev ? { id: prev, zone: "after" } : { id: group, zone: "into" }
      );
      moved = true;
    }
    last.set(group, e.instanceId);
  }
  return moved;
}

/**
 * Where `id` may land beside `relativeTo`: beside it when both are top-level or items of one group;
 * a block beside an item goes beside its group; an item never leaves its group (undefined).
 */
function beside(repo: SrsRepository, id: string, relativeTo: string): string | undefined {
  const mine = groupOf(repo, id);
  const theirs = groupOf(repo, relativeTo);
  if (mine === theirs) return relativeTo;
  return mine ? undefined : theirs;
}

/** Move a block (a group with its items) before or after another; an impossible move does nothing. */
/** Where a block goes: beside another block, or (id null) at the end. Never "into": depth follows `contains` (E3). */
export type Place = Target & { zone: "before" | "after" };

export function moveBlock(repo: SrsRepository, page: PageRef, id: string, t: Place): void {
  if (!t.id && groupOf(repo, id)) return; // an item never leaves its group, not even to the end
  const target = t.id ? beside(repo, id, t.id) : null; // null: to the end
  if (target !== undefined) moveEntry(repo, page.containerId, id, { id: target, zone: t.zone });
}

// --- drafts, alternatives and the Bin (prototype D7) --------------------------------------------

export function toDrafts(repo: SrsRepository, page: PageRef, id: string): void {
  ensureAreas(repo, page);
  transfer(repo, page.containerId, draftsIdFor(page), id);
}

/** Put a draft on the page beside a block, or at the end. */
export function fromDrafts(repo: SrsRepository, page: PageRef, id: string, t?: Place): void {
  const target = t?.id ? beside(repo, id, t.id) : undefined;
  if (t?.id && !target) return;
  transfer(
    repo,
    draftsIdFor(page),
    page.containerId,
    id,
    target ? { id: target, zone: t?.zone ?? "after" } : undefined
  );
}

/** A draft takes a block's place (an item's place in its group too); the block goes to drafts. */
export function swapIn(repo: SrsRepository, page: PageRef, draftId: string, slotId: string): void {
  const group = groupOf(repo, slotId);
  if (groupOf(repo, draftId) !== group) {
    // the draft leaves any group it was in; an item's alternative takes the item's place in its group
    for (const r of listRelations(repo, { target: draftId, relationType: "contains" }))
      deleteRelation(repo, r.relationId);
    if (group) {
      for (const r of listRelations(repo, { target: slotId, relationType: "contains" }))
        deleteRelation(repo, r.relationId);
      createRelation(repo, {
        relationType: "contains",
        sourceInstanceId: group,
        targetInstanceId: draftId,
      });
    }
  }
  transfer(repo, draftsIdFor(page), page.containerId, draftId, { id: slotId, zone: "before" });
  transfer(repo, page.containerId, draftsIdFor(page), slotId);
}

/** Move a block (with its items) from the page or its drafts into the Bin. */
export function toBin(
  repo: SrsRepository,
  page: PageRef,
  id: string,
  from: string = page.containerId
): void {
  ensureAreas(repo, page);
  transfer(repo, from, binIdFor(page), id);
}

/** Put a block back from the Bin, at the end of the page. */
export function fromBin(repo: SrsRepository, page: PageRef, id: string): void {
  transfer(repo, binIdFor(page), page.containerId, id);
}

/**
 * Delete a block and its items for good, from the Bin only. A record another container holds, or that
 * another record derives from (an alternative's lineage), only leaves the Bin.
 */
export function deleteForever(repo: SrsRepository, page: PageRef, id: string): void {
  const bin = binIdFor(page);
  const inBin = (() => {
    try {
      return getContainerOutline(repo, bin).entries.some((e) => e.instanceId === id);
    } catch {
      return false; // no Bin yet: nothing is in it
    }
  })();
  if (!inBin) throw new Error("Only a block in the Bin can be deleted for good");
  deleteFromBin(repo, bin, id, {
    keep: (x) =>
      containersForInstance(repo, x).some((c) => c.containerId !== bin) ||
      listRelations(repo, { target: x, relationType: "derived-from" }).length > 0,
  });
}

/**
 * The drafts that are alternatives for a block: the block's `derived-from` lineage upwards, and
 * drafts that derive directly from it (a fork of a fork is not followed down, as in the prototype).
 */
export function alternativesFor(repo: SrsRepository, page: PageRef, blockId: string): string[] {
  const lineage = new Set([blockId]);
  for (let frontier = [blockId]; frontier.length; ) {
    const next: string[] = [];
    for (const id of frontier)
      for (const up of outgoing(repo, id, "derived-from"))
        if (!lineage.has(up)) {
          next.push(up);
          lineage.add(up);
        }
    frontier = next;
  }
  let drafts: string[];
  try {
    drafts = getContainerOutline(repo, draftsIdFor(page)).entries.map((e) => e.instanceId);
  } catch {
    return [];
  }
  return drafts.filter(
    (d) => lineage.has(d) || outgoing(repo, d, "derived-from").some((x) => lineage.has(x))
  );
}

// --- new blocks and fields ----------------------------------------------------------------------

const typeIdOf = (repo: SrsRepository, key: string): string => {
  const t = listTypes(repo).find((x) => `${x.namespace}/${x.name}` === key);
  if (!t) throw new Error(`type ${key} is not installed`);
  return t.id;
};

/** `<typeName>-<n>`, n one past the highest such key on the page, its drafts and its Bin. */
function nextKey(repo: SrsRepository, page: PageRef, field: string, typeName: string): string {
  const pattern = new RegExp(`^${typeName}-(\\d+)$`);
  const taken = [page.containerId, draftsIdFor(page), binIdFor(page)]
    .filter((c) => exists(repo, c))
    .flatMap((c) => getContainerOutline(repo, c).entries)
    .map((e) => String(getRecord(repo, e.instanceId)?.fieldValues[field] ?? "").match(pattern)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return `${typeName}-${Math.max(0, ...taken) + 1}`;
}

/** A new, empty record of a dispatched type on a page: required fields empty, its key field numbered. */
function newRecord(repo: SrsRepository, site: Site, page: PageRef, key: string): string {
  const typeId = typeIdOf(repo, key);
  const required = (typeSchema(repo, typeId).schema.required as string[] | undefined) ?? [];
  const fieldValues: Record<string, string> = Object.fromEntries(required.map((n) => [n, ""]));
  const keyField = viewFor(site, key)?.fields.find((f) => f.hint === "key")?.name;
  if (keyField) fieldValues[keyField] = nextKey(repo, page, keyField, key.split("/")[1]);
  return createRecordInContainer(repo, page.containerId, typeId, typeVersion(repo, typeId), {
    fieldValues,
  }).instanceId;
}

/** A new block of a type the site offers, at the end or beside a block. */
export function addBlock(
  repo: SrsRepository,
  site: Site,
  page: PageRef,
  key: string,
  t?: Place
): string {
  if (!viewFor(site, key)) throw new Error(`the site does not offer ${key}`);
  const id = newRecord(repo, site, page, key);
  if (t?.id) moveBlock(repo, page, id, t);
  return id;
}

/** The item types a group takes: those of the items it already holds (ADR-029 E5). */
export function itemTypes(repo: SrsRepository, page: PageRef, groupId: string): string[] {
  const block = pageBlocks(repo, page).find((b) => b.id === groupId);
  return [...new Set((block?.items ?? []).map((i) => typeKey(i.record)))];
}

/** A new item at the end of a group: the group `contains` it, and it is nested under it. */
export function addItem(
  repo: SrsRepository,
  site: Site,
  page: PageRef,
  groupId: string,
  key: string
): string {
  const id = newRecord(repo, site, page, key);
  createRelation(repo, {
    relationType: "contains",
    sourceInstanceId: groupId,
    targetInstanceId: id,
  });
  nestItems(repo, page.containerId);
  return id;
}

/** Write one field of a record. */
export function setField(repo: SrsRepository, id: string, name: string, value: unknown): void {
  const rec = getRecord(repo, id);
  if (!rec) throw new Error(`no record ${id}`);
  updateRecord(repo, id, {
    fieldValues: { ...rec.fieldValues, [name]: value } as typeof rec.fieldValues,
  });
}
