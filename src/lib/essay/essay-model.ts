/**
 * Presentation helpers for the essay editor (fold / hide state over the outline).
 *
 * The container's outline (`get_container_outline`, RFC-043) is the SRS truth and the core
 * resolves every gesture (drop, Alt+Arrow, Tab) against it; nothing here plans a move.
 */
import { type OutlineEntry, renderMarkdown } from "$lib/srs-client.js";

export interface Entry {
  instanceId: string;
  depth?: number;
  parentInstanceId?: string | null;
}
export type Zone = "before" | "after" | "into";

/** False when `targetId` lies in `dragId`'s run (itself or a descendant), read from the core's `runEnd`. */
export function outsideRun(entries: OutlineEntry[], dragId: string, targetId: string): boolean {
  const i = entries.findIndex((e) => e.instanceId === dragId);
  return i < 0 || !entries.slice(i, entries[i].runEnd).some((e) => e.instanceId === targetId);
}

/** Drop rows hidden under a folded ancestor (layers panel fold state). */
export function visibleEntries<T extends Entry>(entries: T[], folded: Set<string>): T[] {
  const out: T[] = [];
  const skipped = new Set<string>(); // folded rows and rows under them (parents precede children)
  for (const e of entries) {
    const p = e.parentInstanceId;
    if (p && (folded.has(p) || skipped.has(p))) {
      skipped.add(e.instanceId);
      continue;
    }
    out.push(e);
  }
  return out;
}

export const toggled = (ids: string[], id: string, on: boolean): string[] =>
  on ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((x) => x !== id);

/** ids hidden only because an ancestor is hidden (Photoshop model); derived from parents, never stored. */
export function hiddenByAncestor(entries: Entry[], hidden: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    const p = e.parentInstanceId;
    if (p && (hidden.has(p) || out.has(p))) out.add(e.instanceId);
  }
  return out;
}

export interface Count {
  words: number;
  chars: number;
}
const graphemes = new Intl.Segmenter();
/** Words split on whitespace; characters are graphemes, spaces included (what bid forms count). */
export function countText(s: string): Count {
  const t = s.trim();
  return { words: t ? t.split(/\s+/).length : 0, chars: [...graphemes.segment(t)].length };
}

/** The text a reader sees in rendered (sanitized) HTML: markdown syntax and link URLs drop out. */
export const htmlText = (html: string): string =>
  new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";

/** A paragraph body as the reader sees it, through the core's markdown renderer. */
export const plainText = (md: string): string => (md ? htmlText(renderMarkdown(md)) : "");

/**
 * Word / character counts over the essay's main body (srs-web#648): each paragraph's own count, a
 * subtotal for each paragraph with children (its run, from the core's `runEnd`), and the essay
 * total. Hidden paragraphs count; the draft and bin are not in `entries`, so they never do.
 */
export function essayCounts(
  entries: OutlineEntry[],
  text: (id: string) => string
): { own: Map<string, Count>; subtotal: Map<string, Count>; total: Count } {
  const counts = entries.map((e) => countText(text(e.instanceId)));
  const sum = (cs: Count[]) =>
    cs.reduce((a, c) => ({ words: a.words + c.words, chars: a.chars + c.chars }), {
      words: 0,
      chars: 0,
    });
  const own = new Map(entries.map((e, i) => [e.instanceId, counts[i]]));
  const subtotal = new Map(
    entries.flatMap((e, i) =>
      e.hasChildren ? [[e.instanceId, sum(counts.slice(i, e.runEnd))] as const] : []
    )
  );
  return { own, subtotal, total: sum(counts) };
}
