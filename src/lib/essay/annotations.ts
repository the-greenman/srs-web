/**
 * Paragraph annotations (srs-web#374): one data-only descriptor per thing worth showing in a
 * paragraph's margin. `annotationsFor` is the only place that decides WHAT is annotated; how each
 * kind looks is ParagraphMargin's presentation map and what it does is EssayShell's one
 * `onopen` mapping. A new kind = a new branch here + a map entry there.
 */
import type { EssayModel } from "./essay-document.js";

export type AnnotationKind = "comments" | "attachment" | "relation" | "shared";

export interface Annotation {
  kind: AnnotationKind;
  /** Stable within a paragraph; the shell keys UI state (pinned, open) on it. */
  key: string;
  /** Comments: thread size (0 still shows, as the add affordance). */
  count?: number;
  /** Short accessible name / chip text. */
  label: string;
  /** Kind of the thing (attachment neighbour type, relation type): mark and hue seed. */
  icon?: string;
  /** Preview text for the hover card. */
  text?: string;
  /** Attachment: the relation type's label (how it relates to the paragraph). */
  relation?: string;
  actor?: { kind: string; id: string; name?: string };
  /** The other end, when there is one (relation: focus it; attachment: the neighbour). */
  targetId?: string;
  /** Relation direction, for the arrow. */
  direction?: "out" | "in";
}

export function annotationsFor(model: EssayModel, paragraphId: string): Annotation[] {
  const p = model.paragraphs[paragraphId];
  const label = p?.title || "untitled paragraph";
  const comments = model.comments[paragraphId] ?? [];
  return [
    {
      kind: "comments",
      key: `comments:${paragraphId}`,
      count: comments.length,
      label,
      actor: comments.at(-1)?.author,
    },
    ...(model.attachments[paragraphId] ?? []).map(
      (a): Annotation => ({
        kind: "attachment",
        key: a.id,
        label: a.label,
        icon: a.neighbourType,
        text: a.text,
        relation: a.relationLabel,
        targetId: a.neighbourId,
        direction: a.direction,
      })
    ),
    ...(model.sharedIn[paragraphId]?.length
      ? [
          {
            kind: "shared",
            key: `shared:${paragraphId}`,
            label: `Also in ${model.sharedIn[paragraphId].map((e) => e.title).join(", ")}`,
          } as Annotation,
        ]
      : []),
    ...(model.related[paragraphId] ?? []).map(
      (r): Annotation => ({
        kind: "relation",
        key: r.id,
        label: r.label,
        icon: r.relationType,
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
