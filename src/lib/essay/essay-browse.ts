/**
 * Browsing essays by domain and family (srs-web#623). Headless: compositions of srs-client reads only.
 * An essay's domain is its `within-boundary` boundary (srs-web#571); a boundary that `narrows` another sits
 * beneath it. Within a domain essays are newest first. An essay's family is the essays it is `derived-from`
 * or that derive from it (a copy), plus every essay it shares a paragraph with; shared paragraphs are the
 * strongest link, so each link carries its count.
 */
import {
  getRecord,
  listContainers,
  listRecords,
  listRelations,
  listTypes,
} from "$lib/srs-client.js";
import type { SrsRepository } from "$lib/srs-client.js";
import { recordsOfType } from "$lib/type-version.js";
import { NARROWS, WITHIN_BOUNDARY } from "./essay-domain.js";
import { ESSAY_TYPE_ID, PARAGRAPH_TYPE_ID } from "./type-registry.js";

const DERIVED_FROM = "derived-from";

export interface FamilyLink {
  essayId: string;
  title: string;
  /** Paragraphs the two essays both hold. */
  shared: number;
  /** This essay is `derived-from` the other (`parent`), the other from it (`child`), or neither (`sibling`). */
  kind: "parent" | "child" | "sibling";
}
export interface BrowsedEssay {
  id: string;
  title: string;
  /** ISO time the essay was created, "" when unknown. */
  createdAt: string;
  family: FamilyLink[];
  /** Paragraphs this essay shares with any other essay. */
  sharedParagraphs: number;
}
export interface DomainGroup {
  boundaryId: string | null;
  label: string;
  /** 0 for a domain with no parent in the list; one more for each `narrows` step down from it. */
  depth: number;
  essays: BrowsedEssay[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const newestFirst = (a: BrowsedEssay, b: BrowsedEssay): number =>
  b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title);

function paragraphsOf(repo: SrsRepository, essayId: string): Set<string> {
  const out = new Set<string>();
  const c = listContainers(repo, { anchorInstanceId: essayId })[0];
  if (c)
    for (const r of listRecords(repo, { containerId: c.containerId }))
      if (r.typeId === PARAGRAPH_TYPE_ID) out.add(r.instanceId);
  return out;
}

/** Every essay, with its family and the paragraphs it shares; no grouping. */
export function essayFamilies(repo: SrsRepository): BrowsedEssay[] {
  const records = recordsOfType(repo, listTypes(repo), ESSAY_TYPE_ID);
  const title = new Map(
    records.map((r) => [r.instanceId, str(r.fieldValues.title) || "Untitled essay"])
  );
  const paragraphs = new Map(records.map((r) => [r.instanceId, paragraphsOf(repo, r.instanceId)]));
  const parentOf = new Map<string, Set<string>>();
  for (const r of listRelations(repo, { relationType: DERIVED_FROM }))
    if (title.has(r.sourceInstanceId) && title.has(r.targetInstanceId)) {
      const set = parentOf.get(r.sourceInstanceId) ?? new Set<string>();
      set.add(r.targetInstanceId);
      parentOf.set(r.sourceInstanceId, set);
    }
  return records
    .map((r): BrowsedEssay => {
      const mine = paragraphs.get(r.instanceId) ?? new Set<string>();
      const family: FamilyLink[] = [];
      const sharedAny = new Set<string>();
      for (const other of records) {
        if (other.instanceId === r.instanceId) continue;
        const theirs = paragraphs.get(other.instanceId) ?? new Set<string>();
        let shared = 0;
        for (const p of mine)
          if (theirs.has(p)) {
            shared++;
            sharedAny.add(p);
          }
        const isParent = parentOf.get(r.instanceId)?.has(other.instanceId) ?? false;
        const isChild = parentOf.get(other.instanceId)?.has(r.instanceId) ?? false;
        if (!shared && !isParent && !isChild) continue;
        family.push({
          essayId: other.instanceId,
          title: title.get(other.instanceId) ?? "",
          shared,
          kind: isParent ? "parent" : isChild ? "child" : "sibling",
        });
      }
      family.sort((a, b) => b.shared - a.shared || a.title.localeCompare(b.title));
      return {
        id: r.instanceId,
        title: title.get(r.instanceId) ?? "",
        createdAt: r.createdAt ?? "",
        family,
        sharedParagraphs: sharedAny.size,
      };
    })
    .sort(newestFirst);
}

/**
 * The essays grouped by domain, a domain's more specialised domains directly after it (indented by `depth`),
 * essays newest first inside each. Essays naming no domain come last, as one group with a null boundary.
 */
export function browseEssays(repo: SrsRepository): DomainGroup[] {
  const essays = essayFamilies(repo);
  const byBoundary = new Map<string, BrowsedEssay[]>();
  const none: BrowsedEssay[] = [];
  for (const e of essays) {
    const b = listRelations(repo, { source: e.id, relationType: WITHIN_BOUNDARY })[0]
      ?.targetInstanceId;
    if (!b) none.push(e);
    else byBoundary.set(b, [...(byBoundary.get(b) ?? []), e]);
  }
  const label = (id: string): string => {
    const r = getRecord(repo, id);
    return r?.displayLabel || r?.instanceId || id;
  };
  // A boundary's parent is the first boundary it `narrows` that also holds essays or is itself a parent of one.
  const parentOf = (id: string): string | null =>
    listRelations(repo, { source: id, relationType: NARROWS })[0]?.targetInstanceId ?? null;
  const all = new Set(byBoundary.keys());
  for (const b of [...all])
    for (let p = parentOf(b), n = 0; p && n < 16; p = parentOf(p), n++) all.add(p);
  const kids = new Map<string | null, string[]>();
  for (const b of all) {
    const p = parentOf(b);
    const key = p && all.has(p) ? p : null;
    kids.set(key, [...(kids.get(key) ?? []), b]);
  }
  const newest = (b: string): string =>
    (byBoundary.get(b) ?? [])
      .map((e) => e.createdAt)
      .sort()
      .pop() ?? "";
  const out: DomainGroup[] = [];
  const walk = (b: string, depth: number, seen: Set<string>): void => {
    if (seen.has(b)) return;
    seen.add(b);
    const mine = byBoundary.get(b) ?? [];
    if (mine.length) out.push({ boundaryId: b, label: label(b), depth, essays: mine });
    for (const k of (kids.get(b) ?? []).sort((x, y) => label(x).localeCompare(label(y))))
      walk(k, depth + (mine.length ? 1 : 0), seen);
  };
  const seen = new Set<string>();
  for (const root of (kids.get(null) ?? []).sort(
    (x, y) => newest(y).localeCompare(newest(x)) || label(x).localeCompare(label(y))
  ))
    walk(root, 0, seen);
  if (none.length) out.push({ boundaryId: null, label: "No domain yet", depth: 0, essays: none });
  return out;
}
