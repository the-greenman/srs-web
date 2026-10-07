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

const BYTES = new Uint8Array([1, 2, 3]);

describe("browser-cache (.srs archive in IndexedDB, srs-web#505)", () => {
  it("round-trips name and archive bytes; savedAt is ISO 8601", async () => {
    setup();
    expect(await saveWorkingCopy("my-repo", () => BYTES)).toBe(true);
    const entry = await loadWorkingCopy();
    expect(entry?.name).toBe("my-repo");
    expect(entry?.bytes).toEqual(BYTES);
    expect(Number.isNaN(new Date(entry?.savedAt ?? "").getTime())).toBe(false);
  });

  it("clearWorkingCopy empties it; load returns null when nothing is stored", async () => {
    setup();
    expect(await loadWorkingCopy()).toBeNull();
    await saveWorkingCopy("repo", () => BYTES);
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
    expect(await saveWorkingCopy("repo", () => BYTES)).toBe(false);
    expect(await loadWorkingCopy()).toBeNull();
    await expect(clearWorkingCopy()).resolves.toBeUndefined();
  });

  it("migrates a legacy localStorage .srsj entry, and a successful save removes it", async () => {
    setup();
    const legacy = { name: "old", srsj: "{}", savedAt: new Date().toISOString() };
    localStorage.setItem("srs-web:working-copy", JSON.stringify(legacy));
    expect(await loadWorkingCopy()).toEqual(legacy);
    await saveWorkingCopy("old", () => BYTES);
    expect(localStorage.getItem("srs-web:working-copy")).toBeNull();
    expect((await loadWorkingCopy())?.bytes).toEqual(BYTES);
  });

  it("ignores a corrupt legacy entry", async () => {
    setup();
    localStorage.setItem("srs-web:working-copy", "not-json{{");
    expect(await loadWorkingCopy()).toBeNull();
  });
});

describe("workingCopyScheduler (srs-web#353)", () => {
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst into one write at the end of the window", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const s = workingCopyScheduler(write, 2000);
    for (let i = 0; i < 5; i++) s.schedule();
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(write).toHaveBeenCalledOnce();
  });

  it("is not starved by a steady write stream (a background agent)", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const s = workingCopyScheduler(write, 2000);
    for (let t = 0; t < 6000; t += 100) {
      s.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("flush writes a pending copy now; cancel drops it", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const s = workingCopyScheduler(write, 2000);
    s.flush();
    expect(write).not.toHaveBeenCalled(); // nothing pending
    s.schedule();
    s.flush();
    expect(write).toHaveBeenCalledOnce();
    s.schedule();
    s.cancel();
    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledOnce();
  });
});
