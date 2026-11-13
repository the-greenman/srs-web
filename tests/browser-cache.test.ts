import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkingCopy,
  loadWorkingCopy,
  saveWorkingCopy,
  workingCopyScheduler,
} from "../src/lib/browser-cache.js";

// Tiny in-memory IndexedDB stub: just the open/transaction/objectStore/put/get/delete
// surface browser-cache uses. Requests resolve on a microtask.
function makeIndexedDBStub(): IDBFactory {
  const data = new Map<string, unknown>();
  const req = <T>(fn: () => T) => {
    const r: { result?: T; onsuccess?: () => void } = {};
    queueMicrotask(() => {
      r.result = fn();
      r.onsuccess?.();
    });
    return r;
  };
  const store = {
    put: (v: unknown, k: string) => req(() => void data.set(k, v)),
    get: (k: string) => req(() => data.get(k)),
    delete: (k: string) => req(() => void data.delete(k)),
  };
  const db = {
    transaction: () => ({ objectStore: () => store }),
    close() {},
    createObjectStore() {},
  };
  return {
    open: () => {
      const r: { result: unknown; onsuccess?: () => void; onupgradeneeded?: () => void } = {
        result: db,
      };
      queueMicrotask(() => {
        r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  } as unknown as IDBFactory;
}

function makeLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  vi.stubGlobal("indexedDB", makeIndexedDBStub());
  vi.stubGlobal("localStorage", makeLocalStorageMock());
}

const TREE = { "manifest.json": new Uint8Array([1, 2, 3]) };

describe("browser-cache (exploded tree in IndexedDB, srs-web#505, #816)", () => {
  it("round-trips name and file tree; savedAt is ISO 8601", async () => {
    setup();
    expect(await saveWorkingCopy("my-repo", () => TREE)).toBe(true);
    const entry = await loadWorkingCopy();
    expect(entry?.name).toBe("my-repo");
    expect(entry?.tree).toEqual(TREE);
    expect(Number.isNaN(new Date(entry?.savedAt ?? "").getTime())).toBe(false);
  });

  it("keeps the source a restored session saves back to (srs-web#732)", async () => {
    setup();
    const source = { kind: "github" as const, where: "o/r:main:", commitSha: "abc" };
    await saveWorkingCopy("my-repo", () => TREE, source);
    expect((await loadWorkingCopy())?.source).toEqual(source);
  });

  it("restores a copy with no source or a malformed one, without a source (srs-web#732)", async () => {
    setup();
    await saveWorkingCopy("my-repo", () => TREE);
    expect((await loadWorkingCopy())?.source).toBeUndefined();
    const bad = { kind: "github", where: "o/r:main:" } as never;
    await saveWorkingCopy("my-repo", () => TREE, bad);
    const entry = await loadWorkingCopy();
    expect(entry?.tree).toEqual(TREE);
    expect(entry?.source).toBeUndefined();
  });

  it("clearWorkingCopy empties it; load returns null when nothing is stored", async () => {
    setup();
    expect(await loadWorkingCopy()).toBeNull();
    await saveWorkingCopy("repo", () => TREE);
    await clearWorkingCopy();
    expect(await loadWorkingCopy()).toBeNull();
  });

  it("an export throw yields false and never throws", async () => {
    setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await saveWorkingCopy("repo", () => {
        throw new Error("cannot carry binary content");
      })
    ).toBe(false);
  });

  it("unavailable IndexedDB yields false on save and null on load", async () => {
    setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(await saveWorkingCopy("repo", () => TREE)).toBe(false);
    expect(await loadWorkingCopy()).toBeNull();
    await expect(clearWorkingCopy()).resolves.toBeUndefined();
  });

  it("migrates a legacy localStorage .srsj entry, and a successful save removes it", async () => {
    setup();
    const legacy = { name: "old", srsj: "{}", savedAt: new Date().toISOString() };
    localStorage.setItem("srs-web:working-copy", JSON.stringify(legacy));
    expect(await loadWorkingCopy()).toEqual(legacy);
    await saveWorkingCopy("old", () => TREE);
    expect(localStorage.getItem("srs-web:working-copy")).toBeNull();
    expect((await loadWorkingCopy())?.tree).toEqual(TREE);
  });

  it("still restores a .srs archive copy saved before srs-web#816", async () => {
    setup();
    const bytes = new Uint8Array([9, 9]);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("srs-web", 1);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise((resolve) => {
      const r = db
        .transaction("working-copy", "readwrite")
        .objectStore("working-copy")
        .put({ name: "old", savedAt: new Date().toISOString(), bytes }, "current");
      r.onsuccess = resolve;
    });
    const entry = await loadWorkingCopy();
    expect(entry?.bytes).toEqual(bytes);
    expect(entry?.tree).toBeUndefined();
  });

  it("ignores a corrupt legacy entry", async () => {
    setup();
    localStorage.setItem("srs-web:working-copy", "not-json{{");
    expect(await loadWorkingCopy()).toBeNull();
  });
});

describe("workingCopyScheduler (srs-web#353, #769)", () => {
  afterEach(() => vi.useRealTimers());

  it("writes once, after writes go quiet", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const s = workingCopyScheduler(write, 1500, 15000);
    for (let i = 0; i < 5; i++) {
      s.schedule();
      vi.advanceTimersByTime(1000); // typing: never quiet for 1.5 s
    }
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(write).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30000);
    expect(write).toHaveBeenCalledOnce();
  });

  it("is not starved by a steady write stream (a background agent)", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const s = workingCopyScheduler(write, 1500, 15000);
    for (let t = 0; t < 31000; t += 100) {
      s.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("flush writes a pending copy now; cancel drops it", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const s = workingCopyScheduler(write, 1500, 15000);
    s.flush();
    expect(write).not.toHaveBeenCalled(); // nothing pending
    s.schedule();
    s.flush();
    expect(write).toHaveBeenCalledOnce();
    s.schedule();
    s.cancel();
    vi.advanceTimersByTime(30000);
    expect(write).toHaveBeenCalledOnce();
  });
});
