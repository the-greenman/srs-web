/**
 * Annotations (srs-web#374, #422): one data-only descriptor per thing worth showing in the margin of
 * an instance. `annotationsFor` is the only place that decides WHAT is annotated; how each kind
 * looks is AnnotationMargin's presentation map and what it does is the shell's one `onopen` mapping.
 * It reads any `AnnotationSource` keyed by instanceId (essay and the generic shells each build one),
 * never an essay model. A new kind = a new branch here + a map entry there.
 */
import type { Comment } from "$lib/comments.js";
import type { Actor } from "$lib/srs-client.js";

/** Relation categories that are layout, not meaning: the core leaves them out of the context read. */
export const STRUCTURAL_CATEGORIES = ["composition", "sequence"];

/**
 * Something attached to an instance (an agent's problem, source, counter-claim, note...): any
 * relation to a resolving non-comment neighbour. `neighbourType` is data - the neighbour's type - so
 * new kinds need no code. The "attachment" grouping is a client presentation grouping by neighbour
 * kind, never inferred from SRS semantics.
 */
export interface Attachment {
  /** Stable key: the relation id. */
  id: string;
  relationType: string;
  /** The core vocabulary's label for `relationType` (the type key when not installed). */
  relationLabel: string;
  direction: "out" | "in";
  /** Neighbour type name, or "note". */
  neighbourType: string;
  neighbourId: string;
  label: string;
  /** Readable text of the neighbour (note sections / string field values), blank-line joined. */
  text: string;
  /** Who attached it: the relation's engine-stamped `createdBy` (RFC-046). */
  actor?: Actor;
}
/**
 * A semantic relation between this instance and another in either direction. Structural edges (the
 * core's `composition` / `sequence` categories) never appear: the engine leaves them out.
 */
export interface Related {
  /** Stable key: the relation id. */
  id: string;
  relationType: string;
  direction: "out" | "in";
  /** The other end's instance id. */
  otherId: string;
  label: string;
  /** Who asserted it: the relation's engine-stamped `createdBy` (RFC-046). */
  actor?: Actor;
}

/** What `annotationsFor` reads: maps keyed by instanceId, plus the target's own label. */
export interface AnnotationSource {
  comments: Record<string, Comment[]>;
  attachments: Record<string, Attachment[]>;
  related?: Record<string, Related[]>;
  /** Other documents holding the instance, by instance id; absent = not shared. */
  sharedIn?: Record<string, { id: string; title: string }[]>;
  /** The instance's own label ("" when it has none). */
  label(instanceId: string): string;
}

export type AnnotationKind = "comments" | "attachment" | "relation" | "shared";

export interface Annotation {
  kind: AnnotationKind;
  /** Stable within an instance; the shell keys UI state (pinned, open) on it. */
  key: string;
  /** Comments: thread size (0 still shows, as the add affordance). */
  count?: number;
  /** Short accessible name / chip text. */
  label: string;
  /** Kind of the thing (attachment neighbour type, relation type): a data key, mapped to an icon once. */
  icon?: string;
  /** Preview text for the hover card. */
  text?: string;
  /** Attachment: the relation type's label (how it relates to the instance). */
  relation?: string;
  /** Comments: the latest author; attachment / relation: the relation's `createdBy`. */
  actor?: Actor;
  /** The other end, when there is one (relation: focus it; attachment: the neighbour). */
  targetId?: string;
  /** Relation direction, for the arrow. */
  direction?: "out" | "in";
}

export function annotationsFor(source: AnnotationSource, instanceId: string): Annotation[] {
  const label = source.label(instanceId) || "untitled paragraph";
  const comments = source.comments[instanceId] ?? [];
  const sharedIn = source.sharedIn?.[instanceId] ?? [];
  return [
    {
      kind: "comments",
      key: `comments:${instanceId}`,
      count: comments.length,
      label,
      actor: comments.at(-1)?.author,
    },
    ...(source.attachments[instanceId] ?? []).map(
      (a): Annotation => ({
        kind: "attachment",
        key: a.id,
        label: a.label,
        icon: a.neighbourType,
        text: a.text,
        relation: a.relationLabel,
        actor: a.actor,
        targetId: a.neighbourId,
        direction: a.direction,
      })
    ),
    ...(sharedIn.length
      ? [
          {
            kind: "shared",
            key: `shared:${instanceId}`,
            label: `Also in ${sharedIn.map((e) => e.title).join(", ")}`,
          } as Annotation,
        ]
      : []),
    ...(source.related?.[instanceId] ?? []).map(
      (r): Annotation => ({
        kind: "relation",
        key: r.id,
        label: r.label,
        icon: r.relationType,
        actor: r.actor,
        targetId: r.otherId,
        direction: r.direction,
      })
    ),
  ];
}

export type MarginVariant = "compact" | "expanded";
const VARIANT_KEY = "srs-web.margin-variant";
/** The viewer's remembered margin variant (experiment seam); compact when unset or storage is unavailable. */
export function loadVariant(): MarginVariant {
  try {
    return localStorage.getItem(VARIANT_KEY) === "expanded" ? "expanded" : "compact";
  } catch {
    return "compact";
  }
}
export function saveVariant(v: MarginVariant): void {
  try {
    localStorage.setItem(VARIANT_KEY, v);
  } catch {}
}
