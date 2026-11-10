/**
 * Headless rules for the top-bar document picker (srs-web#425, phase 6). No markup, no DOM (ADR-027).
 * Recent documents come first, then the rest in their given order (under their group heading when they
 * carry one, e.g. an essay's domain, srs-web#785); a query filters by title.
 */
import { filterOptions } from "./nav-tree.js";

export interface PickerOption {
  id: string;
  title: string;
  /** Heading the option is listed under when not recent (e.g. the essay's domain); absent: "All". */
  group?: string;
}

export interface PickerRow extends PickerOption {
  /** Listed in the "Recent" group. */
  recent: boolean;
}

const MAX_RECENT = 5;

/** Rows to show: matches only; with no query, recents first (most recent first), then everything else. */
export function pickerRows(
  options: readonly PickerOption[],
  recents: readonly string[],
  query: string
): PickerRow[] {
  const matches = filterOptions(
    options.map((o) => ({ ...o, label: o.title })),
    query
  );
  // A search is a lookup, not a browse: matches in repository order, no Recent group.
  if (query.trim())
    return matches.map((m) => ({ id: m.id, title: m.title, group: m.group, recent: false }));
  const byId = new Map(matches.map((m) => [m.id, m]));
  const recentRows: PickerRow[] = [];
  for (const id of recents) {
    const hit = byId.get(id);
    if (hit && recentRows.length < MAX_RECENT) {
      recentRows.push({ id: hit.id, title: hit.title, group: hit.group, recent: true });
      byId.delete(id);
    }
  }
  const rest = matches
    .filter((m) => byId.has(m.id))
    .map((m) => ({ id: m.id, title: m.title, group: m.group, recent: false }));
  return [...recentRows, ...rest];
}

/** The heading a row is listed under: "Recent", its group, or "All". */
export const rowHeading = (row: PickerRow): string =>
  row.recent ? "Recent" : (row.group ?? "All");

/** Headings show only when browsing (no query) and the rows fall under more than one. */
export const showHeadings = (rows: readonly PickerRow[], query: string): boolean =>
  !query.trim() && new Set(rows.map(rowHeading)).size > 1;

/** The recent list after opening `id`: it moves to the front, capped, no duplicates. */
export function pushRecent(recents: readonly string[], id: string): string[] {
  return [id, ...recents.filter((r) => r !== id)].slice(0, MAX_RECENT);
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadRecents(key: string, storage?: Store): string[] {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function saveRecents(key: string, recents: readonly string[], storage?: Store): void {
  try {
    storage?.setItem(key, JSON.stringify(recents));
  } catch {
    // Remembering is a convenience; a full or blocked store must not break switching.
  }
}

/** Move the highlighted row: wraps, and starts at the ends when nothing is highlighted. */
export function moveActive(
  count: number,
  active: number,
  key: "ArrowDown" | "ArrowUp" | "Home" | "End"
): number {
  if (count === 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (active < 0) return key === "ArrowDown" ? 0 : count - 1;
  return (active + (key === "ArrowDown" ? 1 : -1) + count) % count;
}
