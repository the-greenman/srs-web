import { loadComments } from "$lib/comments.js";
import type { Comment } from "$lib/comments.js";
/**
 * Method board reads (srs-web#526): a thin composition of srs-client calls over the
 * com.semanticops.method package. The engine owns records, relations and membership; this file
 * only groups them for display: domain contains cluster, cluster contains problem, and a
 * problem's status is which of the Suggestions / Affirmed / Set aside containers holds it.
 */
import {
  addContainerMember,
  forkRecord,
  getContainer,
  listContainers,
  listRecords,
  listRelations,
  listTypes,
  removeContainerMember,
} from "$lib/srs-client.js";
import type {
  Actor,
  AgentWriteGuard,
  SrsRecord,
  SrsRelation,
  SrsRepository,
} from "$lib/srs-client.js";

export const PROBLEM_TYPE_ID = "b7d15218-cee6-4a58-8e2a-a4cb7f6ccf06";
export const CLUSTER_TYPE_ID = "c6a8eab1-25bf-462c-8d48-6ea47c22f724";
export const DOMAIN_TYPE_ID = "6e4d0e77-b30a-47d5-a686-5a595a077d4c";
export const PERSONA_TYPE_ID = "c57aafdd-d002-4ee6-9a2b-ff3805107580";
export const REMEDY_TYPE_ID = "edd84bf8-6c07-4133-87c6-4ab540ac2a14";
export const POLE_TYPE_ID = "e3b62684-70d8-403d-ac8f-164fcb4b60a9";
export const TENSION_TYPE_ID = "91bd6f8a-417c-4728-87d2-26991e451221";
const METHOD_NAMESPACE = "com.semanticops.method";
export const HELD_BY = "com.semanticops.method/held-by";
export const CONCERNS = "com.semanticops.method/concerns";
export const ANSWERS = "com.semanticops.method/answers";
const DERIVED_FROM = "derived-from";
/** Relations a fork carries (srs-rust#1354). Revisit with srs-rust#1377 (engine re-pointing). */
const CARRY: Record<Entity, "outgoing" | "all"> = {
  problem: "all",
  remedy: "outgoing",
  cluster: "all",
  persona: "all",
};

/** The three decision containers, found by title (srs-programme names them; Set aside may be absent). */
export const CONTAINER_TITLES = {
  suggestions: "Suggestions",
  affirmed: "Affirmed",
  setAside: "Set aside",
} as const;
export type ContainerKey = keyof typeof CONTAINER_TITLES;
export type MethodContainers = Partial<Record<ContainerKey, string>>;

export type ProblemStatus = "suggested" | "affirmed" | "set-aside";
export const STATUS_LABEL: Record<ProblemStatus, string> = {
  suggested: "Suggested",
  affirmed: "Affirmed",
  "set-aside": "Set aside",
};

export interface Ref {
  id: string;
  label: string;
}
/** The kinds of record the owner decides on. */
export type Entity = "problem" | "remedy" | "cluster" | "persona";
/** A linked record (persona or cluster) with its decision state; opens in the inspector. */
export interface MethodLink extends Ref {
  entity?: "cluster" | "persona";
  status?: ProblemStatus | null;
  createdBy?: Actor;
}
/** A remedy, listed under each problem it `answers` (one record, never copied). */
export interface MethodRemedy {
  entity: "remedy";
  id: string;
  title: string;
  move: string;
  doesNotFix: string;
  falsifier: string;
  returnWhen: string;
  sources: string[];
  answers: Ref[];
  createdBy?: Actor;
  status: ProblemStatus | null;
  commentCount: number;
}
export interface MethodProblem {
  entity?: "problem";
  id: string;
  problemId: string;
  title: string;
  statement: string;
  kind: string;
  /** The pole (public word: side) the problem concerns, with the tension (trade-off) holding it. */
  side?: Ref & { tradeOff?: Ref };
  imbalance: string;
  personas: MethodLink[];
  cluster?: MethodLink;
  /** Remedies that answer this problem. */
  remedies?: MethodRemedy[];
  sources: string[];
  createdBy?: Actor;
  /** null: in none of the decision containers. */
  status: ProblemStatus | null;
  /** Distinct comments on this record (comments.ts, either package); 0 when none or not installed. */
  commentCount: number;
}
export interface MethodCluster {
  id: string;
  title: string;
  status?: ProblemStatus | null;
  createdBy?: Actor;
  problems: MethodProblem[];
}
export interface MethodDomain {
  id: string;
  title: string;
  clusters: MethodCluster[];
}
export interface MethodModel {
  domains: MethodDomain[];
  problems: MethodProblem[];
  /** Every remedy, personas and clusters that can be opened and decided on (forks stand for originals). */
  remedies: MethodRemedy[];
  personas: MethodLink[];
  clusters: MethodLink[];
  containers: MethodContainers;
}

