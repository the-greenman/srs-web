/**
 * recent-repos.ts - the repositories this viewer opened lately, with stars (srs-web#661).
 *
 * A per-viewer convenience kept in IndexedDB, like the recovery copy (`browser-cache.ts`); it carries
 * no semantics (ADR-001). The list functions are pure; `loadRecent`/`saveRecent` never throw, so with
 * storage unavailable the page simply shows no list. `RecentSource` is a union so the local-folder and
 * local-file entries (srs-web#662, #663) add variants without migrating stored entries.
 */
import { GitHubRepoTreeHandle } from "./storage/github.js";
import type { DocumentHandle } from "./storage/types.js";

/** `where` is `owner/repo:branch:dir`, the form `GitHubProvider.openTree` takes as an entry path. */
export type RecentSource = { kind: "github"; where: string };

export interface RecentRepo {
  key: string;
  source: RecentSource;
  label: string;
  starred: boolean;
  lastOpened: string;
}

/** Unstarred entries kept; starred ones are never evicted. */
export const MAX_RECENT = 20;

const DB_NAME = "srs-web-recent";
const STORE = "lists";
const KEY = "repos";

const keyOf = (s: RecentSource) => `${s.kind}:${s.where}`;

/** The source and label to remember for an opened handle, or null when it cannot be reopened. */
export function describeHandle(
  handle: DocumentHandle
): { source: RecentSource; label: string } | null {
  if (handle instanceof GitHubRepoTreeHandle) {
    return { source: { kind: "github", where: handle.where }, label: handle.repoLabel };
  }
  return null;
}

function order(list: RecentRepo[]): RecentRepo[] {
  return [...list].sort(
    (a, b) => Number(b.starred) - Number(a.starred) || b.lastOpened.localeCompare(a.lastOpened)
  );
}

/** Add or refresh an opened repository (its star is kept), then cap the unstarred tail. */
export function recordOpened(
  list: RecentRepo[],
  source: RecentSource,
  label: string,
  now: string
): RecentRepo[] {
  const key = keyOf(source);
  const was = list.find((r) => r.key === key);
  const next = [
    ...list.filter((r) => r.key !== key),
    { key, source, label, starred: was?.starred ?? false, lastOpened: now },
  ];
  const sorted = order(next);
  let unstarred = 0;
  return sorted.filter((r) => r.starred || ++unstarred <= MAX_RECENT);
}

export const toggleStar = (list: RecentRepo[], key: string): RecentRepo[] =>
  order(list.map((r) => (r.key === key ? { ...r, starred: !r.starred } : r)));

export const removeRecent = (list: RecentRepo[], key: string): RecentRepo[] =>
  list.filter((r) => r.key !== key);

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
        req.onsuccess = () => {
          db.close();
          resolve(req.result);
        };
      } catch (e) {
        db.close();
        reject(e);
      }
    };
  });
}

const isRecent = (r: unknown): r is RecentRepo =>
  typeof r === "object" &&
  r !== null &&
  typeof (r as RecentRepo).key === "string" &&
  typeof (r as RecentRepo).label === "string" &&
  typeof (r as RecentRepo).source?.where === "string";

export async function loadRecent(): Promise<RecentRepo[]> {
  try {
    const stored = await idb("readonly", (s) => s.get(KEY));
    return Array.isArray(stored) ? order(stored.filter(isRecent)) : [];
  } catch {
    return [];
  }
}

export async function saveRecent(list: RecentRepo[]): Promise<void> {
  try {
    await idb("readwrite", (s) => s.put(list, KEY));
  } catch {
    /* a convenience list: losing a write is fine */
  }
}
