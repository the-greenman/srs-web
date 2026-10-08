/**
 * Comments on any instance (srs-web#422). The comment Type and `comments-on` relation come from the
 * essay package (muDemocracy.org#229/#250), so comments exist only where that package is installed
 * (`commentsAvailable`, owner decision D4). Loading and creation are pass-through (ADR-001): the
 * engine stamps `createdBy` (RFC-046); everything here is grouping and presentation.
 */
import {
  createRecord,
  createRecordInContainer,
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

/** SemanticOps comments package (srs-programme packages/comments, srs-web#527): preferred when installed. */
export const SO_COMMENT_TYPE_ID = "11cd0a5f-8c3f-4ec2-a055-5b9f56c5b0bc";
export const SO_COMMENTS_ON = "com.semanticops.comments/comments-on";

/** True for either package's `comments-on` relation key. */
export const isCommentsOn = (key: string): boolean => key === COMMENTS_ON || key === SO_COMMENTS_ON;

/** A comment on an instance; `author` is the engine-stamped `createdBy` (absent = unattributed). */
export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  author?: Actor;
}

/** Whether a comment type AND its `comments-on` relation are both installed, per package. */
function installed(repo: SrsRepository) {
  const types = listTypes(repo);
  const keys = listRelationTypes(repo);
  const has = (typeId: string, rel: string) =>
    types.some((t) => t.id === typeId) && keys.some((t) => t.key === rel);
  return { so: has(SO_COMMENT_TYPE_ID, SO_COMMENTS_ON), old: has(COMMENT_TYPE_ID, COMMENTS_ON) };
}

/** Feature detection: either package's comment type and `comments-on` relation are installed. */
export function commentsAvailable(repo: SrsRepository): boolean {
  const i = installed(repo);
  return i.so || i.old;
}

/** Last comment read per repository handle, keyed on the comments-on relation ids (srs-web#359). */
const commentCache = new WeakMap<object, { key: string; comments: Record<string, Comment[]> }>();

/**
 * Comments by target instance, oldest first by the engine's createdAt. One relation read per reload;
 * the comment records (immutable here) are re-read only when the set of comments-on relations
 * changed, which keeps a commit's reload cheap (~6 ms vs ~15 ms on a muSrs-sized repo, 50 comments).
 */
export function loadComments(repo: SrsRepository, types: TypeSummary[]): Record<string, Comment[]> {
  // ponytail: read old essay comment ids until essays depend on com.semanticops.comments, muDemocracy.org#305
  const rels = [SO_COMMENTS_ON, COMMENTS_ON].flatMap((relationType) =>
    listRelations(repo, { relationType })
  );
  const key = rels.map((r) => r.relationId).join(",");
  const hit = commentCache.get(repo);
  if (hit?.key === key) return hit.comments;
  const byId = new Map(
    [SO_COMMENT_TYPE_ID, COMMENT_TYPE_ID]
      .flatMap((id) => recordsOfType(repo, types, id))
      .map((r) => [r.instanceId, r])
  );
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

/**
 * Reply on an instance: a comment record + `comments-on` (comment -> target). With `containerId`
 * (an essay's comments container, srs-web#494) the record is created into it in the same call.
 */
export function addComment(
  repo: SrsRepository,
  targetId: string,
  text: string,
  containerId?: string | null
): void {
  const input = { fieldValues: { comment_text: text } };
  // Write the SemanticOps pair when installed, else the essay pair.
  const [typeId, relationType] = installed(repo).so
    ? [SO_COMMENT_TYPE_ID, SO_COMMENTS_ON]
    : [COMMENT_TYPE_ID, COMMENTS_ON];
  const v = typeVersion(repo, typeId);
  const rec = containerId
    ? createRecordInContainer(repo, containerId, typeId, v, input)
    : createRecord(repo, typeId, v, input);
  try {
    createRelation(repo, {
      relationType,
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