/** Plain inputs to `buildBoard` (so grouping and status are testable without the engine). */
export interface BoardInput {
  records: SrsRecord[];
  relations: SrsRelation[];
  containers: MethodContainers;
  members: Partial<Record<ContainerKey, string[]>>;
  /** Comments by target instance, from `loadComments`. */
  comments?: Record<string, Comment[]>;
}

const NO_DOMAIN = "No domain";
const NO_CLUSTER = "No cluster";
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
// Unnamed groups sort last.
const groupOrder = (a: { id: string; title: string }, b: { id: string; title: string }) =>
  (a.id === "" ? 1 : 0) - (b.id === "" ? 1 : 0) || byTitle(a, b);

/**
 * Group method records for the board; pure. Affirmed beats Set aside beats Suggestions. A suggestion an
 * Affirmed record is `derived-from` (its affirmed fork) is left off: the fork stands for it.
 */
export function buildBoard(input: BoardInput): MethodModel {
  const records = new Map(input.records.map((r) => [r.instanceId, r]));
  const label = (id: string): string => {
    const r = records.get(id);
    return r ? r.displayLabel || str(r.fieldValues.title) || id : id;
  };
  const isType = (id: string, typeId: string) => records.get(id)?.typeId === typeId;
  const parentOf = new Map<string, string>(); // child -> first containing parent of the expected type
  const personaIds = new Map<string, string[]>();
  const answersOf: [string, string][] = [];
  const side = new Map<string, string>();
  const derivedFrom: [string, string][] = [];
  for (const rel of input.relations) {
    const { sourceInstanceId: s, targetInstanceId: t } = rel;
    if (rel.relationType === "contains") {
      const ok =
        (isType(s, DOMAIN_TYPE_ID) && isType(t, CLUSTER_TYPE_ID)) ||
        (isType(s, CLUSTER_TYPE_ID) && isType(t, PROBLEM_TYPE_ID)) ||
        (isType(s, TENSION_TYPE_ID) && isType(t, POLE_TYPE_ID));
      if (ok && !parentOf.has(t)) parentOf.set(t, s);
    } else if (rel.relationType === HELD_BY) {
      personaIds.set(s, [...(personaIds.get(s) ?? []), t]);
    } else if (rel.relationType === ANSWERS && isType(s, REMEDY_TYPE_ID) && isType(t, PROBLEM_TYPE_ID)) {
      answersOf.push([s, t]);
    } else if (rel.relationType === CONCERNS && !side.has(s)) side.set(s, t);
    else if (rel.relationType === DERIVED_FROM) derivedFrom.push([s, t]);
  }
  const member = (k: ContainerKey) => new Set(input.members[k] ?? []);
  const affirmed = member("affirmed");
  const setAside = member("setAside");
  const suggested = member("suggestions");
  const status = (id: string): ProblemStatus | null =>
    affirmed.has(id)
      ? "affirmed"
      : setAside.has(id)
        ? "set-aside"
        : suggested.has(id)
          ? "suggested"
          : null;
  const affirmedForks = derivedFrom.filter(([fork]) => affirmed.has(fork));
  const affirmedOriginals = new Set(affirmedForks.map(([, original]) => original));
  const forkOf = new Map(affirmedForks.map(([fork, original]) => [original, fork]));
  const originalOf = new Map(affirmedForks);
  /** The affirmed fork stands for its suggested original everywhere it is linked. */
  const canon = (id: string): string => forkOf.get(id) ?? id;
  const shown = (id: string): boolean => !(status(id) === "suggested" && affirmedOriginals.has(id));
  const link = (id: string, entity: "cluster" | "persona"): MethodLink => ({
    id,
    label: label(id),
    entity,
    status: status(id),
    createdBy: records.get(id)?.createdBy,
  });
  const uniq = (ids: string[]): string[] => [...new Set(ids.map(canon))];
  const commentCount = (id: string) => new Set((input.comments?.[id] ?? []).map((c) => c.id)).size;

  const remedies: MethodRemedy[] = input.records
    .filter((r) => r.typeId === REMEDY_TYPE_ID && shown(r.instanceId))
    .map((r) => ({
      entity: "remedy" as const,
      id: r.instanceId,
      title: str(r.fieldValues.title) || r.displayLabel || r.instanceId,
      move: str(r.fieldValues.move),
      doesNotFix: str(r.fieldValues.does_not_fix),
      falsifier: str(r.fieldValues.falsifier),
      returnWhen: str(r.fieldValues.return_when),
      sources: list(r.fieldValues.source_ref),
      answers: uniq(
        answersOf.filter(([m]) => m === r.instanceId || m === originalOf.get(r.instanceId)).map(([, p]) => p)
      ).map((id) => ({ id, label: label(id) })),
      createdBy: r.createdBy,
      status: status(r.instanceId),
      commentCount: commentCount(r.instanceId),
    }))
    .sort(byTitle);

  const problems: MethodProblem[] = input.records
    .filter(
      (r) =>
        r.typeId === PROBLEM_TYPE_ID &&
        shown(r.instanceId)
    )
    .map((r) => {
      const f = r.fieldValues;
      const parent = parentOf.get(r.instanceId);
      const clusterId = parent && canon(parent);
      const poleId = side.get(r.instanceId);
      const tensionId = poleId ? parentOf.get(poleId) : undefined;
      return {
        id: r.instanceId,
        problemId: str(f.problem_id),
        title: str(f.title) || r.displayLabel || r.instanceId,
        statement: str(f.statement),
        kind: str(f.kind),
        imbalance: str(f.imbalance),
        side: poleId
          ? {
              id: poleId,
              label: label(poleId),
              tradeOff: tensionId ? { id: tensionId, label: label(tensionId) } : undefined,
            }
          : undefined,
        personas: uniq(personaIds.get(r.instanceId) ?? []).map((id) => link(id, "persona")),
        cluster: clusterId ? link(clusterId, "cluster") : undefined,
        remedies: remedies.filter((m) => m.answers.some((a) => a.id === r.instanceId)),
        sources: list(f.source_ref),
        createdBy: r.createdBy,
        status: status(r.instanceId),
        commentCount: commentCount(r.instanceId),
      };
    })
    .sort(
      (a, b) =>
        a.problemId.localeCompare(b.problemId, undefined, { numeric: true }) || byTitle(a, b)
    );

  const domains = new Map<string, MethodDomain>();
  const clusters = new Map<string, MethodCluster>();
  const domainFor = (id: string): MethodDomain => {
    const d = domains.get(id) ?? { id, title: id ? label(id) : NO_DOMAIN, clusters: [] };
    domains.set(id, d);
    return d;
  };
  const clusterFor = (id: string): MethodCluster => {
    const hit = clusters.get(id);
    if (hit) return hit;
    const c: MethodCluster = { id, title: id ? label(id) : NO_CLUSTER, problems: [], ...(id ? { status: status(id), createdBy: records.get(id)?.createdBy } : {}) };
    clusters.set(id, c);
    const up = id ? (parentOf.get(id) ?? parentOf.get(originalOf.get(id) ?? "")) : undefined;
    domainFor(up ?? "").clusters.push(c);
    return c;
  };
  for (const p of problems) clusterFor(p.cluster?.id ?? "").problems.push(p);
  const out = [...domains.values()].sort(groupOrder);
  for (const d of out) d.clusters.sort(groupOrder);
  const ofType = (typeId: string, entity: "cluster" | "persona") =>
    input.records
      .filter((r) => r.typeId === typeId && shown(r.instanceId))
      .map((r) => link(r.instanceId, entity))
      .sort((a, b) => a.label.localeCompare(b.label));
  return {
    domains: out,
    problems,
    remedies,
    personas: ofType(PERSONA_TYPE_ID, "persona"),
    clusters: ofType(CLUSTER_TYPE_ID, "cluster"),
    containers: input.containers,
  };
}

