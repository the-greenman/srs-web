import { describe, expect, it } from "vitest";
import {
  indentDepth,
  insertPlan,
  movePlan,
  parentIds,
  stepPlan,
  toggled,
  visibleEntries,
} from "../src/lib/essay/essay-model.js";

const e = (...xs: Array<[string, number?]>) =>
  xs.map(([instanceId, depth]) => ({ instanceId, depth }));
// a, b(b1, b2), c   (b1/b2 nested under b)
const list = e(["a"], ["b"], ["b1", 1], ["b2", 1], ["c"]);

describe("essay-model", () => {
  it("insertPlan before / after (past the run) / into / append", () => {
    expect(insertPlan(list, "b", "before")).toEqual({ position: 1, depth: 0 });
    expect(insertPlan(list, "b", "after")).toEqual({ position: 4, depth: 0 });
    expect(insertPlan(list, "b", "into")).toEqual({ position: 2, depth: 1 });
    expect(insertPlan(list, null, "after")).toEqual({ position: 5, depth: 0 });
    expect(insertPlan(list, "zz", "after")).toBeNull();
  });

  it("movePlan positions are against the list without the moved run", () => {
    // drag the group b (3 entries) before a -> position 0
    expect(movePlan(list, "b", "a", "before")).toEqual({ position: 0, depth: 0 });
    // drag a after c: rest = b b1 b2 c -> after c = 4
    expect(movePlan(list, "a", "c", "after")).toEqual({ position: 4, depth: 0 });
    // drag c into a: rest = a b b1 b2 -> position 1, depth 1
    expect(movePlan(list, "c", "a", "into")).toEqual({ position: 1, depth: 1 });
  });

  it("refuses to drop a group onto itself or its own descendant", () => {
    expect(movePlan(list, "b", "b", "after")).toBeNull();
    expect(movePlan(list, "b", "b1", "after")).toBeNull();
  });

  it("stepPlan swaps with the neighbouring sibling, never crossing a parent", () => {
    expect(stepPlan(list, "a", "down")).toEqual({ position: 3, depth: 0 }); // after group b
    expect(stepPlan(list, "c", "up")).toEqual({ position: 1, depth: 0 }); // before group b
    expect(stepPlan(list, "a", "up")).toBeNull();
    expect(stepPlan(list, "b1", "up")).toBeNull(); // parent is above, not a sibling
    expect(stepPlan(list, "b2", "up")).toEqual({ position: 2, depth: 1 });
    expect(stepPlan(list, "c", "down")).toBeNull();
  });

  it("indentDepth clamps to previous depth + 1 and floors at 0", () => {
    expect(indentDepth(list, "a", 1)).toBeNull(); // first entry cannot nest
    expect(indentDepth(list, "b", 1)).toBe(1);
  });

  it("indentDepth allows one level under a nested previous entry", () => {
    expect(indentDepth(list, "b2", 1)).toBe(2);
    expect(indentDepth(list, "b2", -1)).toBe(0);
    expect(indentDepth(list, "c", -1)).toBeNull();
  });

  it("parentIds and visibleEntries follow depth", () => {
    expect([...parentIds(list)]).toEqual(["b"]);
    expect(visibleEntries(list, new Set(["b"])).map((x) => x.instanceId)).toEqual(["a", "b", "c"]);
    expect(visibleEntries(list, new Set()).length).toBe(5);
  });

  it("toggled adds / removes idempotently", () => {
    expect(toggled(["x"], "y", true)).toEqual(["x", "y"]);
    expect(toggled(["x", "y"], "y", true)).toEqual(["x", "y"]);
    expect(toggled(["x", "y"], "y", false)).toEqual(["x"]);
  });
});

import { hiddenByAncestor } from "../src/lib/essay/essay-model.js";
describe("hiddenByAncestor", () => {
  const l = e(["a"], ["b"], ["b1", 1], ["b2", 2], ["b3", 1], ["c"]);
  it("hides the whole nested run beneath a hidden parent, not siblings", () => {
    expect([...hiddenByAncestor(l, new Set(["b"]))]).toEqual(["b1", "b2", "b3"]);
    expect([...hiddenByAncestor(l, new Set(["b1"]))]).toEqual(["b2"]);
  });
  it("a directly hidden child stays directly hidden; nothing inherited without a hidden parent", () => {
    expect(hiddenByAncestor(l, new Set())).toEqual(new Set());
    expect(hiddenByAncestor(l, new Set(["b", "b1"])).has("b1")).toBe(true);
  });
});
