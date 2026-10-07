import { STRUCTURAL_CATEGORIES } from "$lib/annotations.js";
import type { Attachment, Related } from "$lib/annotations.js";
import { COMMENTS_ON, loadComments } from "$lib/comments.js";
import type { Comment } from "$lib/comments.js";
/**
 * Essay document operations: a thin composition of srs-client calls (no SRS semantics here —
 * validation, ordering and depth rules are the engine's). The shell calls these and reloads.
 *
 * Shape: essay record = anchor/identity of the essay container; paragraphs = members;
 * one document-state record holds `hidden_instance_ids` + `draft_container_id` + `bin_container_id`;
 * the draft area and the Bin (deleted paragraphs) are further containers.
 */
import {
  addContainerMember,
  addContainerMemberRelative,
  containersForInstance,
  contextRecord,
  copyContainer,
  createContainer,
  createRecord,
  deleteRecord,
  deleteRelation,
  exportSlice,
  forkRecord,
  getContainer,
  getContainerOutline,
  getRecord,
  listContainers,
  listDocumentViews,
  listRecords,
  listRelationTypes,
  listRelations,
  listTypes,
  moveContainerMemberRelative,
  removeContainerMember,
  renderDocumentView,
  typeSchema,
  updateContainer,
  updateRecord,
} from "$lib/srs-client.js";
import type {
  AgentWriteGuard,
  ContextRelation,
  OutlineEntry,
  OutlineShift,
  SrsRecord,
  SrsRepository,
  TypeSummary,
} from "$lib/srs-client.js";
import { recordsOfType, typeVersion } from "$lib/type-version.js";
import { uuid5 } from "$lib/uuid5.js";
import type { Zone } from "./essay-model.js";
import { hiddenByAncestor, toggled } from "./essay-model.js";
import { DOCUMENT_STATE_TYPE_ID, ESSAY_TYPE_ID, PARAGRAPH_TYPE_ID } from "./type-registry.js";