/** Last board per repository handle, keyed on the engine write epoch (as essay-document.ts). */
const boardCache = new WeakMap<object, { epoch: number; value: MethodModel }>();

/** The board for `repo`: one record read, four relation reads and the decision containers. */
export function loadMethod(repo: SrsRepository): MethodModel {
  const epoch = repo.write_epoch();
  const hit = boardCache.get(repo);
  if (hit?.epoch === epoch) return hit.value;
  const all = listContainers(repo);
  const containers: MethodContainers = {};
  const members: BoardInput["members"] = {};
  for (const key of Object.keys(CONTAINER_TITLES) as ContainerKey[]) {
    const id = all.find((c) => c.title === CONTAINER_TITLES[key])?.containerId;
    if (!id) continue;
    containers[key] = id;
    members[key] = (getContainer(repo, id).memberInstanceIds ?? []).map((e) => e.instanceId);
  }
  const value = buildBoard({
    records: listRecords(repo).filter((r) => r.typeNamespace === METHOD_NAMESPACE),
    relations: [
      ...listRelations(repo, { relationType: "contains" }),
      ...listRelations(repo, { relationType: HELD_BY }),
      ...listRelations(repo, { relationType: CONCERNS }),
      ...listRelations(repo, { relationType: ANSWERS }),
      ...listRelations(repo, { relationType: DERIVED_FROM }),
    ],
    containers,
    members,
    comments: loadComments(repo, listTypes(repo)),
  });
  boardCache.set(repo, { epoch, value });
  return value;
}

