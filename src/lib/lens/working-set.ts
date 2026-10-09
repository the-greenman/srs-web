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

/**
 * The set model, one rule on every lens: `working` is what is checked (a draft); `mySet` is the shown,
 * stored set, and it changes only by `commit` ("Show as a set" / "Replace My set with these") or
 * `removeSet` ("Remove My set"). Checking, unchecking, Context's "+" and "Add everything" change the
 * draft only, on the My set lens too. Pure: the caller stores `mySet` when it changes.
 */
export interface SetState {
  working: string[];
  mySet: string[];
}

/** Check (`on`) or uncheck `ids`. */
export function check(s: SetState, ids: string[], on: boolean): SetState {
  const working = on
    ? [...new Set([...s.working, ...ids])]
    : s.working.filter((w) => !ids.includes(w));
  return { ...s, working };
}

/** Context's "+" and "Add everything": check `ids`. */
export const add = (s: SetState, ids: string[]): SetState => check(s, ids, true);

/** "Clear selection": drop every check; My set stays. */
export const clear = (s: SetState): SetState => ({ ...s, working: [] });

/** "Show as a set" / "Replace My set with these": the checks become My set. */
export const commit = (s: SetState): SetState => ({
  working: [...s.working],
  mySet: [...s.working],
});

/** "Remove My set": delete the shown set; the checks stay (they can be shown again). */
export const removeSet = (s: SetState): SetState => ({ ...s, mySet: [] });

/** Committing would change My set: something is checked and it is not already My set. */
export function pending(s: SetState): boolean {
  if (s.working.length === 0) return false;
  const shown = new Set(s.mySet);
  return s.working.length !== shown.size || s.working.some((w) => !shown.has(w));
}
