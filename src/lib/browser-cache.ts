/**
 * browser-cache.ts - recovery-copy persistence.
 *
 * The recovery copy is the exploded file tree (`exportTree()`, attachment bytes included),
 * kept in IndexedDB: one database, one object store, one key (srs-web#505). Not the `.srs`
 * archive: its Deflate blocked the main thread ~320 ms per save on a muSrs-size repository;
 * the tree takes ~25 ms (srs-web#816). ADR-001: the bytes are opaque here; only WASM produces
 * and consumes them.
 */

const DB_NAME = "srs-web";
const STORE = "working-copy";
const KEY = "current";
// ponytail: legacy localStorage `.srsj` recovery copy (pre-#505); delete LEGACY_KEY handling after a release or two.
const LEGACY_KEY = "srs-web:working-copy";

/** Where the copy came from: enough to save back, based on the commit the work started from (srs-web#732). */
export interface WorkingCopySource {
  kind: "github";
  where: string;
  commitSha: string;
}

/**
 * `tree` is the exploded file tree (`load_tree` input). `bytes` is a `.srs` archive saved before
 * srs-web#816, and `srsj` a migrated legacy entry; both are only read.
 */
export type WorkingCopyTree = Record<string, Uint8Array>;
export interface WorkingCopyEntry {
  name: string;
  savedAt: string;
  tree?: WorkingCopyTree;
  bytes?: Uint8Array;
  srsj?: string;
  source?: WorkingCopySource;
}

const isSource = (s: Partial<WorkingCopySource> | undefined): s is WorkingCopySource =>
  s?.kind === "github" && typeof s.where === "string" && typeof s.commitSha === "string";

// One cached connection: a write issued from `pagehide` then starts its transaction
// synchronously (an async open would be torn down with the page). Reopened if it fails.
let dbPromise: Promise<IDBDatabase> | undefined;
let dbFactory: IDBFactory | undefined;
function openDb(): Promise<IDBDatabase> {
  if (dbFactory !== indexedDB) dbPromise = undefined; // a different factory (tests) is a different DB
  dbFactory = indexedDB;
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(open.result);
  }).catch((e) => {
    dbPromise = undefined;
    throw e;
  });
  return dbPromise as Promise<IDBDatabase>;
}

async function idb<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * Persist the recovery copy. `exportCopy` runs inside the try, so an export throw is a
 * `false`, like IndexedDB being unavailable or over quota. Never throws: autosave failure
 * must not interrupt editing.
 */
export async function saveWorkingCopy(
  name: string,
  exportCopy: () => WorkingCopyTree,
  source?: WorkingCopySource
): Promise<boolean> {
  try {
    const entry: WorkingCopyEntry = {
      name,
      tree: exportCopy(),
      savedAt: new Date().toISOString(),
      ...(source && { source }),
    };
    await idb("readwrite", (s) => s.put(entry, KEY));
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    return true;
  } catch (e: unknown) {
    console.warn("autosave failed:", e);
    return false;
  }
}

function loadLegacy(): WorkingCopyEntry | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return null;
    const e = JSON.parse(raw) as Record<string, unknown>;
    if (typeof e.name !== "string" || typeof e.srsj !== "string" || typeof e.savedAt !== "string")
      return null;
    return { name: e.name, srsj: e.srsj, savedAt: e.savedAt };
  } catch {
    return null;
  }
}

/** Load the recovery copy (IndexedDB, else a legacy localStorage entry). Never throws. */
export async function loadWorkingCopy(): Promise<WorkingCopyEntry | null> {
  try {
    const e = (await idb("readonly", (s) => s.get(KEY))) as Partial<WorkingCopyEntry> | undefined;
    const tree = e?.tree && typeof e.tree === "object" ? e.tree : undefined;
    const bytes = e?.bytes instanceof Uint8Array ? e.bytes : undefined;
    if (e && typeof e.name === "string" && typeof e.savedAt === "string" && (tree || bytes)) {
      return {
        name: e.name,
        savedAt: e.savedAt,
        ...(tree ? { tree } : { bytes }),
        ...(isSource(e.source) && { source: e.source }),
      };
    }
  } catch {
    /* fall through to the legacy entry */
  }
  return loadLegacy();
}

/** Remove the recovery copy (and any legacy entry). Never throws. */
export async function clearWorkingCopy(): Promise<void> {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  try {
    await idb("readwrite", (s) => s.delete(KEY));
  } catch {
    /* ignore */
  }
}

/**
 * Coalesce recovery-copy writes (srs-web#353, srs-web#769). The export is a synchronous
 * whole-repo serialise, so it must not land mid-typing: each `schedule()` restarts a
 * `quietMs` timer and the write happens once writes pause. A `maxMs` cap from the first
 * pending write means a steady background-agent stream cannot hold the copy off forever.
 * `flush()` writes now if a write is pending (page hide); `cancel()` drops it (save, new document).
 */
export function workingCopyScheduler(write: () => void, quietMs: number, maxMs: number) {
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let cap: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(quiet);
    clearTimeout(cap);
    quiet = cap = undefined;
  };
  const flush = () => {
    if (quiet === undefined) return;
    cancel();
    write();
  };
  return {
    schedule: () => {
      clearTimeout(quiet);
      quiet = setTimeout(flush, quietMs);
      cap ??= setTimeout(flush, maxMs);
    },
    flush,
    cancel,
  };
}
