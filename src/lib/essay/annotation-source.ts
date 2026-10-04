/** The essay's adapter onto the generic annotation model: an EssayModel is an AnnotationSource. */
import type { AnnotationSource } from "$lib/annotations.js";
import type { EssayModel } from "./essay-document.js";

export const essaySource = (m: EssayModel): AnnotationSource => ({
  comments: m.comments,
  attachments: m.attachments,
  related: m.related,
  sharedIn: m.sharedIn,
  label: (id) => m.paragraphs[id]?.title ?? "",
});
