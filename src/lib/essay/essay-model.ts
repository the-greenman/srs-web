/**
 * Pure outline arithmetic for the essay editor (presentation planning only).
 *
 * The container's ordered `{instanceId, depth}` entries are the SRS truth (RFC-043); the
 * engine validates and applies every move. These helpers only turn a UI gesture (drop on
 * a row, Alt+Arrow, Tab) into the `position`/`depth` arguments the engine's member ops take.
 * `position` is 0-based against the list *without* the moved run (engine contract).
 */
export interface Entry {
  instanceId: string;
  depth?: number;
}
export type Zone = "before" | "after" | "into";
export interface Plan {
  position: number;
  depth: number;
}

export const depthOf = (e: Entry): number => e.depth ?? 0;

/** Index just past `entries[i]` and its descendants (its "run"). */
export function runEnd(entries: Entry[], i: number): number {
  let j = i + 1;
  while (j < entries.length && depthOf(entries[j]) > depthOf(entries[i])) j++;
  return j;
}

/** Where an entry lands when inserted before / after / into `targetId` (null = append at depth 0). */
export function insertPlan(entries: Entry[], targetId: string | null, zone: Zone): Plan | null {
  if (targetId === null) return { position: entries.length, depth: 0 };
  const t = entries.findIndex((e) => e.instanceId === targetId);
  if (t < 0) return null;
  const d = depthOf(entries[t]);
  if (zone === "before") return { position: t, depth: d };
  if (zone === "into") return { position: t + 1, depth: d + 1 };
  return { position: runEnd(entries, t), depth: d };
}

/** Move plan for dragging `dragId`'s run onto `targetId` (null = to the end). Null = no-op/invalid. */
export function movePlan(
  entries: Entry[],
  dragId: string,
  targetId: string | null,
  zone: Zone
): Plan | null {
  const i = entries.findIndex((e) => e.instanceId === dragId);
  if (i < 0 || dragId === targetId) return null;
  const rest = [...entries.slice(0, i), ...entries.slice(runEnd(entries, i))];
  return insertPlan(rest, targetId, zone); // null when target was inside the dragged run
}

/** Alt+ArrowUp/Down: swap with the neighbouring sibling at the same depth. */
export function stepPlan(entries: Entry[], id: string, dir: "up" | "down"): Plan | null {
  const i = entries.findIndex((e) => e.instanceId === id);
  if (i < 0) return null;
  const d = depthOf(entries[i]);
  if (dir === "down") {
    const k = runEnd(entries, i);
    return k < entries.length && depthOf(entries[k]) === d
      ? movePlan(entries, id, entries[k].instanceId, "after")
      : null;
  }
  const j = i - 1;
  if (j < 0) return null;
  // nearest preceding entry at this depth, but only if no shallower entry intervenes
  let p = j;
  while (p >= 0 && depthOf(entries[p]) > d) p--;
  return p >= 0 && depthOf(entries[p]) === d
    ? movePlan(entries, id, entries[p].instanceId, "before")
    : null;
}

/** Tab / Shift+Tab: new depth for `id` (clamped so the outline stays valid), or null. */
export function indentDepth(entries: Entry[], id: string, delta: 1 | -1): number | null {
  const i = entries.findIndex((e) => e.instanceId === id);
  if (i < 0) return null;
  const d = depthOf(entries[i]);
  const next = delta === 1 ? Math.min(d + 1, i === 0 ? 0 : depthOf(entries[i - 1]) + 1) : d - 1;
  return next < 0 || next === d ? null : next;
}

/** ids having at least one descendant. */
export function parentIds(entries: Entry[]): Set<string> {
  const out = new Set<string>();
  entries.forEach((e, i) => {
    if (i + 1 < entries.length && depthOf(entries[i + 1]) > depthOf(e)) out.add(e.instanceId);
  });
  return out;
}

/** Drop rows hidden under a folded ancestor (layers panel fold state). */
export function visibleEntries(entries: Entry[], folded: Set<string>): Entry[] {
  const out: Entry[] = [];
  let skipBelow: number | null = null;
  for (const e of entries) {
    const d = depthOf(e);
    if (skipBelow !== null && d > skipBelow) continue;
    skipBelow = null;
    out.push(e);
    if (folded.has(e.instanceId)) skipBelow = d;
  }
  return out;
}

export const toggled = (ids: string[], id: string, on: boolean): string[] =>
  on ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((x) => x !== id);
