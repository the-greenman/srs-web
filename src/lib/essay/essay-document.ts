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
  createContainer,
  createRecord,
  getContainerArrangement,
  getRecord,
  listContainers,
  listRecords,
  listTypes,
  moveContainerMember,
  removeContainerMember,
  updateRecord,
} from "$lib/srs-client.js";
import type { SrsRecord, SrsRepository } from "$lib/srs-client.js";
import type { Entry, Plan } from "./essay-model.js";
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
  /** Ordered outline of the essay container, identity entry excluded (see `fullPlan`). */
  entries: Entry[];
  /** Index of the identity (essay) entry in the container's own outline, or -1. */
  identityIndex: number;
  paragraphs: Record<string, Paragraph>;
  stateId: string | null;
  hidden: string[];
  draftContainerId: string | null;
  draftEntries: Entry[];
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
  const draftEntries = draftContainerId ? getContainerArrangement(repo, draftContainerId) : [];
  const full = getContainerArrangement(repo, containerId);
  const entries = full.filter((e) => e.instanceId !== essayId);
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
    identityIndex: full.findIndex((e) => e.instanceId === essayId),
    paragraphs,
    stateId: state?.instanceId ?? null,
    hidden: Array.isArray(hiddenRaw) ? hiddenRaw.map(String) : [],
    draftContainerId,
    draftEntries,
  };
}

/** `plan.position` is against `entries` (no identity); the engine wants the container's full outline. */
const fullPlan = (m: EssayModel, p: Plan): Plan => ({
  ...p,
  position: p.position + (m.identityIndex >= 0 && m.identityIndex <= p.position ? 1 : 0),
});

/** Create a paragraph and add it at `plan` (default: append). Returns its id. */
export function addParagraph(repo: SrsRepository, m: EssayModel, plan?: Plan): string {
  const rec = createRecord(repo, PARAGRAPH_TYPE_ID, typeVersion(repo, PARAGRAPH_TYPE_ID), {
    fieldValues: { body: "" },
  });
  const p = plan && fullPlan(m, plan);
  addContainerMember(repo, m.containerId, rec.instanceId, p?.position, p?.depth);
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

/** Move within a container (`container` is the essay's or the draft's). */
export function moveEntry(
  repo: SrsRepository,
  m: EssayModel,
  container: string,
  id: string,
  p: Plan
): void {
  const q = container === m.containerId ? fullPlan(m, p) : p;
  moveContainerMember(repo, container, id, q.position, q.depth);
}
export const setDepth = (repo: SrsRepository, container: string, id: string, d: number): void => {
  moveContainerMember(repo, container, id, undefined, d);
};

/** Move a paragraph between the essay and its draft container (remove + add). */
export function transfer(
  repo: SrsRepository,
  m: EssayModel,
  from: string,
  to: string,
  id: string,
  plan: Plan
): void {
  const q = to === m.containerId ? fullPlan(m, plan) : plan;
  removeContainerMember(repo, from, id);
  addContainerMember(repo, to, id, q.position, q.depth);
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
