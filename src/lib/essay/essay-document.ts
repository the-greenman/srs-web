/**
 * Essay document operations: a thin composition of srs-client calls (no SRS semantics here —
 * validation, ordering and depth rules are the engine's). The shell calls these and reloads.
 *
 * Shape: essay record = anchor/identity of the essay container; paragraphs = members;
 * one document-state record holds `hidden_instance_ids` + `draft_container_id`; the draft
 * area is a second container.
 */
import {
  addContainerMember,
  addContainerMemberRelative,
  containersForInstance,
  contextRecord,
  copyContainer,
  createContainer,
  createRecord,
  createRelation,
  forkRecord,
  getContainerOutline,
  getRecord,
  listContainers,
  listRecords,
  listRelationTypes,
  listRelations,
  listTypes,
  moveContainerMemberRelative,
  removeContainerMember,
  updateRecord,
} from "$lib/srs-client.js";
import type {
  Actor,
  AgentWriteGuard,
  ContextRelation,
  OutlineEntry,
  OutlineShift,
  SrsRecord,
  SrsRepository,
  TypeSummary,
} from "$lib/srs-client.js";
import type { Zone } from "./essay-model.js";
import { toggled } from "./essay-model.js";
import {
  COMMENTS_ON,
  COMMENT_TYPE_ID,
  DOCUMENT_STATE_TYPE_ID,
  ESSAY_TYPE_ID,
  PARAGRAPH_TYPE_ID,
} from "./type-registry.js";

export interface Paragraph {
  id: string;
  title: string;
  body: string;
}
/** A comment on a paragraph; `author` is the engine-stamped `createdBy` (absent = unknown author). */
export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  author?: Actor;
}
/**
 * Something attached to a paragraph (an agent's problem, source, counter-claim, note...): any
 * relation to a resolving non-paragraph, non-comment neighbour. `kind` is data - the relation
 * type crossed with the neighbour's type - so new kinds need no code here.
 */
export interface Attachment {
  /** Stable key: the relation id. */
  id: string;
  relationType: string;
  direction: "out" | "in";
  /** Neighbour type name, or "note". */
  neighbourType: string;
  neighbourId: string;
  label: string;
  /** Readable text of the neighbour (note sections / string field values), blank-line joined. */
  text: string;
}
/**
 * A semantic relation between this paragraph and another paragraph (derived-from, supersedes,
 * refines, package-defined types...) in either direction. Structural edges (the core's
 * `composition` / `sequence` categories: contains, precedes) never appear.
 */
export interface Related {
  /** Stable key: the relation id. */
  id: string;
  relationType: string;
  direction: "out" | "in";
  /** The other end's instance id (a paragraph; it may live in another essay). */
  otherId: string;
  label: string;
}
export interface EssaySummary {
  id: string;
  title: string;
}
export interface EssayModel {
  essayId: string;
  title: string;
  containerId: string;
  /** Ordered outline of the essay container (`outline.body`: identity / anchor excluded). */
  entries: OutlineEntry[];
  paragraphs: Record<string, Paragraph>;
  stateId: string | null;
  hidden: string[];
  draftContainerId: string | null;
  draftEntries: OutlineEntry[];
  /** Comments by paragraph id, oldest first. */
  comments: Record<string, Comment[]>;
  /** Attachments by paragraph id (see Attachment). */
  attachments: Record<string, Attachment[]>;
  /** Semantic relations to other paragraphs by paragraph id (see Related). */
  related: Record<string, Related[]>;
  /** Other documents (essays) holding each shared paragraph, by paragraph id; absent = not shared. */
  sharedIn: Record<string, EssaySummary[]>;
}

/**
 * Owner ruling (muDemocracy.org#226): agents never write the essay text — they comment via
 * new records and relations. Labels are metadata: fillable only while empty.
 */
