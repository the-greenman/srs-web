/**
 * Presentation helpers for the essay editor (fold / hide state over the outline).
 *
 * The container's outline (`get_container_outline`, RFC-043) is the SRS truth and the core
 * resolves every gesture (drop, Alt+Arrow, Tab) against it; nothing here plans a move.
 */
import type { OutlineEntry } from "$lib/srs-client.js";

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

/**
 * Word / character counts over the essay's main body (srs-web#648): each paragraph's own count, its
 * subtotal with everything nested under it, and the essay total. Hidden paragraphs count; the
 * draft and bin are not in `entries`, so they never do.
 */
export function essayCounts(
  entries: Entry[],
  text: (id: string) => string
): { own: Map<string, Count>; subtotal: Map<string, Count>; total: Count } {
  const own = new Map<string, Count>();
  const subtotal = new Map<string, Count>();
  const total = { words: 0, chars: 0 };
  const add = (into: Count | undefined, c: Count) => {
    if (!into) return;
    into.words += c.words;
    into.chars += c.chars;
  };
  const parent = new Map<string, string | null | undefined>(); // parents precede children
  for (const e of entries) {
    const c = countText(text(e.instanceId));
    own.set(e.instanceId, c);
    subtotal.set(e.instanceId, { ...c });
    add(total, c);
    parent.set(e.instanceId, e.parentInstanceId);
    for (let p = e.parentInstanceId; p; p = parent.get(p)) add(subtotal.get(p), c);
  }
  return { own, subtotal, total };
}

const n = (x: number) => x.toLocaleString();
/** Small visible text and the hover / screen-reader sentence; `subtotal` only for a paragraph with children. */
export function countLabel(own: Count, subtotal?: Count): { text: string; title: string } {
  const short = (c: Count) => `${n(c.words)}w ${n(c.chars)}c`;
  const long = (c: Count) => `${n(c.words)} words, ${n(c.chars)} characters`;
  return subtotal
    ? {
        text: `${short(own)} · Σ ${short(subtotal)}`,
        title: `This paragraph: ${long(own)}. With nested paragraphs: ${long(subtotal)}.`,
      }
    : { text: short(own), title: long(own) };
}