/**
 * Move a problem's membership between decision containers (the owner's reversible yes / no):
 * add to `to` first, then take it out of every other decision container. Creates nothing else.
 */
export function moveToContainer(
  repo: SrsRepository,
  m: MethodModel,
  id: string,
  to: ContainerKey
): void {
  const target = m.containers[to];
  if (!target) throw new Error(`This repository has no ${CONTAINER_TITLES[to]} container`);
  addContainerMember(repo, target, id);
  for (const [key, cid] of Object.entries(m.containers) as [ContainerKey, string][])
    if (key !== to && key !== "affirmed")
      try {
        removeContainerMember(repo, cid, id);
      } catch {
        /* not a member there */
      }
}

/** Agents comment and suggest; the owner's layers (Affirmed, Set aside) are guarded. */
export function methodWriteGuard(m: MethodModel): AgentWriteGuard | null {
  const containerIds = [m.containers.affirmed, m.containers.setAside].filter(
    (id): id is string => !!id
  );
  return containerIds.length ? { containerIds, instanceIds: [], fillOnlyFields: [] } : null;
}

// ponytail: the public repos are listed by hand; a private repo's ref stays plain text.
const PUBLIC_REPOS = new Set([
  "semanticops.com",
  "srs",
  "srs-rust",
  "srs-web",
  "srs-vscode",
  "srs-programme",
]);
const OWNER = "the-greenman";

/** A source ref as a link when it is a URL or a public `repo#n` / `owner/repo#n`; else null. */
export function sourceHref(ref: string): string | null {
  const s = ref.trim();
  if (/^https?:\/\/\S+$/.test(s)) return s;
  const m = /^(?:([\w.-]+)\/)?([\w.-]+)#(\d+)$/.exec(s);
  if (!m) return null;
  const [, owner = OWNER, name, n] = m;
  return owner === OWNER && PUBLIC_REPOS.has(name)
    ? `https://github.com/${owner}/${name}/issues/${n}`
    : null;
}

/**
 * Affirm (srs-rust#1354): fork a problem, remedy, cluster or persona into Affirmed, carrying its relations
 * (`CARRY`), as one engine call. The fork is stamped with the signed-in human; the suggestion stays in
 * Suggestions and the board hides it behind the fork (`derived-from`). Only that record is forked
 * (Affirmed is flat). Returns the fork's id.
 */
export function affirmRecord(repo: SrsRepository, m: MethodModel, id: string, entity: Entity): string {
  const affirmed = m.containers.affirmed;
  if (!affirmed) throw new Error(`This repository has no ${CONTAINER_TITLES.affirmed} container`);
  const result = forkRecord(repo, affirmed, id, {
    targetContainer: affirmed,
    carryRelations: CARRY[entity],
  });
  const fork = result.forks.find((f) => f.originalId === id);
  if (!fork) throw new Error(`The engine did not fork this ${entity}`);
  return fork.forkId;
}
