/**
 * browser-cache.ts - recovery-copy persistence.
 *
 * The recovery copy is the `.srs` archive (`exportArchive()`, so attachment bytes survive)
 * kept in IndexedDB: one database, one object store, one key (srs-web#505). ADR-001: the
 * bytes are opaque here; only WASM produces and consumes them.
 */

const DB_NAME = "srs-web";
const STORE = "working-copy";
const KEY = "current";
// ponytail: legacy localStorage `.srsj` recovery copy (pre-#505); delete LEGACY_KEY handling after a release or two.
const LEGACY_KEY = "srs-web:working-copy";

/** `bytes` is the `.srs` archive; `srsj` is set only for a migrated legacy entry. */
export interface WorkingCopyEntry {
  name: string;
  savedAt: string;
  bytes?: Uint8Array;
  srsj?: string;
}

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
 * Persist the recovery copy. `exportBytes` runs inside the try, so an export throw is a
 * `false`, like IndexedDB being unavailable or over quota. Never throws: autosave failure
 * must not interrupt editing.
 */
export async function saveWorkingCopy(
  name: string,
  exportBytes: () => Uint8Array
): Promise<boolean> {
  try {
    const entry: WorkingCopyEntry = {
      name,
      bytes: exportBytes(),
      savedAt: new Date().toISOString(),
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
    if (
      e &&
      typeof e.name === "string" &&
      typeof e.savedAt === "string" &&
      e.bytes instanceof Uint8Array
    ) {
      return { name: e.name, savedAt: e.savedAt, bytes: e.bytes };
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
 * Coalesce recovery-copy writes (srs-web#353). The first `schedule()` arms one timer and
 * later calls ride along, so the copy is at most `delayMs` stale and costs at most one full
 * export per window, however fast the human or any background agent writes. A restarting
 * debounce would never fire under a steady agent write stream; this fixed window does.
 * `flush()` writes now if a write is pending (page hide); `cancel()` drops it (save, new document).
 */
export function workingCopyScheduler(write: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    write();
  };
  return {
    schedule: () => {
      timer ??= setTimeout(flush, delayMs);
    },
    flush,
    cancel: () => {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
