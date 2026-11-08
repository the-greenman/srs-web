/**
 * A website's menu (ADR-029 E7, srs-web#681): the container tagged `site-menu`. Its depth-0 entries
 * are the bar, depth-1 entries a dropdown under the entry above; deeper is refused. An item is a
 * record of the `nav-item` type in the page type's namespace: `nav_label`, and either a `uses`
 * relation to a page's anchor (its href follows `page_key`) or `nav_href` for a code route. An item
 * with neither is a dropdown heading. Headless and generic: no site is named here.
 */
import { shiftEntry } from "$lib/document.js";
import {
  type OutlineShift,
  type SrsRepository,
  createContainer,
  createRecordInContainer,
  createRelation,
  getContainer,
  getContainerOutline,
  getRecordOrNull,
  listContainers,
  listRelationTypes,
  listTypes,
} from "$lib/srs-client.js";
import { typeVersion } from "$lib/type-version.js";
import { setField } from "./site-edit.js";
import { type PageRef, listPages, outgoing, pageSettings } from "./site-model.js";
import type { Site } from "./site-views.js";

export const MENU_TAG = "site-menu";
/** The relations a menu item holds: an undo snapshot of the menu keeps them with the item. */
export const MENU_RELATIONS = ["uses"];
const ITEM_TYPE = "nav-item";

export interface MenuItem {
  id: string;
  label: string;
  depth: number;
  /** The page's key when the item `uses` a page. */
  pageKey?: string;
  /** The page's address, or the item's `nav_href`; none for a dropdown heading. */
  href?: string;
}

export interface ExportedMenuItem {
  label: string;
  href?: string;
  children: { label: string; href: string }[];
}

/** A page's address on the site: the page keyed `home` is the root. */
export const pageHref = (key: string): string => (key === "home" ? "/" : `/${key}`);

/** The menu container's id, or null when the site has none yet; two menus is an error. */
export function findMenu(repo: SrsRepository): string | null {
  const ids = listContainers(repo)
    .map((c) => c.containerId)
    .filter((id) => getContainer(repo, id).tags?.includes(MENU_TAG));
  if (ids.length > 1)
    throw new Error(`expected one container tagged ${MENU_TAG}, found ${ids.length}`);
  return ids[0] ?? null;
}

/** The menu, made empty on first use. */
export function ensureMenu(repo: SrsRepository): string {
  return (
    findMenu(repo) ??
    createContainer(repo, {
      title: "Site menu",
      description: "The site's menu: depth 0 is the bar, depth 1 a dropdown under the entry above.",
      tags: [MENU_TAG],
    }).containerId
  );
}

/** The menu's entries in order, with where each goes. A note in the menu container is not an item. */
export function menuItems(repo: SrsRepository, menuId: string): MenuItem[] {
  const items: MenuItem[] = [];
  for (const { instanceId, depth } of getContainerOutline(repo, menuId).entries) {
    const rec = getRecordOrNull(repo, instanceId);
    if (!rec) continue;
    const used = outgoing(repo, instanceId, "uses")[0];
    const key = used ? getRecordOrNull(repo, used)?.fieldValues.page_key : undefined;
    const pageKey = typeof key === "string" && key ? key : undefined;
    const href = pageKey ? pageHref(pageKey) : String(rec.fieldValues.nav_href ?? "") || undefined;
    items.push({
      id: instanceId,
      label: String(rec.fieldValues.nav_label ?? ""),
      depth,
      pageKey,
      href,
    });
  }
  return items;
}

function itemTypeId(repo: SrsRepository, site: Site): string {
  const types = listTypes(repo);
  const ns = types.find((t) => t.id === site.pageTypeId)?.namespace;
  const t = types.find((x) => x.namespace === ns && x.name === ITEM_TYPE);
  if (!t)
    throw new Error(
      `the site package has no ${ns}/${ITEM_TYPE} type: install a newer website package`
    );
  return t.id;
}

