import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RECENT,
  type RecentRepo,
  loadRecent,
  saveRecent,
  recordOpened,
  removeRecent,
  toggleStar,
} from "../src/lib/recent-repos.js";

const gh = (n: number) => ({ kind: "github" as const, where: `o/r${n}:main:` });
const at = (n: number) => new Date(2026, 0, 1, 0, 0, n).toISOString();

describe("recent-repos", () => {
  it("lists the newest first and refreshes a repeat open without duplicating it", () => {
    let l: RecentRepo[] = [];
    l = recordOpened(l, gh(1), "o/r1", at(1));
    l = recordOpened(l, gh(2), "o/r2", at(2));
    l = recordOpened(l, gh(1), "o/r1", at(3));
    expect(l.map((r) => r.label)).toEqual(["o/r1", "o/r2"]);
  });

  it("puts starred first, keeps the star on reopen, and removes", () => {
    let l: RecentRepo[] = [];
    l = recordOpened(l, gh(1), "o/r1", at(1));
    l = recordOpened(l, gh(2), "o/r2", at(2));
    l = toggleStar(l, l.find((r) => r.label === "o/r1")?.key ?? "");
    expect(l.map((r) => r.label)).toEqual(["o/r1", "o/r2"]);
    l = recordOpened(l, gh(1), "o/r1", at(3));
    expect(l[0]?.starred).toBe(true);
    expect(removeRecent(l, l[0]?.key ?? "").map((r) => r.label)).toEqual(["o/r2"]);
  });

  it("caps the unstarred tail and never evicts a star", () => {
    let l = recordOpened([], gh(0), "o/r0", at(0));
    l = toggleStar(l, l[0]?.key ?? "");
    for (let i = 1; i <= MAX_RECENT + 5; i++) l = recordOpened(l, gh(i), `o/r${i}`, at(i));
    expect(l.filter((r) => !r.starred)).toHaveLength(MAX_RECENT);
    expect(l.some((r) => r.label === "o/r0" && r.starred)).toBe(true);
    expect(l.some((r) => r.label === "o/r1")).toBe(false);
  });

  it("loads an empty list when IndexedDB is unavailable", async () => {
    await expect(loadRecent()).resolves.toEqual([]);
  });
});

// In-memory IndexedDB stub: open/transaction/objectStore/put/get, settling on tx.oncomplete (or onabort).
function stubIndexedDB(opts: { abortWrites?: boolean } = {}) {
  const data = new Map<string, unknown>();
  vi.stubGlobal("indexedDB", {
    open() {
      const open: Record<string, unknown> = {};
      queueMicrotask(() => {
        const db = {
          createObjectStore() {},
          close() {},
          transaction() {
            const tx: Record<string, unknown> = {};
            const finish = (req: { result?: unknown }, fn: () => unknown) => {
              queueMicrotask(() => {
                if (opts.abortWrites) {
                  tx.error = new Error("quota");
                  (tx.onabort as () => void)?.();
                  return;
                }
                req.result = fn();
                (tx.oncomplete as () => void)?.();
              });
              return req;
            };
            tx.objectStore = () => ({
              put: (v: unknown, k: string) => finish({}, () => void data.set(k, v)),
              get: (k: string) => finish({}, () => data.get(k)),
            });
            return tx;
          },
        };
        open.result = db;
        (open.onupgradeneeded as () => void)?.();
        (open.onsuccess as () => void)?.();
      });
      return open;
    },
  });
  return data;
}

describe("recent-repos persistence", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips the list through IndexedDB", async () => {
    stubIndexedDB();
    const list = toggleStar(recordOpened([], gh(1), "o/r1", at(1)), "github:o/r1:main:");
    await saveRecent(list);
    expect(await loadRecent()).toEqual(list);
  });

  it("drops a malformed entry but keeps the rest", async () => {
    const data = stubIndexedDB();
    const good = recordOpened([], gh(1), "o/r1", at(1));
    data.set("repos", [
      ...good,
      { key: "x", label: "x", source: { kind: "github", where: "a/b:m:" } },
    ]);
    expect(await loadRecent()).toEqual(good);
  });

  it("does not throw when a write aborts", async () => {
    stubIndexedDB({ abortWrites: true });
    await expect(saveRecent(recordOpened([], gh(1), "o/r1", at(1)))).resolves.toBeUndefined();
  });
});
