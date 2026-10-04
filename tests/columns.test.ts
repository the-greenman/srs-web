import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampColumn, loadColumns, saveColumns } from "../src/lib/columns";

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("columns", () => {
  it("defaults when nothing is stored", () => {
    expect(loadColumns()).toEqual({ nav: 264, inspector: 320 });
  });

  it("round-trips", () => {
    saveColumns({ nav: 300, inspector: 400 });
    expect(loadColumns()).toEqual({ nav: 300, inspector: 400 });
  });

  it("clamps an out-of-range stored value", () => {
    saveColumns({ nav: 10, inspector: 5000 });
    expect(loadColumns()).toEqual({ nav: 192, inspector: 640 });
    expect(clampColumn("nav", 9999)).toBe(384);
    expect(clampColumn("inspector", 0)).toBe(224);
  });

  it("falls back to defaults when storage throws or holds junk", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadColumns()).toEqual({ nav: 264, inspector: 320 });
    vi.restoreAllMocks();
    store.set("srs-web.columns", "{not json");
    expect(loadColumns()).toEqual({ nav: 264, inspector: 320 });
  });

  it("does not throw when saving fails", () => {
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => saveColumns({ nav: 250, inspector: 300 })).not.toThrow();
  });
});
