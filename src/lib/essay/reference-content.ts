/** What a reference says, for the panel and the pinned pane alike (srs-web#787): one read, so they cannot drift. */
import type { SrsRepository } from "$lib/srs-client.js";
import { referenceText } from "./essay-document.js";
import type { Reference } from "./essay-document.js";
import { passageIn } from "./quote.js";

export interface ReferenceContent {
  text: string;
  /** A quotation's source text, when it still holds the words (#525). */
  source?: { title: string; text: string; passage: string };
}

/** The record's own text, then its attached file's; a quotation: its words, then its record's text. */
export function referenceContent(
  repo: SrsRepository,
  references: Reference[],
  id: string
): ReferenceContent {
  const ref = references.find((r) => r.id === id);
  if (!ref) return { text: "" };
  const full = (r: Reference) => [r.text, referenceText(repo, r.id)].filter(Boolean).join("\n\n");
  if (!ref.quote) return { text: full(ref) };
  const src = references.find((r) => r.id === ref.sourceId);
  const srcText = src ? full(src) : "";
  return {
    text: [ref.quote, full(ref)].filter(Boolean).join("\n\n"),
    ...(src && passageIn(srcText, ref.quote)
      ? { source: { title: src.label, text: srcText, passage: ref.quote } }
      : {}),
  };
}

/** The opening text of a reference, as one run of plain words; "" when it holds none. */
export const referencePreview = (r: Reference, attached: string | undefined): string =>
  openingWords(r.quote || r.text || attached || "");

/** The first words of a text, whitespace collapsed: enough for two lines of a panel. */
export const openingWords = (text: string): string =>
  text.slice(0, 600).replace(/\s+/g, " ").trim().slice(0, 300);