export interface Paragraph {
  id: string;
  title: string;
  body: string;
}
export interface EssaySummary {
  id: string;
  title: string;
}
/** A collected source, claim or problem; `paragraphIds` come from inverting the paragraphs' context. */
export interface Reference {
  id: string;
  label: string;
  /** The record's type name (source, claim, problem...). */
  typeName: string;
  paragraphIds: string[];
}
export interface EssayModel {
  essayId: string;
  title: string;
  /** The essay's `purpose` field (markdown); null when the installed essay type has no such field (hide the UI). */
  purpose: string | null;
  containerId: string;
  /** Ordered outline of the essay container (`outline.body`: identity / anchor excluded). */
  entries: OutlineEntry[];
  paragraphs: Record<string, Paragraph>;
  stateId: string | null;
  hidden: string[];
  draftContainerId: string | null;
  draftEntries: OutlineEntry[];
  /** The Bin: created on the first delete (null until then). */
  binContainerId: string | null;
  binEntries: OutlineEntry[];
  /** The snapshot bundle (srs-web#417): created on the first Export snapshot (null until then). */
  bundleContainerId: string | null;
  /** Set when this load's repair failed (tried once per essay per repo handle; the shell shows it as a notice). */
  repairError?: string | null;
  /** The essay's comments container (essay package 1.7.0; null on older packages or before repair). */
  commentsContainerId: string | null;
  /** The essay's collected references container (essay package 1.7.0; null as above). */
  referencesContainerId: string | null;
  /** The references container's records, each with the paragraphs it is linked to (none = unlinked). */
  references: Reference[];
  /** Whether the installed document-state type can record a bundle (older packages cannot: no Export snapshot). */
  canSnapshot: boolean;
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
 * new records and relations. Labels are metadata: fillable only while empty. The comments and
 * references containers are deliberately NOT guarded (nor is the snapshot bundle: the engine guards a
 * container's whole closure, and the bundle's children include them; refreshBundle re-declares it): agents file into them (containerId on create,
 * or container_member_add); every other container stays protected.
 */
export function essayWriteGuard(m: EssayModel): AgentWriteGuard {
  return {
    containerIds: [
      m.containerId,
      ...(m.draftContainerId ? [m.draftContainerId] : []),
      ...(m.binContainerId ? [m.binContainerId] : []),
    ],
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

const toAttachment =
  (labels: Map<string, string>) =>
  (r: ContextRelation): Attachment | null => {
    const n = r.neighbour;
    if (!n || r.relationType === COMMENTS_ON) return null; // comments have their own thread
    if (n.kind === "record" && n.typeId === PARAGRAPH_TYPE_ID) return null; // shown as `related`, not an attachment
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
      relationLabel: labels.get(r.relationType) || r.relationType,
      direction: r.direction,
      neighbourType: n.kind === "note" ? "note" : n.typeName,
      neighbourId: n.instanceId,
      label: label || (n.kind === "note" ? n.title : "") || n.instanceId,
      text,
      actor: r.createdBy,
    };
  };

const toRelated = (r: ContextRelation): Related | null => {
  const n = r.neighbour;
  if (n?.kind !== "record" || n.typeId !== PARAGRAPH_TYPE_ID) return null;
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
    actor: r.createdBy,
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
  const out: ParagraphContext = { attachments: {}, related: {} };
  const toAtt = toAttachment(new Map(listRelationTypes(repo).map((t) => [t.key, t.label])));
  for (const id of ids) {
    const rels = contextRecord(repo, id, undefined, STRUCTURAL_CATEGORIES).relations;
    const att = rels.map(toAtt).filter((a): a is Attachment => a !== null);
    const rel = rels.map(toRelated).filter((a): a is Related => a !== null);
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

/** Whether the installed `typeId` declares `field` (older packages do not). Cached per type version. */
const fieldCache = new WeakMap<object, Map<string, { version: number; ok: boolean }>>();
function hasField(
  repo: SrsRepository,
  types: TypeSummary[],
  typeId: string,
  field: string
): boolean {
  const version = types.find((x) => x.id === typeId)?.version ?? 0;
  const cache = fieldCache.get(repo) ?? new Map();
  fieldCache.set(repo, cache);
  const key = `${typeId}.${field}`;
  const hit = cache.get(key);
  if (hit?.version === version) return hit.ok;
  let ok = false;
  try {
    ok = field in ((typeSchema(repo, typeId, version).schema.properties as object) ?? {});
  } catch {
    /* type not resolvable: no such field */
  }
  cache.set(key, { version, ok });
  return ok;
}

/**
 * `repair` (editable repositories only) writes what an older essay lacks: its document-state record,
 * and the comments / references containers; and files every linked comment not yet in the comments
 * container. All idempotent and add-only (srs-web#494, #495, #496).
 */
export function loadEssay(
  repo: SrsRepository,
  essayId: string,
  opts: { repair?: boolean } = {}
): EssayModel {
  const types = listTypes(repo); // resolved once per reload
  const essay = recordsOfType(repo, types, ESSAY_TYPE_ID).find((r) => r.instanceId === essayId);
  if (!essay) throw new Error("Essay not found");
  const summary = listContainers(repo, { anchorInstanceId: essayId })[0];
  if (!summary) throw new Error("This essay has no container");
  const containerId = summary.containerId;
  const title = str(essay.fieldValues.title) || "Untitled essay";
  let state =
    recordsOfType(repo, types, DOCUMENT_STATE_TYPE_ID).find(
      (r) => r.fieldValues.essay === essayId
    ) ?? null;
  let repairError: string | null = null;
  const tried = repairTried(repo);
  if (opts.repair && !tried.has(essayId)) {
    // Once per essay per repo handle: a failure part-way must not repeat on the reload it causes.
    tried.add(essayId);
    try {
      if (!state) state = addEditorState(repo, types, essayId, title);
      else state = repairAreas(repo, types, state, title, essayId);
    } catch (e) {
      repairError = e instanceof Error ? e.message : String(e);
    }
  }
  const draftContainerId = str(state?.fieldValues.draft_container_id) || null;
  const draftEntries = draftContainerId ? getContainerOutline(repo, draftContainerId).body : [];
  const binContainerId = str(state?.fieldValues.bin_container_id) || null;
  const binEntries = binContainerId ? getContainerOutline(repo, binContainerId).body : [];
  const commentsContainerId = str(state?.fieldValues.comments_container_id) || null;
  const referencesContainerId = str(state?.fieldValues.references_container_id) || null;
  const entries = getContainerOutline(repo, containerId).body;
  const paragraphs: Record<string, Paragraph> = {};
  for (const c of [containerId, draftContainerId, binContainerId]) {
    if (!c) continue;
    for (const r of listRecords(repo, { containerId: c })) {
      if (r.typeId === PARAGRAPH_TYPE_ID) paragraphs[r.instanceId] = toParagraph(r);
    }
  }
  const context = loadContext(repo, Object.keys(paragraphs));
  const comments = loadComments(repo, types);
  if (opts.repair && commentsContainerId && !tried.has(`sweep:${essayId}`)) {
    try {
      const filed = new Set(
        getContainerOutline(repo, commentsContainerId).entries.map((e) => e.instanceId)
      );
      for (const id of Object.keys(paragraphs))
        for (const c of comments[id] ?? [])
          if (!filed.has(c.id)) {
            addContainerMember(repo, commentsContainerId, c.id);
            filed.add(c.id);
          }
    } catch (e) {
      tried.add(`sweep:${essayId}`); // stop retrying on every reload
      repairError ??= e instanceof Error ? e.message : String(e);
    }
  }
  const references: Reference[] = referencesContainerId
    ? listRecords(repo, { containerId: referencesContainerId }).map((r) => ({
        id: r.instanceId,
        label: r.displayLabel || r.instanceId,
        typeName: r.typeName ?? "",
        paragraphIds: Object.keys(context.attachments).filter((pid) =>
          context.attachments[pid].some((a) => a.neighbourId === r.instanceId)
        ),
      }))
    : [];
  const hiddenRaw = state?.fieldValues.hidden_instance_ids;
  return {
    essayId,
    title,
    purpose: hasField(repo, types, ESSAY_TYPE_ID, "purpose")
      ? str(essay.fieldValues.purpose)
      : null,
    containerId,
    entries,
    paragraphs,
    stateId: state?.instanceId ?? null,
    hidden: Array.isArray(hiddenRaw) ? hiddenRaw.map(String) : [],
    draftContainerId,
    draftEntries,
    binContainerId,
    binEntries,
    repairError,
    commentsContainerId,
    referencesContainerId,
    references,
    bundleContainerId: str(state?.fieldValues.bundle_container_id) || null,
    canSnapshot: !!state && hasField(repo, types, DOCUMENT_STATE_TYPE_ID, "bundle_container_id"),
    comments,
    attachments: context.attachments,
    related: context.related,
    sharedIn: loadSharedIn(repo, types, Object.keys(paragraphs), [
      containerId,
      draftContainerId,
      binContainerId,
    ]),
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

function patchRecord(
  repo: SrsRepository,
  id: string,
  patch: Record<string, unknown>,
  typeVersion?: number
): void {
  const cur = getRecord(repo, id);
  if (!cur) throw new Error("Record not found");
  const fieldValues: Record<string, unknown> = { ...cur.fieldValues, ...patch };
  for (const k of ["paragraph_title", "purpose"])
    if (fieldValues[k] === "") fieldValues[k] = undefined; // optional: clear
  updateRecord(repo, id, {
    fieldValues: JSON.parse(JSON.stringify(fieldValues)),
    ...(typeVersion && { typeVersion }),
  });
}

export const setBody = (repo: SrsRepository, id: string, body: string): void =>
  patchRecord(repo, id, { body });
/** Write the essay's purpose (markdown) through the same record patch as the title. */
export const setEssayPurpose = (repo: SrsRepository, essayId: string, purpose: string): void =>
  patchRecord(repo, essayId, { purpose });

/**
 * The markdown the writer pastes into an agent (srs-web#411, #498): what the essay is for, the
 * ids of everything it consists of, where to read it (MCP resources) and the rules for working on
 * it. `focus` = the paragraph (or zoom target) to look at. Lines for absent ids are omitted.
 */
export function agentHandoff(a: {
  repositoryId: string;
  essay: { id: string; title: string };
  containerId: string;
  purpose?: string | null;
  stateId?: string | null;
  draftContainerId?: string | null;
  binContainerId?: string | null;
  commentsContainerId?: string | null;
  referencesContainerId?: string | null;
  /** The snapshot bundle, once an Export snapshot has made one. */
  bundleContainerId?: string | null;
  focus?: { id: string; title: string };
}): string {
  const uri = `srs://${a.repositoryId}`;
  const containers = [
    `essay ${a.containerId} (the text, in order)`,
    a.draftContainerId && `draft ${a.draftContainerId}`,
    a.binContainerId && `bin ${a.binContainerId}`,
    a.commentsContainerId && `comments ${a.commentsContainerId}`,
    a.referencesContainerId && `references ${a.referencesContainerId}`,
  ].filter(Boolean);
  const c = a.commentsContainerId;
  const r = a.referencesContainerId;
  return [
    `# Essay: ${a.essay.title}`,
    ...(a.purpose?.trim() ? [`Purpose: ${a.purpose.trim()}`] : []),
    `Repository ${a.repositoryId}. Essay record ${a.essay.id}${a.stateId ? `, document-state ${a.stateId}` : ""}.`,
    `Containers: ${containers.join(" · ")}`,
    `Read the essay: ${uri}/container/${a.containerId} · one paragraph: ${uri}/context/${a.containerId}/<paragraphId>`,
    ...(a.bundleContainerId ? [`Snapshot bundle: ${uri}/container/${a.bundleContainerId}`] : []),
    ...(a.focus
      ? [
          `Focus: "${a.focus.title}" (paragraph ${a.focus.id}) · ${uri}/context/${a.containerId}/${a.focus.id}`,
        ]
      : []),
    "",
    "How to work on this essay",
    `- The text is the writer's. Never edit a paragraph body, the essay title or purpose, or any container except comments and references: the engine refuses these writes.`,
    `- Comment: record_create com.mudemocracy.essay/comment {comment_text}${c ? ` with containerId ${c}` : ""}, then relation_create com.mudemocracy.essay/comments-on from the comment to the paragraph. One comment per paragraph per point. Don't write an author: your session's identity is stamped.`,
    `- Gather: a source, claim or problem worth having for this essay goes in references: create it${r ? ` with containerId ${r}` : ""}, or container_member_add an existing one. Read references first so you don't duplicate.`,
    "- Attach: link a reference to a paragraph with com.mudemocracy.essay/bears-on (paragraph → problem), evidences (source or claim → paragraph, supports) or com.mudemocracy.essay/counters (source or claim → paragraph, opposes).",
    "- Titles: you may set paragraph_title only where it is empty.",
    "- Before creating a record of any type, read its type_schema; the aiGuidance there is authoritative.",
  ].join("\n");
}

/** A side area's container title (draft / bin), from its essay's (one convention for new, copy and rename). */
const areaTitle = (
  title: string,
  area: "draft" | "bin" | "snapshot" | "comments" | "references"
): string => `${title} (${area})`;

/** Rename the essay record and its containers (the document's, its draft's and its bin's). */
export function setEssayTitle(
  repo: SrsRepository,
  m: Pick<
    EssayModel,
    | "essayId"
    | "containerId"
    | "draftContainerId"
    | "binContainerId"
    | "bundleContainerId"
    | "commentsContainerId"
    | "referencesContainerId"
  >,
  title: string
): void {
  patchRecord(repo, m.essayId, { title });
  updateContainer(repo, m.containerId, { title });
  if (m.draftContainerId)
    updateContainer(repo, m.draftContainerId, { title: areaTitle(title, "draft") });
  if (m.binContainerId) updateContainer(repo, m.binContainerId, { title: areaTitle(title, "bin") });
  if (m.bundleContainerId)
    updateContainer(repo, m.bundleContainerId, { title: areaTitle(title, "snapshot") });
  if (m.commentsContainerId)
    updateContainer(repo, m.commentsContainerId, { title: areaTitle(title, "comments") });
  if (m.referencesContainerId)
    updateContainer(repo, m.referencesContainerId, { title: areaTitle(title, "references") });
}
export const setTitle = (repo: SrsRepository, id: string, title: string): void =>
  patchRecord(repo, id, { paragraph_title: title });

/** Remove an attached record's link to a paragraph (the relation only; the neighbour stays). */
export const removeAttachment = (repo: SrsRepository, relationId: string): void =>
  deleteRelation(repo, relationId);

/** Take a reference out of the essay's references container: the membership only, never the record. */
export function removeReference(repo: SrsRepository, m: EssayModel, id: string): void {
  if (!m.referencesContainerId) throw new Error("This essay has no references container");
  removeContainerMember(repo, m.referencesContainerId, id);
}

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

/** `id` and its descendants in `container`, in outline order with depth relative to `id`. */
function runOf(repo: SrsRepository, container: string, id: string): OutlineEntry[] {
  const body = getContainerOutline(repo, container).body;
  const at = body.findIndex((e) => e.instanceId === id);
  if (at < 0) return [];
  const rest = body.slice(at + 1);
  const end = rest.findIndex((e) => e.depth <= body[at].depth);
  return [body[at], ...(end < 0 ? rest : rest.slice(0, end))].map((e) => ({
    ...e,
    depth: e.depth - body[at].depth,
  }));
}

/** Move a paragraph and its subtree between the essay, its draft and its bin (remove + add). */
export function transfer(
  repo: SrsRepository,
  from: string,
  to: string,
  id: string,
  t?: Target
): void {
  const run = runOf(repo, from, id);
  for (const e of [...run].reverse()) removeContainerMember(repo, from, e.instanceId);
  place(repo, to, id, t);
  const last: string[] = [id]; // last added entry per relative depth
  for (const e of run.slice(1)) {
    const sib = last[e.depth];
    addContainerMemberRelative(
      repo,
      to,
      e.instanceId,
      sib ?? last[e.depth - 1],
      sib ? "after" : "into"
    );
    last.length = e.depth;
    last[e.depth] = e.instanceId;
  }
}

/** Delete = move into the Bin, creating it (and upgrading a v1 state record) on first use. */
export function binParagraph(repo: SrsRepository, m: EssayModel, id: string): void {
  if (!m.stateId) throw new Error("This essay has no document-state record");
  let bin = m.binContainerId;
  if (!bin) {
    bin = createContainer(repo, { title: areaTitle(m.title, "bin") }).containerId;
    // v1 state records upgrade to the installed (v2) type in the same write that records the Bin.
    patchRecord(
      repo,
      m.stateId,
      { bin_container_id: bin },
      typeVersion(repo, DOCUMENT_STATE_TYPE_ID)
    );
  }
  transfer(repo, m.containerId, bin, id);
}

/**
 * Permanent delete, only from the Bin: the paragraph's run, with each paragraph's comment
 * records. A paragraph another document holds is only taken out of the Bin, never deleted.
 */
export function deleteForever(repo: SrsRepository, m: EssayModel, id: string): void {
  const bin = m.binContainerId;
  if (!bin) throw new Error("This essay has no Bin");
  for (const e of [...runOf(repo, bin, id)].reverse()) {
    removeContainerMember(repo, bin, e.instanceId);
    if (m.sharedIn[e.instanceId]) continue;
    for (const r of listRelations(repo, { relationType: COMMENTS_ON, target: e.instanceId }))
      deleteRecord(repo, r.sourceInstanceId, true);
    deleteRecord(repo, e.instanceId, true);
  }
}

/** Essays already repaired (or attempted) per repository handle, so a failing repair is not retried by the reload it causes. */
const repairedCache = new WeakMap<object, Set<string>>();
const repairTried = (repo: SrsRepository): Set<string> => {
  const hit = repairedCache.get(repo) ?? new Set<string>();
  repairedCache.set(repo, hit);
  return hit;
};

/** Namespace of the deterministic area-container ids (UUIDv5 of `<essayId>:<area>`). */
const AREA_NS = "5d1f3c0e-8f0a-4b8e-9a53-2d6c1e7b4a90";

/**
 * The container with this deterministic id: created if absent, re-read if a second tab (or an
 * earlier partial repair) already made it. Same id on every client = no duplicate containers.
 */
function ensureContainer(repo: SrsRepository, containerId: string, title: string): string {
  try {
    getContainer(repo, containerId);
    return containerId;
  } catch {
    /* absent: create it */
  }
  try {
    return createContainer(repo, { containerId, title }).containerId;
  } catch (e) {
    try {
      getContainer(repo, containerId); // lost a race: it exists now
      return containerId;
    } catch {
      throw e;
    }
  }
}

/**
 * Create the comments / references containers the installed document-state type can record
 * (essay package 1.7.0; feature-detected, so an older package gets none) and return their ids
 * keyed by state field. `have` = the state's existing values: those areas are left alone.
 */
function newAreas(
  repo: SrsRepository,
  types: TypeSummary[],
  essayId: string,
  title: string,
  have: Record<string, unknown> = {}
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, area] of [
    ["comments_container_id", "comments"],
    ["references_container_id", "references"],
  ] as const)
    if (!str(have[field]) && hasField(repo, types, DOCUMENT_STATE_TYPE_ID, field))
      out[field] = ensureContainer(
        repo,
        uuid5(AREA_NS, `${essayId}:${area}`),
        areaTitle(title, area)
      );
  return out;
}

/**
 * The editor's own state for an essay: a draft container, the comments and references containers
 * + the document-state record. The record's own id is random (record create takes no id), so two
 * tabs repairing at once could still make two states; the containers are deterministic.
 */
function addEditorState(
  repo: SrsRepository,
  types: TypeSummary[],
  essayId: string,
  title: string
): SrsRecord {
  const draft = createContainer(repo, { title: areaTitle(title, "draft") });
  return createRecord(repo, DOCUMENT_STATE_TYPE_ID, typeVersion(repo, DOCUMENT_STATE_TYPE_ID), {
    fieldValues: {
      essay: essayId,
      hidden_instance_ids: [],
      draft_container_id: draft.containerId,
      ...newAreas(repo, types, essayId, title),
    },
  });
}

/** An older essay's state record lacking either new container: create it lazily (as the Bin is) and record it. */
function repairAreas(
  repo: SrsRepository,
  types: TypeSummary[],
  state: SrsRecord,
  title: string,
  essayId: string
): SrsRecord {
  const missing = newAreas(repo, types, essayId, title, state.fieldValues);
  if (!Object.keys(missing).length) return state;
  patchRecord(repo, state.instanceId, missing, typeVersion(repo, DOCUMENT_STATE_TYPE_ID));
  return { ...state, fieldValues: { ...state.fieldValues, ...missing } };
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
  addEditorState(repo, listTypes(repo), essay.instanceId, title);
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
  patchRecord(repo, essayId, { title }); // copyContainer already titled the container
  addEditorState(repo, listTypes(repo), essayId, title);
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

/**
 * The essay as static markdown (srs-web#416): the core composition render of the essay
 * container, minus the document-state hidden ids and the anchor record (the core already emits
 * the container title as H1). Children of a hidden paragraph are promoted by the core, not lost.
 * Drafts and the bin are other containers, so never appear.
 */
export function essayMarkdown(repo: SrsRepository, m: EssayModel): string {
  const view = listDocumentViews(repo, { namespace: "com.mudemocracy.essay", name: "essay" })[0];
  if (!view) throw new Error("This repository has no essay composition to export with.");
  // What the writer sees: hidden paragraphs and everything nested under them (the editor's
  // layers model), plus the anchor record so the container title is the only H1.
  const hidden = new Set(m.hidden);
  const exclude = [...hidden, ...hiddenByAncestor(m.entries, hidden), m.essayId];
  return renderDocumentView(repo, view.id, "markdown", m.containerId, null, exclude).rendered;
}

/**
 * (Re)declare the snapshot bundle (srs-web#417): its `childContainerIds` are the essay, draft and
 * bin, comments and references containers (RFC-034 I-151: their paragraphs, comments and gathered
 * references come with them) and its own members the essay record, document-state, (on a package
 * without a comments container) this essay's comments, and the one-hop non-structural
 * neighbours of its paragraphs (problems, sources, claims). Created on first use and linked from
 * document-state; later refreshes apply only the difference. Membership is declared here, never
 * derived. Returns the bundle's container id.
 */
export function refreshBundle(repo: SrsRepository, m: EssayModel): string {
  if (!m.stateId || !m.canSnapshot)
    throw new Error("This essay's package cannot record a snapshot bundle.");
  // The comments and references containers are children: they carry every comment and the gathered
  // references (linked to a paragraph or not); the attachments loop below stays for older essays.
  const children = [
    m.containerId,
    m.draftContainerId,
    m.binContainerId,
    m.commentsContainerId,
    m.referencesContainerId,
  ].filter((c): c is string => !!c);
  const own = new Set<string>([m.essayId, m.stateId]);
  for (const id of Object.keys(m.paragraphs)) {
    for (const a of m.attachments[id] ?? []) own.add(a.neighbourId);
  }
  // Comments not yet filed in the comments container (a read-only document never sweeps) are members.
  const filed = new Set(
    m.commentsContainerId
      ? getContainerOutline(repo, m.commentsContainerId).entries.map((e) => e.instanceId)
      : []
  );
  for (const id of Object.keys(m.paragraphs))
    for (const c of m.comments[id] ?? []) if (!filed.has(c.id)) own.add(c.id);
  let bundle = m.bundleContainerId;
  if (!bundle) {
    bundle = createContainer(repo, {
      title: areaTitle(m.title, "snapshot"),
      childContainerIds: children,
      memberInstanceIds: [...own].map((instanceId) => ({ instanceId })),
    }).containerId;
    // v1 state records upgrade to the installed type in the same write that records the bundle.
    patchRecord(
      repo,
      m.stateId,
      { bundle_container_id: bundle },
      typeVersion(repo, DOCUMENT_STATE_TYPE_ID)
    );
    return bundle;
  }
  const cur = getContainer(repo, bundle);
  if (children.join() !== (cur.childContainerIds ?? []).join())
    updateContainer(repo, bundle, { childContainerIds: children });
  const have = new Set((cur.memberInstanceIds ?? []).map((e) => e.instanceId));
  for (const id of have) if (!own.has(id)) removeContainerMember(repo, bundle, id);
  for (const id of own) if (!have.has(id)) addContainerMember(repo, bundle, id);
  return bundle;
}

/** Export snapshot: refresh the bundle, then the core slice of it (`.srs` bytes). Refusals come from the core. */
export function essaySnapshot(
  repo: SrsRepository,
  m: EssayModel
): { bundleId: string; bytes: Uint8Array<ArrayBuffer> } {
  const bundleId = refreshBundle(repo, m);
  return { bundleId, bytes: exportSlice(repo, bundleId) };
}

/**
 * Export references (srs-web#278): refresh the bundle, then the core render of the package's
 * `essay-references` composition for the bundle container (its sections filter the bundle's members
 * by type). The markdown export stays content only; this is the separate referenced-material export.
 */
export function essayReferences(repo: SrsRepository, m: EssayModel): string {
  const view = listDocumentViews(repo, {
    namespace: "com.mudemocracy.essay",
    name: "essay-references",
  })[0];
  if (!view)
    throw new Error(
      "This repository's essay package has no references composition (needs essay 1.6.0)."
    );
  return renderDocumentView(repo, view.id, "markdown", refreshBundle(repo, m)).rendered;
}