export function essayWriteGuard(m: EssayModel): AgentWriteGuard {
  return {
    containerIds: [m.containerId, ...(m.draftContainerId ? [m.draftContainerId] : [])],
    instanceIds: [m.essayId, ...(m.stateId ? [m.stateId] : [])],
    fillOnlyFields: ["paragraph_title"],
  };
}

/** A drop / insert position: before / after / into `id` (null = the end, depth 0). */
export interface Target {
  id: string | null;
  zone: Zone;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function recordsOfType(repo: SrsRepository, types: TypeSummary[], typeId: string): SrsRecord[] {
  const t = types.find((x) => x.id === typeId);
  if (!t) return [];
  return listRecords(repo, { typeNamespace: t.namespace, typeName: t.name }).filter(
    (r) => r.typeId === typeId
  );
}

function typeVersion(repo: SrsRepository, typeId: string): number {
  const t = listTypes(repo).find((x) => x.id === typeId);
  if (!t) throw new Error(`Type ${typeId} is not installed`);
  return t.version;
}

export function listEssays(repo: SrsRepository): EssaySummary[] {
  return recordsOfType(repo, listTypes(repo), ESSAY_TYPE_ID).map((r) => ({
    id: r.instanceId,
    title: str(r.fieldValues.title) || "Untitled essay",
  }));
}

const toParagraph = (r: SrsRecord): Paragraph => ({
  id: r.instanceId,
  title: str(r.fieldValues.paragraph_title),
  body: str(r.fieldValues.body),
});

/** Last comment read per repository handle, keyed on the comments-on relation ids (srs-web#359). */
const commentCache = new WeakMap<object, { key: string; comments: Record<string, Comment[]> }>();

/**
 * Comments by paragraph, oldest first by the engine's createdAt. One relation read per reload;
 * the comment records (immutable here) are re-read only when the set of comments-on relations
 * changed, which keeps a commit's reload cheap (~6 ms vs ~15 ms on a muSrs-sized repo, 50 comments).
 */
function loadComments(repo: SrsRepository, types: TypeSummary[]): Record<string, Comment[]> {
  const rels = listRelations(repo, { relationType: COMMENTS_ON });
  const key = rels.map((r) => r.relationId).join(",");
  const hit = commentCache.get(repo);
  if (hit?.key === key) return hit.comments;
  const byId = new Map(recordsOfType(repo, types, COMMENT_TYPE_ID).map((r) => [r.instanceId, r]));
  const out: Record<string, Comment[]> = {};
  for (const rel of rels) {
    const r = byId.get(rel.sourceInstanceId);
    if (!r) continue;
    out[rel.targetInstanceId] ??= [];
    out[rel.targetInstanceId].push({
      id: r.instanceId,
      text: str(r.fieldValues.comment_text),
      createdAt: r.createdAt ?? "",
      author: r.createdBy,
    });
  }
  for (const list of Object.values(out))
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  commentCache.set(repo, { key, comments: out });
  return out;
}

const toAttachment = (r: ContextRelation): Attachment | null => {
  const n = r.neighbour;
  if (!n || r.relationType === COMMENTS_ON) return null; // comments have their own thread
  if (n.kind === "record" && n.typeId === PARAGRAPH_TYPE_ID) return null; // structure, not an attachment
  const outgoing = r.direction === "out";
  const label = (outgoing ? r.targetLabel : r.sourceLabel) ?? "";
  const text =
    n.kind === "note"
      ? n.sections.map((x) => x.content).join("\n\n")
      : Object.values(n.fieldValues)
          .filter((v): v is string => typeof v === "string")
          .join("\n\n");
  return {
    id: r.relationId,
    relationType: r.relationType,
    direction: r.direction,
    neighbourType: n.kind === "note" ? "note" : n.typeName,
    neighbourId: n.instanceId,
    label: label || (n.kind === "note" ? n.title : "") || n.instanceId,
    text,
  };
};

/** Relation categories that are layout, not meaning (core RelationTypeDefinition.category). */
const STRUCTURAL = new Set(["composition", "sequence"]);

const toRelated = (r: ContextRelation, structural: Set<string>): Related | null => {
  const n = r.neighbour;
  if (n?.kind !== "record" || n.typeId !== PARAGRAPH_TYPE_ID || structural.has(r.relationType))
    return null;
  const outgoing = r.direction === "out";
  return {
    id: r.relationId,
    relationType: r.relationType,
    direction: r.direction,
    otherId: n.instanceId,
    label:
      (outgoing ? r.targetLabel : r.sourceLabel) ||
      str(n.fieldValues.paragraph_title) ||
      str(n.fieldValues.body).slice(0, 40) ||
      "untitled",
  };
};

interface ParagraphContext {
  attachments: Record<string, Attachment[]>;
  related: Record<string, Related[]>;
}
/** Last context read per repository handle, keyed on the engine write epoch. */
const attachmentCache = new WeakMap<object, { key: string; value: ParagraphContext }>();

/**
 * Attachments per paragraph from the engine's context read (both directions, neighbours inline).
 * Keyed on the engine `write_epoch()` (the one mutation signal), so an agent editing an attached
 * note in place refreshes too. Cost ~0.14 ms per paragraph per write (100 paragraphs ~14 ms) and
 * writes are commits, not keystrokes; add an engine bulk read if essays get much larger.
 */
function loadContext(repo: SrsRepository, ids: string[]): ParagraphContext {
  const key = `${ids.join(",")}|${repo.write_epoch()}`;
  const hit = attachmentCache.get(repo);
  if (hit?.key === key) return hit.value;
  const structural = new Set(
    listRelationTypes(repo)
      .filter((t) => STRUCTURAL.has(t.category ?? ""))
      .map((t) => t.key)
  );
  const out: ParagraphContext = { attachments: {}, related: {} };
  for (const id of ids) {
    const rels = contextRecord(repo, id).relations;
    const att = rels.map(toAttachment).filter((a): a is Attachment => a !== null);
    const rel = rels.map((r) => toRelated(r, structural)).filter((a): a is Related => a !== null);
    if (att.length) out.attachments[id] = att;
    if (rel.length) out.related[id] = rel;
  }
  attachmentCache.set(repo, { key, value: out });
  return out;
}

/** Last shared-in read per repository handle, keyed on the engine write epoch (as loadContext). */
const sharedCache = new WeakMap<object, { key: string; value: Record<string, EssaySummary[]> }>();

/**
 * Which other documents hold each paragraph: the engine's reverse membership lookup
 * (`containers_for_instance`), restricted to the essays' own containers and named by essay title.
 */
function loadSharedIn(
  repo: SrsRepository,
  types: TypeSummary[],
  ids: string[],
  own: (string | null)[]
): Record<string, EssaySummary[]> {
  const key = `${ids.join(",")}|${own.join(",")}|${repo.write_epoch()}`;
  const hit = sharedCache.get(repo);
  if (hit?.key === key) return hit.value;
  const byContainer = new Map<string, EssaySummary>();
  for (const r of recordsOfType(repo, types, ESSAY_TYPE_ID)) {
    const c = listContainers(repo, { anchorInstanceId: r.instanceId })[0];
    if (c)
      byContainer.set(c.containerId, {
        id: r.instanceId,
        title: str(r.fieldValues.title) || "Untitled essay",
      });
  }
  const out: Record<string, EssaySummary[]> = {};
  for (const id of ids) {
    const others = containersForInstance(repo, id)
      .filter((c) => !own.includes(c.containerId))
      .map((c) => byContainer.get(c.containerId))
      .filter((e): e is EssaySummary => !!e);
    if (others.length) out[id] = others;
  }
  sharedCache.set(repo, { key, value: out });
  return out;
}

export function loadEssay(repo: SrsRepository, essayId: string): EssayModel {
  const types = listTypes(repo); // resolved once per reload
  const essay = recordsOfType(repo, types, ESSAY_TYPE_ID).find((r) => r.instanceId === essayId);
  if (!essay) throw new Error("Essay not found");
  const summary = listContainers(repo, { anchorInstanceId: essayId })[0];
  if (!summary) throw new Error("This essay has no container");
  const containerId = summary.containerId;
  const state =
    recordsOfType(repo, types, DOCUMENT_STATE_TYPE_ID).find(
      (r) => r.fieldValues.essay === essayId
    ) ?? null;
  const draftContainerId = str(state?.fieldValues.draft_container_id) || null;
  const draftEntries = draftContainerId ? getContainerOutline(repo, draftContainerId).body : [];
  const entries = getContainerOutline(repo, containerId).body;
  const paragraphs: Record<string, Paragraph> = {};
  for (const r of listRecords(repo, { containerId })) {
    if (r.typeId === PARAGRAPH_TYPE_ID) paragraphs[r.instanceId] = toParagraph(r);
  }
  if (draftContainerId) {
    for (const r of listRecords(repo, { containerId: draftContainerId })) {
      if (r.typeId === PARAGRAPH_TYPE_ID) paragraphs[r.instanceId] = toParagraph(r);
    }
  }
  const context = loadContext(repo, Object.keys(paragraphs));
  const hiddenRaw = state?.fieldValues.hidden_instance_ids;
  return {
    essayId,
    title: str(essay.fieldValues.title) || "Untitled essay",
    containerId,
    entries,
    paragraphs,
    stateId: state?.instanceId ?? null,
    hidden: Array.isArray(hiddenRaw) ? hiddenRaw.map(String) : [],
    draftContainerId,
    draftEntries,
    comments: loadComments(repo, types),
    attachments: context.attachments,
    related: context.related,
    sharedIn: loadSharedIn(repo, types, Object.keys(paragraphs), [containerId, draftContainerId]),
  };
}

/** Add `id` to `container` at `t` (core resolves the position); no target = append. */
function place(repo: SrsRepository, container: string, id: string, t?: Target): void {
  if (t?.id) addContainerMemberRelative(repo, container, id, t.id, t.zone);
  else addContainerMember(repo, container, id);
}

/** Create a paragraph and add it at `t` (default: append). Returns its id. */
export function addParagraph(repo: SrsRepository, m: EssayModel, t?: Target): string {
  const rec = createRecord(repo, PARAGRAPH_TYPE_ID, typeVersion(repo, PARAGRAPH_TYPE_ID), {
    fieldValues: { body: "" },
  });
  place(repo, m.containerId, rec.instanceId, t);
  return rec.instanceId;
}

/** Reply on a paragraph: a comment record + `comments-on` (comment -> paragraph); never a container member. */
export function addComment(repo: SrsRepository, paragraphId: string, text: string): void {
  const rec = createRecord(repo, COMMENT_TYPE_ID, typeVersion(repo, COMMENT_TYPE_ID), {
    fieldValues: { comment_text: text },
  });
  createRelation(repo, {
    relationType: COMMENTS_ON,
    sourceInstanceId: rec.instanceId,
    targetInstanceId: paragraphId,
  });
}

function patchRecord(repo: SrsRepository, id: string, patch: Record<string, unknown>): void {
  const cur = getRecord(repo, id);
  if (!cur) throw new Error("Record not found");
  const fieldValues: Record<string, unknown> = { ...cur.fieldValues, ...patch };
  if (fieldValues.paragraph_title === "") fieldValues.paragraph_title = undefined; // optional: clear
  updateRecord(repo, id, { fieldValues: JSON.parse(JSON.stringify(fieldValues)) });
}

export const setBody = (repo: SrsRepository, id: string, body: string): void =>
  patchRecord(repo, id, { body });
export const setEssayTitle = (repo: SrsRepository, essayId: string, title: string): void =>
  patchRecord(repo, essayId, { title });
export const setTitle = (repo: SrsRepository, id: string, title: string): void =>
  patchRecord(repo, id, { paragraph_title: title });

/** Hide / show a paragraph in place: editor-only state held in the document-state record. */
export function setHidden(repo: SrsRepository, m: EssayModel, id: string, hidden: boolean): void {
  if (!m.stateId) throw new Error("This essay has no document-state record");
  patchRecord(repo, m.stateId, { hidden_instance_ids: toggled(m.hidden, id, hidden) });
}

/** Move a run within a container (`container` is the essay's or the draft's) to `t`. */
export function moveEntry(repo: SrsRepository, container: string, id: string, t: Target): void {
  // No target = the end: after the last top-level run (a no-op when that run is `id`'s own).
  const target =
    t.id ??
    getContainerOutline(repo, container)
      .entries.filter((e) => e.depth === 0)
      .pop()?.instanceId;
  if (!target || target === id) return;
  moveContainerMemberRelative(repo, container, id, {
    relativeTo: target,
    placement: t.id ? t.zone : "after",
  });
}
/** Alt+Arrow / Tab: indent, outdent or swap with the neighbouring sibling (clamped by the core). */
export const shiftEntry = (
  repo: SrsRepository,
  container: string,
  id: string,
  shift: OutlineShift
): void => {
  moveContainerMemberRelative(repo, container, id, { shift });
};

/** Move a paragraph between the essay and its draft container (remove + add). */
export function transfer(
  repo: SrsRepository,
  from: string,
  to: string,
  id: string,
  t?: Target
): void {
  removeContainerMember(repo, from, id);
  place(repo, to, id, t);
}

/** The editor's own state for an essay: a draft container + the document-state record. */
function addEditorState(repo: SrsRepository, essayId: string, title: string): void {
  const draft = createContainer(repo, { title: `${title} (draft)` });
  createRecord(repo, DOCUMENT_STATE_TYPE_ID, typeVersion(repo, DOCUMENT_STATE_TYPE_ID), {
    fieldValues: { essay: essayId, hidden_instance_ids: [], draft_container_id: draft.containerId },
  });
}

/** New essay: record + container (+ draft container + state).. */
export function newEssay(repo: SrsRepository, title: string): string {
  const essay = createRecord(repo, ESSAY_TYPE_ID, typeVersion(repo, ESSAY_TYPE_ID), {
    fieldValues: { title },
  });
  createContainer(repo, {
    title,
    anchorInstanceId: essay.instanceId,
    identityInstanceId: essay.instanceId,
    memberInstanceIds: [{ instanceId: essay.instanceId }],
  });
  addEditorState(repo, essay.instanceId, title);
  return essay.instanceId;
}

/**
 * Copy a document: the engine shares every paragraph and forks only the essay record (each
 * document keeps its own title). The copy gets a fresh, empty editor state like a new essay;
 * hidden paragraphs and the draft area are per-document and are not carried over.
 */
export function copyEssay(repo: SrsRepository, m: EssayModel): string {
  const title = `Copy of ${m.title}`;
  const copy = copyContainer(repo, m.containerId, { title });
  const essayId = copy.container.anchorInstanceId;
  if (!essayId) throw new Error("The copied document has no essay record");
  setEssayTitle(repo, essayId, title);
  addEditorState(repo, essayId, title);
  return essayId;
}

/** Make a shared paragraph (and its nested children) this document's own; the fork is `derived-from` the original. */
export function makeLocalCopy(repo: SrsRepository, m: EssayModel, paragraphId: string): void {
  const { forks } = forkRecord(repo, m.containerId, paragraphId);
  // A hidden original stays hidden as its fork: swap the ids in this document's state only.
  const swap = new Map(forks.map((f) => [f.originalId, f.forkId]));
  if (m.stateId && m.hidden.some((h) => swap.has(h)))
    patchRecord(repo, m.stateId, { hidden_instance_ids: m.hidden.map((h) => swap.get(h) ?? h) });
}