function newItem(repo: SrsRepository, site: Site, fieldValues: Record<string, string>): string {
  const typeId = itemTypeId(repo, site);
  return createRecordInContainer(repo, ensureMenu(repo), typeId, typeVersion(repo, typeId), {
    fieldValues,
  }).instanceId;
}

/** A new bar item, at the end, that goes to a page (`uses` its anchor), labelled with the page's title. */
export function addMenuPage(repo: SrsRepository, site: Site, page: PageRef): string {
  if (!listRelationTypes(repo).some((t) => t.key === "uses"))
    throw new Error(
      "A menu item points at a page by a uses relation, and this repository has no uses relation type"
    );
  const id = newItem(repo, site, { nav_label: page.title });
  createRelation(repo, {
    relationType: "uses",
    sourceInstanceId: id,
    targetInstanceId: page.anchorId,
  });
  return id;
}

/** A new bar item, at the end, that goes to a code route. */
export function addMenuLink(repo: SrsRepository, site: Site, label: string, href: string): string {
  return newItem(repo, site, { nav_label: label, nav_href: href });
}

export function renameMenuItem(repo: SrsRepository, id: string, label: string): void {
  if (!label.trim()) throw new Error("A menu item needs a label");
  setField(repo, id, "nav_label", label.trim());
}

/** A link item's code route; a page item's address follows its page. */
export function setMenuHref(repo: SrsRepository, id: string, href: string): void {
  if (outgoing(repo, id, "uses").length)
    throw new Error("This item goes to a page: its address follows the page's key");
  setField(repo, id, "nav_href", href.trim());
}

/**
 * Move an item up or down among its siblings, into the dropdown of the item above (indent) or back
 * to the bar (outdent). The menu has one dropdown level, so an indent that would go deeper is refused.
 */
export function shiftMenuItem(
  repo: SrsRepository,
  menuId: string,
  id: string,
  shift: OutlineShift
): void {
  const entries = getContainerOutline(repo, menuId).entries;
  const e = entries.find((x) => x.instanceId === id);
  if (!e) throw new Error("That item is not in the menu");
  if (shift === "indent" && (e.depth > 0 || e.hasChildren))
    throw new Error("The menu has one dropdown level: a dropdown cannot go inside another");
  shiftEntry(repo, menuId, id, shift);
}

/**
 * The menu as a site renders it, or null when the site has none. Throws on what a site cannot draw:
 * depth 2, a dropdown entry with no target or no bar item above, an item that uses more than one
 * record or a page that is not published, a bar item with no target and no dropdown.
 */
export function exportMenu(repo: SrsRepository, site: Site): ExportedMenuItem[] | null {
  const menuId = findMenu(repo);
  if (!menuId) return null;
  const published = new Set(
    listPages(repo, site)
      .filter((p) => pageSettings(repo, p).publish !== "no")
      .map((p) => p.key)
  );
  const menu: ExportedMenuItem[] = [];
  for (const item of menuItems(repo, menuId)) {
    const fail = (why: string) => {
      throw new Error(`menu item "${item.label}": ${why}`);
    };
    const used = outgoing(repo, item.id, "uses");
    if (used.length > 1) fail("uses more than one record");
    if (used.length && !(item.pageKey && published.has(item.pageKey)))
      fail(`uses ${used[0]}, which is not a published page`);
    if (item.depth === 0) menu.push({ label: item.label, href: item.href, children: [] });
    else if (item.depth > 1)
      fail(`is at depth ${item.depth}; the menu has the bar and one dropdown level`);
    else if (!item.href) fail("is a dropdown entry with no page or nav_href");
    else {
      const parent = menu.at(-1);
      if (!parent) fail("is a dropdown entry with no bar item above it");
      parent?.children.push({ label: item.label, href: item.href as string });
    }
  }
  for (const m of menu)
    if (!m.href && !m.children.length)
      throw new Error(`menu item "${m.label}" has no page, no nav_href and no dropdown entries`);
  return menu;
}
