import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWide, saveWide } from "../src/lib/wide";

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

describe("wide", () => {
  it("is off by default and round-trips under the legacy key", () => {
    expect(loadWide()).toBe(false);
    saveWide(true);
    expect(store.get("srs-web.margin")).toBe("expanded");
    expect(loadWide()).toBe(true);
    saveWide(false);
    expect(store.get("srs-web.margin")).toBe("compact");
    expect(loadWide()).toBe(false);
  });

  it("a legacy `expanded` value reads as on", () => {
    store.set("srs-web.margin", "expanded");
    expect(loadWide()).toBe(true);
  });

  it("survives storage throwing", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadWide()).toBe(false);
    expect(() => saveWide(true)).not.toThrow();
  });
});
