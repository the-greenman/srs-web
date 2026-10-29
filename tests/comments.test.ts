import { expect, it } from "vitest";
import { groupRuns } from "../src/lib/comments";
import type { Comment } from "../src/lib/comments";
import { relativeTime } from "../src/lib/relative-time";

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
  expect(relativeTime(ago(5_000), now)).toBe("just now");
  expect(relativeTime(ago(20_000), now)).toBe("20s ago");
  expect(relativeTime(0, 120000)).toBe("2 min ago"); // epoch ms, as the agent feed passes
  expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
  expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
  expect(relativeTime(ago(30 * 3_600_000), now)).toBe(
    new Date(now - 30 * 3_600_000).toLocaleDateString()
  );
  expect(relativeTime("", now)).toBe("");
  expect(relativeTime("nonsense", now)).toBe("");
});

it("taskState: the latest settling response wins, withdrawn reopens, the text is the reason", async () => {
  const { taskState } = await import("../src/lib/comments");
  const r = (kind: string, createdAt: string, text = kind): Comment => ({
    id: kind + createdAt,
    text,
    createdAt,
    kind,
  });
  expect(taskState([])).toEqual({ state: "open" });
  expect(taskState([r("done", "1")]).state).toBe("done");
  expect(taskState([r("rejected", "1", "out of scope")])).toMatchObject({
    state: "rejected",
    reason: "out of scope",
  });
  expect(taskState([r("done", "1"), r("withdrawn", "2")]).state).toBe("open");
  expect(taskState([r("withdrawn", "1"), r("rejected", "2")]).state).toBe("rejected");
  expect(taskState([r("agree", "3"), r("done", "1")]).state).toBe("done");
  expect(taskState([r("done", "1")]).reason).toBeUndefined();
});

it("taskState orders by time, not by string: a Z stamp and an offset stamp in the same second", async () => {
  const { taskState, byTime } = await import("../src/lib/comments");
  const done: Comment = { id: "d", text: "done", createdAt: "2026-10-29T10:00:03Z", kind: "done" };
  const reopen: Comment = { id: "w", text: "withdrawn", createdAt: "2026-10-29T10:00:03.5+00:00", kind: "withdrawn" };
  expect(taskState([done, reopen]).state).toBe("open");
  expect(taskState([reopen, done]).state).toBe("open");
  expect(byTime("2026-10-29T10:00:03Z", "2026-10-29T10:00:03.5+00:00")).toBeLessThan(0);
});

it("kindsIn needs the SemanticOps comment at v2 (v1 has no kind)", async () => {
  const { kindsIn } = await import("../src/lib/comments");
  const SO = "11cd0a5f-8c3f-4ec2-a055-5b9f56c5b0bc";
  expect(kindsIn([{ id: SO, version: 1 }])).toBe(false);
  expect(kindsIn([{ id: SO, version: 1 }, { id: SO, version: 2 }])).toBe(true);
  expect(kindsIn([])).toBe(false);
});
