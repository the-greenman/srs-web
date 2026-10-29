/**
 * What the non-essay shells show for one selected instance (srs-web#422): the engine's relations as
 * generic `relation` annotations, plus its comments where the comment type is installed (D4).
 * ADR-001: the ENGINE filters (`contextRecord(..., excludeRelationCategories)` leaves structural edges
 * out); this module classifies no relation by name. `comments-on` rows are skipped because comments
 * render in the thread, a presentation rule, not a classification.
 */
import { STRUCTURAL_CATEGORIES, annotationsFor } from "$lib/annotations.js";
import type { Annotation, Related } from "$lib/annotations.js";
import { commentsAvailable, isCommentsOn, loadComments } from "$lib/comments.js";
import type { Comment } from "$lib/comments.js";
import { PROPOSES_LINK_TO, loadProposals } from "$lib/link-proposals.js";
import type { ProposalView } from "$lib/link-proposals.js";
import { contextRecord, listRelationTypes, listTypes } from "$lib/srs-client.js";
import type { ContextRelation, SrsRepository } from "$lib/srs-client.js";

export interface InstanceNotes {
  /** The comment type and `comments-on` are installed: show the thread and the composer. */
  available: boolean;
  /** Plain comments; link proposals are shown apart, in `proposals`. */
  comments: Comment[];
  /** One `relation` annotation per engine relation (comments excluded), actor = the relation's `createdBy`. */
  annotations: Annotation[];
  /** Links agents propose from this instance, with labels from the engine (srs-web#617). */
  proposals: ProposalView[];
}

/** Proposals from `instanceId`, labelled by the engine: the relation type's label and the target's label. */
function proposalViews(
  repo: SrsRepository,
  instanceId: string,
  labels: Map<string, string>
): ProposalView[] {
  return loadProposals(repo, listTypes(repo), instanceId).map((p) => {
    const to = contextRecord(repo, p.id).relations.find(
      (r) => r.relationType === PROPOSES_LINK_TO && r.direction === "out"
    );
    return {
      id: p.id,
      relationLabel: labels.get(p.relationType) || p.relationType,
      targetLabel: (to && neighbourTitle(to)) || p.targetId,
      why: p.why,
      author: p.author,
      answers: p.answers,
    };
  });
}

const neighbourTitle = (r: ContextRelation): string => {
  const outgoing = r.direction === "out";
  const n = r.neighbour;
  return (
    (outgoing ? r.targetLabel : r.sourceLabel) ||
    (n?.kind === "note" ? n.title : undefined) ||
    (outgoing ? r.targetId : r.sourceId)
  );
};

export function loadInstanceNotes(repo: SrsRepository, instanceId: string): InstanceNotes {
  const labels = new Map(listRelationTypes(repo).map((t) => [t.key, t.label]));
  const related: Related[] = contextRecord(repo, instanceId, undefined, STRUCTURAL_CATEGORIES)
    .relations.filter((r) => !isCommentsOn(r.relationType))
    .map((r) => ({
      id: r.relationId,
      relationType: labels.get(r.relationType) || r.relationType,
      direction: r.direction,
      otherId: r.direction === "out" ? r.targetId : r.sourceId,
      label: neighbourTitle(r),
      actor: r.createdBy,
    }));
  const available = commentsAvailable(repo);
  const proposals = available ? proposalViews(repo, instanceId, labels) : [];
  const proposed = new Set(proposals.map((p) => p.id));
  const comments = available
    ? (loadComments(repo, listTypes(repo))[instanceId] ?? []).filter((c) => !proposed.has(c.id))
    : [];
  const annotations = annotationsFor(
    { comments: {}, attachments: {}, related: { [instanceId]: related }, label: () => "" },
    instanceId
  ).filter((a) => a.kind === "relation");
  return { available, comments, annotations, proposals };
}
