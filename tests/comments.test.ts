import { expect, it } from "vitest";
import { groupRuns, relativeTime } from "../src/lib/comments";
import type { Comment } from "../src/lib/comments";

const c = (id: string, authorId?: string): Comment => ({
  id,
  text: id,
  createdAt: "",
  author: authorId ? { kind: "ai", id: authorId } : undefined,
});

it("groups consecutive comments by actor id, and consecutive unattributed ones", () => {
  const runs = groupRuns([c("1", "a"), c("2", "a"), c("3", "b"), c("4"), c("5"), c("6", "a")]);
  expect(runs.map((r) => r.map((x) => x.id))).toEqual([["1", "2"], ["3"], ["4", "5"], ["6"]]);
  expect(groupRuns([])).toEqual([]);
});

it("relativeTime buckets: just now, minutes, hours, then a date; empty when there is no time", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  expect(relativeTime(ago(20_000), now)).toBe("just now");
  expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
  expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
  expect(relativeTime(ago(30 * 3_600_000), now)).toBe(
    new Date(now - 30 * 3_600_000).toLocaleDateString()
  );
  expect(relativeTime("", now)).toBe("");
  expect(relativeTime("nonsense", now)).toBe("");
});
