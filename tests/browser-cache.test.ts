import { afterEach, describe, expect, it, vi } from "vitest";
import { clearWorkingCopy, loadWorkingCopy, saveWorkingCopy } from "../src/lib/browser-cache.js";

// ---------------------------------------------------------------------------
// localStorage mock — vi.stubGlobal provides a simple Map-backed implementation.
// ---------------------------------------------------------------------------

function makeLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}

let mockStorage: Storage;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  mockStorage = makeLocalStorageMock();
  vi.stubGlobal("localStorage", mockStorage);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("browser-cache", () => {
  it("round-trips name and srsj; savedAt is a valid ISO 8601 date", () => {
    setup();
    saveWorkingCopy("my-repo", '{"records":[]}');
    const entry = loadWorkingCopy();
    expect(entry).not.toBeNull();
    if (!entry) return;
    expect(entry.name).toBe("my-repo");
    expect(entry.srsj).toBe('{"records":[]}');
    expect(typeof entry.savedAt).toBe("string");
    expect(Number.isNaN(new Date(entry.savedAt).getTime())).toBe(false);
  });

  it("clearWorkingCopy causes loadWorkingCopy to return null", () => {
    setup();
    saveWorkingCopy("repo", "{}");
    clearWorkingCopy();
    expect(loadWorkingCopy()).toBeNull();
  });

  it("loadWorkingCopy returns null when storage is empty", () => {
    setup();
    expect(loadWorkingCopy()).toBeNull();
  });

  it("loadWorkingCopy returns null on corrupt JSON without throwing", () => {
    setup();
    mockStorage.setItem("srs-web:working-copy", "not-valid-json{{");
    expect(() => loadWorkingCopy()).not.toThrow();
    expect(loadWorkingCopy()).toBeNull();
  });

  it("saveWorkingCopy does not throw when localStorage.setItem throws QuotaExceededError", () => {
    setup();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(mockStorage, "setItem").mockImplementation(() => {
      const err = new DOMException("QuotaExceededError", "QuotaExceededError");
      throw err;
    });
    expect(() => saveWorkingCopy("repo", "{}")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith("autosave failed:", expect.any(DOMException));
  });
});
