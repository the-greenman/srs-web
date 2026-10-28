import { SO_COMMENTS_ON, SO_COMMENT_TYPE_ID } from "$lib/comments.js";
/**
 * Affirm in context (srs-web#617, remedy 2910ac1e): an agent proposes a link as one comment on the
 * record it starts from, and the owner answers on that comment with a tick or a deny. Headless: no
 * markup, no styling; the Method editor and the essay editor render it their own way.
 *
 * Shape (comments 1.1.0, srs-programme#189): a proposal is a `suggestion` comment carrying
 * `proposed_relation` (the relation-type key) and a `proposes-link-to` relation to the target; it
 * `comments-on` the record the link starts from. The link itself is never written here: a relation
 * is a claim and has no suggested state. An answer is the writer's own comment with a response kind
 * that `comments-on` the proposal (ruling ff946eb1); the current answer is the latest one by that
 * author, and changing one's mind is a new response.
 */
import { createRecord, createRelation, deleteRecord, listRelations } from "$lib/srs-client.js";
import type { Actor, SrsRecord, SrsRepository, TypeSummary } from "$lib/srs-client.js";
import { recordsOfType, typeVersion } from "$lib/type-version.js";

export const PROPOSES_LINK_TO = "com.semanticops.comments/proposes-link-to";

/** Response kinds a writer may give a proposal: the tick, the deny, and clearing either. */
export type Answer = "agree" | "disagree" | "withdrawn";
const ANSWERS: readonly string[] = ["agree", "disagree", "withdrawn"];

export interface Proposal {
  /** The proposal comment. */
  id: string;
  /** The record the link starts from (the comment's `comments-on` target). */
  sourceId: string;
  /** The record the link would point to. */
  targetId: string;
  /** Relation-type key of the proposed link. */
  relationType: string;
  /** Why the agent proposes it (the comment text). */
  why: string;
  author?: Actor;
  createdAt: string;
  /** Current answer per author id; an author whose latest answer is `withdrawn` is absent. */
  answers: Record<string, Exclude<Answer, "withdrawn">>;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The latest answer per author, oldest first in, latest wins; `withdrawn` clears. Pure. */
export function currentAnswers(
  responses: { author?: Actor; kind: string; createdAt: string }[]
): Record<string, Exclude<Answer, "withdrawn">> {
  const latest = new Map<string, { kind: string; createdAt: string }>();
  for (const r of responses) {
    if (!ANSWERS.includes(r.kind)) continue;
    const who = r.author?.id ?? "";
    const prev = latest.get(who);
    if (!prev || prev.createdAt <= r.createdAt) latest.set(who, r);
  }
  const out: Record<string, Exclude<Answer, "withdrawn">> = {};
  for (const [who, r] of latest)
    if (r.kind !== "withdrawn") out[who] = r.kind as "agree" | "disagree";
  return out;
}

/** Proposals whose link starts at `sourceId`, oldest first, each with its current answers. */
export function loadProposals(
  repo: SrsRepository,
  types: TypeSummary[],
  sourceId: string
): Proposal[] {
  const comments = new Map(
    recordsOfType(repo, types, SO_COMMENT_TYPE_ID).map(
      (r) => [r.instanceId, r] as [string, SrsRecord]
    )
  );
  const on = listRelations(repo, { relationType: SO_COMMENTS_ON });
  const to = new Map(
    listRelations(repo, { relationType: PROPOSES_LINK_TO }).map((r) => [
      r.sourceInstanceId,
      r.targetInstanceId,
    ])
  );
  const out: Proposal[] = [];
  for (const rel of on) {
    if (rel.targetInstanceId !== sourceId) continue;
    const c = comments.get(rel.sourceInstanceId);
    const targetId = to.get(rel.sourceInstanceId);
    const relationType = str(c?.fieldValues.proposed_relation);
    if (!c || !targetId || !relationType) continue;
    const responses = on
      .filter((r) => r.targetInstanceId === c.instanceId)
      .map((r) => comments.get(r.sourceInstanceId))
      .filter((r): r is SrsRecord => !!r)
      .map((r) => ({
        author: r.createdBy,
        kind: str(r.fieldValues.kind),
        createdAt: r.createdAt ?? "",
      }));
    out.push({
      id: c.instanceId,
      sourceId,
      targetId,
      relationType,
      why: str(c.fieldValues.comment_text),
      author: c.createdBy,
      createdAt: c.createdAt ?? "",
      answers: currentAnswers(responses),
    });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Create a comment and its relations; on a failed relation, remove what was written and rethrow. */
function commentWith(
  repo: SrsRepository,
  fieldValues: Record<string, string>,
  relations: { relationType: string; targetInstanceId: string }[]
): string {
  const rec = createRecord(repo, SO_COMMENT_TYPE_ID, typeVersion(repo, SO_COMMENT_TYPE_ID), {
    fieldValues,
  });
  try {
    for (const r of relations) createRelation(repo, { ...r, sourceInstanceId: rec.instanceId });
  } catch (e) {
    // Not atomic in the engine: a new comment has no inbound relations, so a cascading delete
    // removes it with the relations already made from it.
    try {
      deleteRecord(repo, rec.instanceId, true);
    } catch {}
    throw e;
  }
  return rec.instanceId;
}

/** Propose a `relationType` link from `sourceId` to `targetId`, saying why. Returns the proposal id. */
export function proposeLink(
  repo: SrsRepository,
  sourceId: string,
  targetId: string,
  relationType: string,
  why: string
): string {
  return commentWith(
    repo,
    { comment_text: why, kind: "suggestion", proposed_relation: relationType },
    [
      { relationType: SO_COMMENTS_ON, targetInstanceId: sourceId },
      { relationType: PROPOSES_LINK_TO, targetInstanceId: targetId },
    ]
  );
}

/**
 * Answer a proposal (tick, deny, or clear) as the session's actor. `text` is an optional reason;
 * without one the answer itself is the text, since `comment_text` is required.
 */
export function respond(
  repo: SrsRepository,
  proposalId: string,
  answer: Answer,
  text = ""
): string {
  return commentWith(repo, { comment_text: text || answer, kind: answer }, [
    { relationType: SO_COMMENTS_ON, targetInstanceId: proposalId },
  ]);
}
