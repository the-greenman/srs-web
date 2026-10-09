import { describe, expect, it } from "vitest";
import { add, check, clear, commit, pending, readSet, removeSet, setKey, writeSet } from "../src/lib/lens/working-set";

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

describe("set model (one rule on every lens)", () => {
  const empty = { working: [], mySet: [] };

  it("check and uncheck change the draft only, never My set", () => {
    let s = check(empty, ["a", "b"], true);
    expect(s).toEqual({ working: ["a", "b"], mySet: [] });
    s = commit(s);
    expect(s).toEqual({ working: ["a", "b"], mySet: ["a", "b"] });
    // Unchecking on My set: the draft shrinks, My set waits for a commit.
    s = check(s, ["a"], false);
    expect(s).toEqual({ working: ["b"], mySet: ["a", "b"] });
    expect(pending(s)).toBe(true);
    expect(commit(s).mySet).toEqual(["b"]);
  });

  it("add is check on, with no duplicates, and leaves My set alone", () => {
    const s = add({ working: ["a"], mySet: ["a"] }, ["a", "c"]);
    expect(s).toEqual({ working: ["a", "c"], mySet: ["a"] });
    expect(pending(s)).toBe(true);
  });

  it("Clear selection drops the checks and keeps My set", () => {
    expect(clear({ working: ["a"], mySet: ["a", "b"] })).toEqual({ working: [], mySet: ["a", "b"] });
  });

  it("Remove My set deletes the shown set and keeps the checks", () => {
    expect(removeSet({ working: ["a"], mySet: ["a", "b"] })).toEqual({ working: ["a"], mySet: [] });
  });

  it("pending is false with nothing checked or when the checks already are My set", () => {
    expect(pending(empty)).toBe(false);
    expect(pending({ working: [], mySet: ["a"] })).toBe(false);
    expect(pending({ working: ["b", "a"], mySet: ["a", "b"] })).toBe(false);
    expect(pending({ working: ["a"], mySet: [] })).toBe(true);
  });
});
