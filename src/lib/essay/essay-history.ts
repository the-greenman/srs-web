/**
 * The writer's undo history for one essay, for the browser session (srs-web#570): the document
 * history (`$lib/document`) over the essay's own state, the outlines of its essay, draft and Bin
 * containers with the records in them, plus the essay and document-state records. An agent's
 * comments, attachments and relations are not in the snapshot, so the writer's Ctrl-Z never undoes
 * them (agents never write the essay text).
 */
import { DocumentHistory, type DocumentSnapshot, snapshotDocument } from "$lib/document.js";
import { getRecord } from "$lib/srs-client.js";
import type { SrsRepository } from "$lib/srs-client.js";

export type EssaySnapshot = DocumentSnapshot;
export { DocumentHistory as EssayHistory };

/** Where an essay's state lives: enough to find its containers and records again after any edit. */
export interface EssayRefs {
  essayId: string;
  containerId: string;
  stateId: string | null;
}

export function snapshotEssay(repo: SrsRepository, refs: EssayRefs): EssaySnapshot {
  const state = refs.stateId ? getRecord(repo, refs.stateId) : null;
  const areas = [refs.containerId];
  for (const k of ["draft_container_id", "bin_container_id"]) {
    const id = state?.fieldValues?.[k];
    if (typeof id === "string" && id) areas.push(id);
  }
  return snapshotDocument(repo, areas, [refs.essayId, ...(refs.stateId ? [refs.stateId] : [])]);
}
