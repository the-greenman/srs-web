import { describe, expect, it } from "vitest";
import {
  countText,
  essayCounts,
  hiddenByAncestor,
  outsideRun,
  toggled,
  visibleEntries,
} from "../src/lib/essay/essay-model.js";

const e = (...xs: Array<[string, string?]>) =>
  xs.map(([instanceId, parentInstanceId]) => ({ instanceId, parentInstanceId }));
// a, b(b1(b2), b3), c — parents as the core's outline reports them
const list = e(["a"], ["b"], ["b1", "b"], ["b2", "b1"], ["b3", "b"], ["c"]);

describe("essay-model (presentation only)", () => {
  it("visibleEntries drops rows under a folded ancestor", () => {
    expect(visibleEntries(list, new Set(["b"])).map((x) => x.instanceId)).toEqual(["a", "b", "c"]);
    expect(visibleEntries(list, new Set(["b1"])).map((x) => x.instanceId)).toEqual([
      "a",
      "b",
      "b1",
      "b3",
      "c",
    ]);
    expect(visibleEntries(list, new Set()).length).toBe(6);
  });

  it("toggled adds / removes idempotently", () => {
    expect(toggled(["x"], "y", true)).toEqual(["x", "y"]);
    expect(toggled(["x", "y"], "y", true)).toEqual(["x", "y"]);
    expect(toggled(["x", "y"], "y", false)).toEqual(["x"]);
  });
});

describe("hiddenByAncestor", () => {
  it("hides the whole nested run beneath a hidden parent, not siblings", () => {
    expect([...hiddenByAncestor(list, new Set(["b"]))]).toEqual(["b1", "b2", "b3"]);
    expect([...hiddenByAncestor(list, new Set(["b1"]))]).toEqual(["b2"]);
  });
  it("a directly hidden child stays directly hidden; nothing inherited without a hidden parent", () => {
    expect(hiddenByAncestor(list, new Set())).toEqual(new Set());
    expect(hiddenByAncestor(list, new Set(["b", "b1"])).has("b1")).toBe(true);
  });
});

describe("outsideRun (drop-target filter over the core's runEnd)", () => {
  // a, b(b1), c with runEnd as get_container_outline reports it
  const o = [
    { instanceId: "a", depth: 0, hasChildren: false, runSize: 1, runEnd: 1 },
    { instanceId: "b", depth: 0, hasChildren: true, runSize: 2, runEnd: 3 },
    { instanceId: "b1", depth: 1, hasChildren: false, runSize: 1, runEnd: 3 },
    { instanceId: "c", depth: 0, hasChildren: false, runSize: 1, runEnd: 4 },
  ];
  it("refuses the dragged entry itself and its descendants, allows the rest", () => {
    expect(outsideRun(o, "b", "b")).toBe(false);
    expect(outsideRun(o, "b", "b1")).toBe(false);
    expect(outsideRun(o, "b", "c")).toBe(true);
    expect(outsideRun(o, "b1", "b")).toBe(true);
    expect(outsideRun(o, "zz", "a")).toBe(true); // dragged from another list
  });
  it("countText counts whitespace words and graphemes, spaces included", () => {
    expect(countText("")).toEqual({ words: 0, chars: 0 });
    expect(countText("  two\nwords  ")).toEqual({ words: 2, chars: 9 });
    expect(countText("café 👍🏽")).toEqual({ words: 2, chars: 6 });
  });
  it("essayCounts gives own counts, subtotals for paragraphs with children, and the essay total", () => {
    // a, b(b1(b2), b3), c as the core's outline reports it (runEnd is exclusive, in this list)
    const outline = [
      { instanceId: "a", depth: 0, hasChildren: false, runSize: 1, runEnd: 1 },
      { instanceId: "b", depth: 0, hasChildren: true, runSize: 4, runEnd: 5 },
      { instanceId: "b1", depth: 1, hasChildren: true, runSize: 2, runEnd: 4 },
      { instanceId: "b2", depth: 2, hasChildren: false, runSize: 1, runEnd: 4 },
      { instanceId: "b3", depth: 1, hasChildren: false, runSize: 1, runEnd: 5 },
      { instanceId: "c", depth: 0, hasChildren: false, runSize: 1, runEnd: 6 },
    ];
    const text: Record<string, string> = { a: "one", b: "two words", b1: "x y z", b2: "q", b3: "", c: "end" };
    const { own, subtotal, total } = essayCounts(outline, (id) => text[id]);
    expect(own.get("b")?.words).toBe(2);
    expect(subtotal.get("b")?.words).toBe(6); // b + b1 + b2 + b3
    expect(subtotal.get("b1")?.words).toBe(4);
    expect(subtotal.has("a")).toBe(false); // no children, no subtotal
    expect(total).toEqual({ words: 8, chars: 3 + 9 + 5 + 1 + 0 + 3 });
  });

});
