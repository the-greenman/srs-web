import { describe, expect, it } from "vitest";
import { readSet, setKey, writeSet } from "../src/lib/lens/working-set";

/** An in-memory Storage. */
function memory(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  } as unknown as Storage;
}
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("working set", () => {
  it("round-trips ids under srs-web.lens-set.<id>", () => {
    const store = memory();
    writeSet("repo-1", ["a", "b"], store);
    expect(setKey("repo-1")).toBe("srs-web.lens-set.repo-1");
    expect(store.getItem("srs-web.lens-set.repo-1")).toBe('["a","b"]');
    expect(readSet("repo-1", store)).toEqual(["a", "b"]);
    expect(readSet("repo-2", store)).toEqual([]);
    writeSet("repo-1", [], store);
    expect(store.getItem("srs-web.lens-set.repo-1")).toBeNull();
  });

  it("readSet returns [] when storage throws", () => {
    expect(readSet("repo-1", throwing)).toEqual([]);
    // No storage argument and no usable localStorage (node): still [].
    expect(readSet("repo-1")).toEqual([]);
  });

  it("writeSet does not throw when storage throws", () => {
    expect(() => writeSet("repo-1", ["a"], throwing)).not.toThrow();
    expect(() => writeSet("repo-1", [], throwing)).not.toThrow();
  });

  it("readSet returns [] for junk", () => {
    const store = memory();
    for (const junk of ["{", '{"a":1}', "42", "null"]) {
      store.setItem(setKey("repo-1"), junk);
      expect(readSet("repo-1", store)).toEqual([]);
    }
    store.setItem(setKey("repo-1"), '["a", 3, null, "b"]');
    expect(readSet("repo-1", store)).toEqual(["a", "b"]);
  });
});
