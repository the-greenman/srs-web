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
  createContainer,
  createRecord,
  getContainerOutline,
  getRecord,
  listContainers,
  listRecords,
  listTypes,
  moveContainerMemberRelative,
  removeContainerMember,
  updateRecord,
} from "$lib/srs-client.js";
import type { OutlineEntry, OutlineShift, SrsRecord, SrsRepository } from "$lib/srs-client.js";
import type { Zone } from "./essay-model.js";
import { toggled } from "./essay-model.js";
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
}

/** A drop / insert position: before / after / into `id` (null = the end, depth 0). */
export interface Target {
  id: string | null;
  zone: Zone;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function recordsOfType(repo: SrsRepository, typeId: string): SrsRecord[] {
  const t = listTypes(repo).find((x) => x.id === typeId);
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
  return recordsOfType(repo, ESSAY_TYPE_ID).map((r) => ({
    id: r.instanceId,
    title: str(r.fieldValues.title) || "Untitled essay",
  }));
}

const toParagraph = (r: SrsRecord): Paragraph => ({
  id: r.instanceId,
  title: str(r.fieldValues.paragraph_title),
  body: str(r.fieldValues.body),
});

export function loadEssay(repo: SrsRepository, essayId: string): EssayModel {
  const essay = recordsOfType(repo, ESSAY_TYPE_ID).find((r) => r.instanceId === essayId);
  if (!essay) throw new Error("Essay not found");
  const summary = listContainers(repo, { rootInstanceId: essayId })[0];
  if (!summary) throw new Error("This essay has no container");
  const containerId = summary.containerId;
  const state =
    recordsOfType(repo, DOCUMENT_STATE_TYPE_ID).find((r) => r.fieldValues.essay === essayId) ??
    null;
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

function patchRecord(repo: SrsRepository, id: string, patch: Record<string, unknown>): void {
  const cur = getRecord(repo, id);
  if (!cur) throw new Error("Record not found");
  const fieldValues: Record<string, unknown> = { ...cur.fieldValues, ...patch };
  if (fieldValues.paragraph_title === "") fieldValues.paragraph_title = undefined; // optional: clear
  updateRecord(repo, id, { fieldValues: JSON.parse(JSON.stringify(fieldValues)) });
}

export const setBody = (repo: SrsRepository, id: string, body: string): void =>
  patchRecord(repo, id, { body });
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
  const draft = createContainer(repo, { title: `${title} (draft)` });
  createRecord(repo, DOCUMENT_STATE_TYPE_ID, typeVersion(repo, DOCUMENT_STATE_TYPE_ID), {
    fieldValues: {
      essay: essay.instanceId,
      hidden_instance_ids: [],
      draft_container_id: draft.containerId,
    },
  });
  return essay.instanceId;
}
