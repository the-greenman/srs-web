/**
 * The essay's domain (srs-web#571). In muSrs a domain is a boundary: the essay states
 * `within-boundary` to one boundary record, and the boundary already links its world
 * (`scopes-problem`, `contextualises-claim`, `holds-tension`, `narrows`). Headless and shared: the
 * essay editor and, later, the muDemocracy site editor use it; no SRS semantics here, only
 * compositions of srs-client reads and the core's relation create / delete.
 */
import {
  createRelation,
  deleteRelation,
  getRecord,
  listContainers,
  listRecords,
  listRelations,
} from "$lib/srs-client.js";
import type { SrsRepository } from "$lib/srs-client.js";
import { PARAGRAPH_TYPE_ID } from "./type-registry.js";

const ARG = "com.mudemocracy.argument";
export const WITHIN_BOUNDARY = `${ARG}/within-boundary`;
export const SCOPES_PROBLEM = `${ARG}/scopes-problem`;
export const CONTEXTUALISES_CLAIM = `${ARG}/contextualises-claim`;
export const HOLDS_TENSION = `${ARG}/holds-tension`;
export const NARROWS = `${ARG}/narrows`;
export const BEARS_ON = "com.mudemocracy.essay/bears-on";
const ANSWERS = "answers";

/** A record in the map, opened by id. */
export interface DomainItem {
  id: string;
  label: string;
}
export interface DomainProblem extends DomainItem {
  /** A paragraph of this essay `bears-on` the problem. */
  touched: boolean;
}
/** One boundary's own lists. */
export interface DomainLevel {
  boundary: DomainItem;
  problems: DomainProblem[];
  claims: DomainItem[];
  tensions: DomainItem[];
  remedies: DomainItem[];
}
export interface DomainMap {
  boundary: DomainItem;
  problems: { touched: DomainItem[]; untouched: DomainItem[] };
  claims: DomainItem[];
  tensions: DomainItem[];
  remedies: DomainItem[];
  /** The boundaries this one narrows, nearest first, each with its own lists (shown beneath). */
  parents: DomainLevel[];
}

const labelOf = (repo: SrsRepository, id: string): string => {
  const r = getRecord(repo, id);
  return r?.displayLabel || r?.instanceId || id;
};
const item = (repo: SrsRepository, id: string): DomainItem => ({ id, label: labelOf(repo, id) });
const unique = (ids: string[]): string[] => [...new Set(ids)];

/** The boundary the essay is within (its `within-boundary` target), or null. */
export function boundaryOf(repo: SrsRepository, essayId: string): string | null {
  return (
    listRelations(repo, { source: essayId, relationType: WITHIN_BOUNDARY })[0]?.targetInstanceId ??
    null
  );
}

/** Set the essay's boundary (replacing any earlier one); null removes it. Unchanged when already set. */
export function setBoundary(repo: SrsRepository, essayId: string, boundaryId: string | null): void {
  const current = listRelations(repo, { source: essayId, relationType: WITHIN_BOUNDARY });
  if (boundaryId && current.length === 1 && current[0].targetInstanceId === boundaryId) return;
  for (const r of current) deleteRelation(repo, r.relationId);
  if (boundaryId)
    createRelation(repo, {
      relationType: WITHIN_BOUNDARY,
      sourceInstanceId: essayId,
      targetInstanceId: boundaryId,
    });
}

/** The boundary records the writer can choose from (muSrs holds a few; a repository without any offers none). */
export function listBoundaries(repo: SrsRepository): DomainItem[] {
  return listRecords(repo)
    .filter((r) => r.typeName === "boundary")
    .map((r) => ({ id: r.instanceId, label: r.displayLabel || r.instanceId }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const outgoing = (repo: SrsRepository, from: string, type: string): string[] =>
  listRelations(repo, { source: from, relationType: type }).map((r) => r.targetInstanceId);
const incoming = (repo: SrsRepository, to: string, type: string): string[] =>
  listRelations(repo, { target: to, relationType: type }).map((r) => r.sourceInstanceId);

/** Every paragraph of the essay, in its container, its draft or its bin. */
function essayParagraphs(repo: SrsRepository, essayId: string): Set<string> {
  const out = new Set<string>();
  const c = listContainers(repo, { anchorInstanceId: essayId })[0];
  if (c)
    for (const r of listRecords(repo, { containerId: c.containerId }))
      if (r.typeId === PARAGRAPH_TYPE_ID) out.add(r.instanceId);
  return out;
}

function level(repo: SrsRepository, boundaryId: string, touchedIds: Set<string>): DomainLevel {
  const problemIds = unique(outgoing(repo, boundaryId, SCOPES_PROBLEM));
  const typeOf = (id: string) => getRecord(repo, id)?.typeName;
  const answerers = (p: string) => incoming(repo, p, ANSWERS);
  const byType = (name: string) =>
    unique(problemIds.flatMap(answerers)).filter((id) => typeOf(id) === name);
  const claimIds = unique([
    ...outgoing(repo, boundaryId, CONTEXTUALISES_CLAIM),
    ...byType("claim"),
  ]);
  return {
    boundary: item(repo, boundaryId),
    problems: problemIds.map((id) => ({ ...item(repo, id), touched: touchedIds.has(id) })),
    claims: claimIds.map((id) => item(repo, id)),
    tensions: unique(outgoing(repo, boundaryId, HOLDS_TENSION)).map((id) => item(repo, id)),
    remedies: byType("remedy").map((id) => item(repo, id)),
  };
}

/**
 * The map of the essay's domain, or null when it has none. Problems come from the boundary's
 * `scopes-problem`; one is touched when a paragraph of this essay `bears-on` it. Claims are the
 * boundary's `contextualises-claim` plus claims that `answers` those problems; remedies are the
 * remedies that `answers` them; tensions are `holds-tension`. A boundary that `narrows` another
 * carries that parent's map beneath its own (`parents`).
 */
export function domainMap(repo: SrsRepository, essayId: string): DomainMap | null {
  const boundaryId = boundaryOf(repo, essayId);
  if (!boundaryId) return null;
  const paragraphs = essayParagraphs(repo, essayId);
  const touchedIds = new Set<string>();
  for (const r of listRelations(repo, { relationType: BEARS_ON }))
    if (paragraphs.has(r.sourceInstanceId)) touchedIds.add(r.targetInstanceId);

  const own = level(repo, boundaryId, touchedIds);
  const parents: DomainLevel[] = [];
  const seen = new Set([boundaryId]);
  let frontier = [boundaryId];
  while (frontier.length) {
    const next: string[] = [];
    for (const b of frontier)
      for (const p of outgoing(repo, b, NARROWS))
        if (!seen.has(p)) {
          seen.add(p);
          next.push(p);
          parents.push(level(repo, p, touchedIds));
        }
    frontier = next;
  }
  return {
    boundary: own.boundary,
    problems: {
      touched: own.problems.filter((p) => p.touched).map(({ id, label }) => ({ id, label })),
      untouched: own.problems.filter((p) => !p.touched).map(({ id, label }) => ({ id, label })),
    },
    claims: own.claims,
    tensions: own.tensions,
    remedies: own.remedies,
    parents,
  };
}
