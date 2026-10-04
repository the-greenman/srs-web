/**
 * Comments on any instance (srs-web#422). The comment Type and `comments-on` relation come from the
 * essay package (muDemocracy.org#229/#250), so comments exist only where that package is installed
 * (`commentsAvailable`, owner decision D4). Loading and creation are pass-through (ADR-001): the
 * engine stamps `createdBy` (RFC-046); everything here is grouping and presentation.
 */
import {
  createRecord,
  createRelation,
  deleteRecord,
  listRelationTypes,
  listRelations,
  listTypes,
  renderMarkdown,
} from "$lib/srs-client.js";
import type { Actor, SrsRepository, TypeSummary } from "$lib/srs-client.js";
import { recordsOfType, typeVersion } from "$lib/type-version.js";

/** `comment` type (muDemocracy.org#250): `comment_text` field; linked to its target by `comments-on`. */
export const COMMENT_TYPE_ID = "7482e41b-7d3d-4069-b165-ee509dacce22";
/** RelationTypeDefinition id of `com.mudemocracy.essay/comments-on` (comment -> target). */
export const COMMENTS_ON_TYPE_ID = "607009b0-310c-4eda-aad2-d079884ff85c";
/** The engine's relation filter / create input keys on the declared name, not the definition id. */
export const COMMENTS_ON = "com.mudemocracy.essay/comments-on";

/** A comment on an instance; `author` is the engine-stamped `createdBy` (absent = unattributed). */
export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  author?: Actor;
}

/** Feature detection: the comment type AND the `comments-on` relation are both installed. */
export function commentsAvailable(repo: SrsRepository): boolean {
  return (
    listTypes(repo).some((t) => t.id === COMMENT_TYPE_ID) &&
    listRelationTypes(repo).some((t) => t.key === COMMENTS_ON)
  );
}

/** Last comment read per repository handle, keyed on the comments-on relation ids (srs-web#359). */
const commentCache = new WeakMap<object, { key: string; comments: Record<string, Comment[]> }>();

/**
 * Comments by target instance, oldest first by the engine's createdAt. One relation read per reload;
 * the comment records (immutable here) are re-read only when the set of comments-on relations
 * changed, which keeps a commit's reload cheap (~6 ms vs ~15 ms on a muSrs-sized repo, 50 comments).
 */
export function loadComments(repo: SrsRepository, types: TypeSummary[]): Record<string, Comment[]> {
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
    const text = r.fieldValues.comment_text;
    out[rel.targetInstanceId].push({
      id: r.instanceId,
      text: typeof text === "string" ? text : "",
      createdAt: r.createdAt ?? "",
      author: r.createdBy,
    });
  }
  for (const list of Object.values(out))
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  commentCache.set(repo, { key, comments: out });
  return out;
}

/** Reply on an instance: a comment record + `comments-on` (comment -> target); never a container member. */
export function addComment(repo: SrsRepository, targetId: string, text: string): void {
  const rec = createRecord(repo, COMMENT_TYPE_ID, typeVersion(repo, COMMENT_TYPE_ID), {
    fieldValues: { comment_text: text },
  });
  try {
    createRelation(repo, {
      relationType: COMMENTS_ON,
      sourceInstanceId: rec.instanceId,
      targetInstanceId: targetId,
    });
  } catch (e) {
    // Not atomic in the engine: do not leave an orphan comment record behind.
    try {
      deleteRecord(repo, rec.instanceId);
    } catch {}
    throw e;
  }
}

/** Threads longer than this keep only the newest this-many comments open; the rest sit behind "N earlier comments". */
export const EARLIER_THRESHOLD = 8;

/** Consecutive comments by the same actor id (or consecutive unattributed ones) form one run. */
export function groupRuns(comments: Comment[]): Comment[][] {
  const runs: Comment[][] = [];
  for (const c of comments) {
    const last = runs.at(-1);
    if (last && last[0].author?.id === c.author?.id) last.push(c);
    else runs.push([c]);
  }
  return runs;
}

/** A comment as one line of plain text: the sanitised renderMarkdown output's textContent (no second markdown grammar, never injected as HTML). */
export function plainText(md: string): string {
  const doc = new DOMParser().parseFromString(renderMarkdown(md), "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
