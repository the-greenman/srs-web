import { describe, expect, it } from "vitest";
import type { Item } from "../src/lib/lens/lens-data";
import { NOT_SET, groupItems, skipHubs, splitByBoundary } from "../src/lib/lens/lens-distinctions";

const rec = (id: string, fieldValues: Record<string, unknown>) => ({
  instanceId: id,
  typeId: "t",
  typeVersion: 1,
  displayLabel: id,
  fieldValues,
});
const items: Item[] = [
  {
    id: "a",
    label: "A",
    typeName: "claim",
    depth: 0,
    group: "Part 1",
    record: rec("a", { kind: "mechanism" }),
  },
  {
    id: "b",
    label: "B",
    typeName: "source",
    depth: 1,
    group: "Part 1",
    record: rec("b", { kind: "stance" }),
  },
  { id: "c", label: "C", typeName: "claim", depth: 1, group: "Part 2", record: rec("c", {}) },
  {
    id: "d",
    label: "D",
    typeName: "claim",
    depth: 0,
    group: "Part 2",
    record: rec("d", { kind: "mechanism" }),
  },
];
const groups = (xs: Item[]) => xs.map((i) => `${i.group}:${i.id}`);

describe("lens distinctions", () => {
  it("nothing: flat, no groups, no depth", () => {
    const out = groupItems(items, "nothing");
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(out.every((i) => i.group === undefined && i.depth === 0)).toBe(true);
  });

  it("type: groups in order of first appearance", () => {
    expect(groups(groupItems(items, "type"))).toEqual([
      "claim:a",
      "claim:c",
      "claim:d",
      "source:b",
    ]);
  });

  it("select field: a missing value groups under Not set, last", () => {
    expect(groups(groupItems(items, "field:kind"))).toEqual([
      "mechanism:a",
      "mechanism:d",
      "stance:b",
      `${NOT_SET}:c`,
    ]);
  });

  it("inside or outside the set", () => {
    const edges = [{ id: "a" }, { id: "x" }, { id: "d" }, { id: "y" }];
    const { inside, outside } = splitByBoundary(edges, new Set(items.map((i) => i.id)));
    expect(inside.map((e) => e.id)).toEqual(["a", "d"]);
    expect(outside.map((e) => e.id)).toEqual(["x", "y"]);
  });

  it("skipHubs: records with more than 50 links are skipped, the rest added", () => {
    const links: Record<string, number> = { a: 3, owner: 495, b: 50 };
    const { add, skipped } = skipHubs(
      [{ id: "a" }, { id: "owner" }, { id: "b" }],
      (id) => links[id]
    );
    expect(add.map((i) => i.id)).toEqual(["a", "b"]);
    expect(skipped.map((i) => i.id)).toEqual(["owner"]);
  });
});
