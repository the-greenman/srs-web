/**
 * A website's pages (ADR-029, srs-web#680): a page is a container anchored on a record of the
 * site's page type; its blocks are the container's entries in arranged order, and a group's
 * items are the entries it `contains`. How a page sits in the site is the container's tags:
 * `published`, `draft` (with published: served, not indexed), `closing-mark`, `layout:<name>`.
 * Generic: no site is named here.
 */
import {
  type Container,
  type SrsRecord,
  type SrsRepository,
  getContainer,
  getRecord,
  getRecordOrNull,
  listContainers,
  listRelations,
  updateContainer,
} from "$lib/srs-client.js";
import type { Site } from "./site-views.js";

export type Publish = "no" | "draft" | "yes";

export interface PageSettings {
  publish: Publish;
  closingMark: boolean;
  layout: string;
}

export interface PageRef {
  containerId: string;
  anchorId: string;
  title: string;
  key: string;
}

export interface Block {
  id: string;
  record: SrsRecord;
  items: Block[];
}

const PUBLISHED = "published";
const DRAFT = "draft";
const CLOSING_MARK = "closing-mark";
const LAYOUT = "layout:";
export const DEFAULT_LAYOUT = "standard";

export const typeKey = (r: SrsRecord) => `${r.typeNamespace}/${r.typeName}`;
const memberIds = (c: Container) => (c.memberInstanceIds ?? []).map((e) => e.instanceId);

/** Every page of the site, published or not, in container-list order. */
export function listPages(repo: SrsRepository, site: Site): PageRef[] {
  const pages: PageRef[] = [];
  for (const { containerId } of listContainers(repo)) {
    const c = getContainer(repo, containerId);
    const anchor = c.anchorInstanceId ? getRecordOrNull(repo, c.anchorInstanceId) : null;
    if (!anchor || anchor.typeId !== site.pageTypeId) continue;
    pages.push({
      containerId,
      anchorId: anchor.instanceId,
      title: c.title,
      key: String(anchor.fieldValues.page_key ?? ""),
    });
  }
  return pages;
}

/** Targets of `id`'s outgoing relations of one type. */
export const outgoing = (repo: SrsRepository, id: string, relationType: string): string[] =>
  listRelations(repo, { source: id, relationType }).map((r) => r.targetInstanceId);

/** A page's blocks in arranged order; a group's items (what it `contains` on the page) sit under it. */
export function pageBlocks(repo: SrsRepository, page: PageRef): Block[] {
  // Blocks are records; a note on the page (a comment, say) is not a block.
  const ids = memberIds(getContainer(repo, page.containerId)).filter(
    (id) => id !== page.anchorId && getRecordOrNull(repo, id) !== null
  );
  const children = new Map(
    ids.map((id) => [id, outgoing(repo, id, "contains").filter((x) => ids.includes(x))])
  );
  const items = new Set([...children.values()].flat());
  // One level, as the site renders: a group's items are not groups themselves (a contains cycle cannot recurse).
  const one = (id: string): Block => ({ id, record: getRecord(repo, id) as SrsRecord, items: [] });
  return ids
    .filter((id) => !items.has(id))
    .map((id) => ({
      ...one(id),
      items: ids.filter((x) => children.get(id)?.includes(x)).map(one),
    }));
}

export function pageSettings(repo: SrsRepository, page: PageRef): PageSettings {
  const tags = getContainer(repo, page.containerId).tags ?? [];
  const published = tags.includes(PUBLISHED);
  return {
    publish: !published ? "no" : tags.includes(DRAFT) ? "draft" : "yes",
    closingMark: tags.includes(CLOSING_MARK),
    layout: tags.find((t) => t.startsWith(LAYOUT))?.slice(LAYOUT.length) ?? DEFAULT_LAYOUT,
  };
}

/** Write page settings as tags; tags this module does not own are kept. */
export function setPageSettings(
  repo: SrsRepository,
  page: PageRef,
  change: Partial<PageSettings>
): void {
  const now = { ...pageSettings(repo, page), ...change };
  const own = (t: string) =>
    t === PUBLISHED || t === DRAFT || t === CLOSING_MARK || t.startsWith(LAYOUT);
  const tags = [
    ...(getContainer(repo, page.containerId).tags ?? []).filter((t) => !own(t)),
    ...(now.publish !== "no" ? [PUBLISHED] : []),
    ...(now.publish === "draft" ? [DRAFT] : []),
    ...(now.closingMark ? [CLOSING_MARK] : []),
    ...(now.layout !== DEFAULT_LAYOUT ? [`${LAYOUT}${now.layout}`] : []),
  ];
  updateContainer(repo, page.containerId, { tags });
}
