/**
 * Presentation helpers for the essay editor (fold / hide state over the outline).
 *
 * The container's outline (`get_container_outline`, RFC-043) is the SRS truth and the core
 * resolves every gesture (drop, Alt+Arrow, Tab) against it; nothing here plans a move.
 */
export interface Entry {
  instanceId: string;
  depth?: number;
  parentInstanceId?: string | null;
}
export type Zone = "before" | "after" | "into";

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
