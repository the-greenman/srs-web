import { describe, expect, it } from "vitest";
import {
  MAX_RECENT,
  type RecentRepo,
  loadRecent,
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
