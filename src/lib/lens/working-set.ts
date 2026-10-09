/**
 * working-set — the viewer's hand-drawn set ("My set", lens id `set`), kept per repository in browser
 * storage: a per-viewer convenience only (ADR-025), never shared, never the hash. Every access is in a
 * try/catch, so a private window or blocked storage leaves Lenses working with the set in memory.
 */
export const setKey = (repositoryId: string) => `srs-web.lens-set.${repositoryId}`;

/** The stored ids, or [] when storage is absent, throws or holds junk. */
export function readSet(repositoryId: string, storage?: Storage): string[] {
  try {
    const v: unknown = JSON.parse((storage ?? localStorage).getItem(setKey(repositoryId)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Never throws; a failed write is ignored (per-viewer convenience only). */
export function writeSet(repositoryId: string, ids: string[], storage?: Storage): void {
  try {
    const s = storage ?? localStorage;
    if (ids.length > 0) s.setItem(setKey(repositoryId), JSON.stringify(ids));
    else s.removeItem(setKey(repositoryId));
  } catch {
    // Private window or blocked storage: the set lives in memory only.
  }
}
