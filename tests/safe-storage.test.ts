import { describe, expect, it, vi } from "vitest";
import { safeStorage } from "../src/lib/safe-storage";

describe("safeStorage (srs-web#828)", () => {
  it("returns undefined, not a throw, when reading window.localStorage throws", () => {
    vi.stubGlobal("localStorage", undefined);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(safeStorage()).toBeUndefined();
  });

  it("returns the storage when available", () => {
    const s = { getItem: () => null, setItem: () => {} };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: s });
    expect(safeStorage()).toBe(s);
  });
});
