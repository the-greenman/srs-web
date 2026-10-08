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
export const POLE_TYPE_ID = "e3b62684-70d8-403d-ac8f-164fcb4b60a9";
export const TENSION_TYPE_ID = "91bd6f8a-417c-4728-87d2-26991e451221";
const METHOD_NAMESPACE = "com.semanticops.method";
export const HELD_BY = "com.semanticops.method/held-by";
export const CONCERNS = "com.semanticops.method/concerns";
const DERIVED_FROM = "derived-from";

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
export interface MethodProblem {
  id: string;
  problemId: string;
  title: string;
  statement: string;
  kind: string;
  /** The pole (public word: side) the problem concerns, with the tension (trade-off) holding it. */
  side?: Ref & { tradeOff?: Ref };
  imbalance: string;
  personas: Ref[];
  cluster?: Ref;
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
  const personas = new Map<string, Ref[]>();
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
      personas.set(s, [...(personas.get(s) ?? []), { id: t, label: label(t) }]);
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
  const affirmedOriginals = new Set(
    derivedFrom.filter(([fork]) => affirmed.has(fork)).map(([, original]) => original)
  );

  const problems: MethodProblem[] = input.records
    .filter(
      (r) =>
        r.typeId === PROBLEM_TYPE_ID &&
        !(status(r.instanceId) === "suggested" && affirmedOriginals.has(r.instanceId))
    )
    .map((r) => {
      const f = r.fieldValues;
      const clusterId = parentOf.get(r.instanceId);
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
        personas: personas.get(r.instanceId) ?? [],
        cluster: clusterId ? { id: clusterId, label: label(clusterId) } : undefined,
        sources: list(f.source_ref),
        createdBy: r.createdBy,
        status: status(r.instanceId),
        commentCount: new Set((input.comments?.[r.instanceId] ?? []).map((c) => c.id)).size,
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
    const c: MethodCluster = { id, title: id ? label(id) : NO_CLUSTER, problems: [] };
    clusters.set(id, c);
    domainFor(id ? (parentOf.get(id) ?? "") : "").clusters.push(c);
    return c;
  };
  for (const p of problems) clusterFor(p.cluster?.id ?? "").problems.push(p);
  const out = [...domains.values()].sort(groupOrder);
  for (const d of out) d.clusters.sort(groupOrder);
  return { domains: out, problems, containers: input.containers };
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
 * Affirm (srs-rust#1354): fork the problem into Affirmed, carrying all its relations (persona, side,
 * cluster), as one engine call. The fork is stamped with the signed-in human; the suggestion stays in
 * Suggestions and the board hides it behind the fork (`derived-from`). Returns the fork's id.
 */
export function affirmProblem(repo: SrsRepository, m: MethodModel, id: string): string {
  const affirmed = m.containers.affirmed;
  if (!affirmed) throw new Error(`This repository has no ${CONTAINER_TITLES.affirmed} container`);
  const result = forkRecord(repo, affirmed, id, {
    targetContainer: affirmed,
    carryRelations: "all",
  });
  const fork = result.forks.find((f) => f.originalId === id);
  if (!fork) throw new Error("The engine did not fork this problem");
  return fork.forkId;
}
