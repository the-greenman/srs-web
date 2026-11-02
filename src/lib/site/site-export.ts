/**
 * The site export (ADR-029, srs-web#680): each published page as the data a site renders, its
 * blocks in arranged order, each with the View that draws it and every field but the brief.
 * ponytail: a projection in TS; srs-rust#1553 moves it into the core as a structured
 * composition render, and this becomes a thin mapping over it.
 */
import { type SrsRecord, type SrsRepository, getRecord } from "$lib/srs-client.js";
import {
  type Block,
  DEFAULT_LAYOUT,
  listPages,
  pageBlocks,
  pageSettings,
  typeKey,
} from "./site-model.js";
import { type BlockView, type Site, briefFields, viewFor } from "./site-views.js";

export type Fields = Record<string, unknown>;

export interface ExportedBlock {
  type: string;
  view: string;
  fields: Fields;
  items?: Fields[];
  [extra: string]: unknown;
}

export interface ExportedPage {
  key: string;
  title?: string;
  intent?: string;
  draft: boolean;
  closingMark: boolean;
  layout?: string;
  blocks: ExportedBlock[];
}

/** A site's additions to an exported block or item (muDemocracy: which guide section it shows). */
export type BlockExtra = (
  repo: SrsRepository,
  id: string,
  out: Fields,
  record: SrsRecord,
  isItem: boolean
) => void;

/** The View that draws a record; a type the site does not dispatch cannot be on a page. */
function viewOf(site: Site, record: SrsRecord): BlockView {
  const view = viewFor(site, typeKey(record));
  if (!view) throw new Error(`block type "${typeKey(record)}" has no View in the site Composition`);
  return view;
}

function fieldsOf(view: BlockView, record: SrsRecord): Fields {
  const brief = briefFields(view);
  return Object.fromEntries(Object.entries(record.fieldValues).filter(([k]) => !brief.has(k)));
}

/** Every published page of the site; throws on two pages with one key. */
export function exportSite(repo: SrsRepository, site: Site, extra?: BlockExtra): ExportedPage[] {
  const seen = new Set<string>();
  const pages: ExportedPage[] = [];
  for (const page of listPages(repo, site)) {
    const settings = pageSettings(repo, page);
    if (settings.publish === "no") continue;
    if (seen.has(page.key)) throw new Error(`two published pages have page_key "${page.key}"`);
    seen.add(page.key);
    const root = getRecord(repo, page.anchorId) as SrsRecord;
    const block = (b: Block): ExportedBlock => {
      const view = viewOf(site, b.record);
      const out: ExportedBlock = {
        type: b.record.typeName ?? "",
        view: view.viewId,
        fields: fieldsOf(view, b.record),
      };
      if (b.items.length)
        out.items = b.items.map((i) => {
          const item = fieldsOf(viewOf(site, i.record), i.record);
          extra?.(repo, i.id, item, i.record, true);
          return item;
        });
      extra?.(repo, b.id, out, b.record, false);
      return out;
    };
    let blocks: ExportedBlock[];
    try {
      blocks = pageBlocks(repo, page).map(block);
    } catch (e) {
      throw new Error(`page "${page.key}": ${(e as Error).message}`);
    }
    pages.push({
      key: page.key,
      title: root.fieldValues.page_title as string | undefined,
      intent: root.fieldValues.page_intent as string | undefined,
      draft: settings.publish === "draft",
      closingMark: settings.closingMark,
      layout: settings.layout === DEFAULT_LAYOUT ? undefined : settings.layout,
      blocks,
    });
  }
  return pages;
}
