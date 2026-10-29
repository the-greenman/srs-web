/**
 * Narrative affirmation (srs-web#622, remedy 2910ac1e): a conversation's vignettes in order, each
 * with the owner's words verbatim and the records derived from it beside them, so the owner affirms
 * a derived record in the flow of the conversation that produced it, never on a separate screen
 * (clerk#197 R2: affirmation never happens in chat). Reads only; the acts are the Method editor's
 * own (`affirmRecord`, `moveToContainer`). Conversations follow the programme's standard: a container
 * whose identity record is a note tagged `conversation`, vignettes are notes tagged `vignette`, and a
 * derived record points at its vignette with `derived-from`.
 */
import { getContainer, getRecord, listContainers, listRelations } from "$lib/srs-client.js";
import type { SrsRepository } from "$lib/srs-client.js";
import type { Entity, MethodModel, ProblemStatus } from "./method-document.js";

/** A note as the engine returns it (the client's NoteRecord type predates title, tags and named sections). */
interface RawNote {
  instanceId: string;
  title?: string;
  tags?: string[];
  createdAt?: string;
  sections?: { name?: string; label?: string; content?: string }[];
}

export interface Conversation {
  containerId: string;
  title: string;
}

export interface DerivedView {
  id: string;
  title: string;
  /** The record's type name, e.g. "problem". */
  typeName: string;
  /** A method entity the owner can affirm or set aside here; absent = shown, not acted on. */
  entity?: Entity;
  /** Suggested / affirmed / set aside for method records; otherwise the record's lifecycle state. */
  layer: ProblemStatus | string;
}

export interface VignetteView {
  id: string;
  title: string;
  /** The owner's words, verbatim (the note's `narrative` section). */
  words: string;
  derived: DerivedView[];
}

/** A note, or null for a record or an unknown id. Read one by one: `list_notes` summaries carry no tags. */
const note = (repo: SrsRepository, id: string): RawNote | null => {
  try {
    const i = repo.get_instance(id) as { kind?: string; note?: RawNote } | null;
    return i?.kind === "note" && i.note ? i.note : null;
  } catch {
    return null;
  }
};

const section = (n: RawNote, name: string) =>
  n.sections?.find((s) => s.name === name)?.content ?? "";

/** Conversation containers (identity note tagged `conversation`), newest title first (titles start with the date). */
export function listConversations(repo: SrsRepository): Conversation[] {
  return listContainers(repo)
    .map((c) => ({ c, id: getContainer(repo, c.containerId).identityInstanceId }))
    .filter(({ id }) => !!id && !!note(repo, id)?.tags?.includes("conversation"))
    .map(({ c }) => ({ containerId: c.containerId, title: c.title }))
    .sort((a, b) => b.title.localeCompare(a.title));
}

/** One conversation's vignettes in outline order, each with the records derived from it. */
export function loadConversation(
  repo: SrsRepository,
  containerId: string,
  m: MethodModel
): VignetteView[] {
  const derivedFrom = new Map<string, string[]>();
  for (const r of listRelations(repo, { relationType: "derived-from" }))
    derivedFrom.set(r.targetInstanceId, [
      ...(derivedFrom.get(r.targetInstanceId) ?? []),
      r.sourceInstanceId,
    ]);
  const view = (id: string): DerivedView | null => {
    const r = getRecord(repo, id);
    if (!r) return null; // a note or a record outside this repository's view
    const item = m.byId.get(id);
    const title = r.fieldValues.title;
    // An affirmed suggestion is hidden on the board behind its fork in Affirmed (derived-from it).
    const forked = (derivedFrom.get(id) ?? []).some((f) => m.byId.get(f)?.status === "affirmed");
    return {
      id,
      title:
        typeof title === "string" && title ? title : (r.fieldValues.problem_id as string) || id,
      typeName: r.typeName ?? "record",
      entity: forked ? undefined : item?.entity,
      layer: forked ? "affirmed" : (item?.status ?? r.lifecycle ?? "suggested"),
    };
  };
  return (getContainer(repo, containerId).memberInstanceIds ?? [])
    .map((e) => note(repo, e.instanceId))
    .filter((n): n is RawNote => !!n?.tags?.includes("vignette"))
    .map((n) => ({
      id: n.instanceId,
      title: n.title ?? "",
      words: section(n, "narrative"),
      derived: (derivedFrom.get(n.instanceId) ?? []).map(view).filter((d): d is DerivedView => !!d),
    }));
}
