import { describe, expect, it } from "vitest";
import { plainLabel, wrapLabel } from "../src/lib/generic/labels.js";
import { CONTAINER_NODE_CAP, containerGraph, focusLayout } from "../src/lib/generic/map-layout.js";
import { NOTES, typeGroups } from "../src/lib/generic/records-model.js";

describe("typeGroups", () => {
  it("lists non-empty types by count then name, with the type's name and namespace, and Notes last", () => {
    const groups = typeGroups({
      byType: [
        { value: "ns/b", typeId: "tb", count: 5 },
        { value: "ns/a", typeId: "ta", count: 5 },
        { value: "ns/empty", typeId: "te", count: 0 },
        { value: "ns/big", typeId: "tbig", count: 90 },
      ],
      otherTypes: 0,
      notes: 27,
    });
    expect(groups.map((g) => g.name)).toEqual(["big", "a", "b", "Notes"]);
    expect(groups[0]).toMatchObject({ key: "tbig", namespace: "ns", count: 90 });
    expect(groups[3]).toMatchObject({ key: NOTES, count: 27 });
  });

  it("has no Notes group without notes", () => {
    expect(typeGroups({ byType: [], otherTypes: 0, notes: 0 })).toEqual([]);
  });
});

describe("labels", () => {
  it("strips backticks for display", () => {
    expect(plainLabel("Manifest extensions (`ext:slices`)")).toBe("Manifest extensions (ext:slices)");
    expect(plainLabel(undefined, "abc")).toBe("abc");
  });

  it("wraps to two lines and ellipsizes what is left", () => {
    expect(wrapLabel("Short")).toEqual(["Short"]);
    expect(wrapLabel("Quiet removal of humans from the loop")).toEqual(["Quiet removal of", "humans from the…"]);
    expect(wrapLabel("Supercalifragilisticexpialidocious")).toHaveLength(2);
  });
});

describe("focusLayout", () => {
  const n = (id: string, direction: "in" | "out", relationType: string) => ({ id, label: id, direction, relationType });

  it("puts inbound on the left, outbound on the right, and groups by relation type", () => {
    const { placed, center, legend } = focusLayout([
      n("a", "out", "z"),
      n("b", "in", "x"),
      n("c", "out", "a"),
      n("d", "in", "x"),
    ]);
    expect(placed.filter((p) => p.direction === "in").every((p) => p.x < center.x)).toBe(true);
    expect(placed.filter((p) => p.direction === "out").every((p) => p.x > center.x)).toBe(true);
    expect(placed.filter((p) => p.direction === "out").map((p) => p.id)).toEqual(["c", "a"]);
    expect(legend).toEqual([
      { relationType: "x", direction: "in", count: 2 },
      { relationType: "a", direction: "out", count: 1 },
      { relationType: "z", direction: "out", count: 1 },
    ]);
  });

  it("spaces a side's nodes at least 30 units apart at 12 neighbours", () => {
    const { placed } = focusLayout(Array.from({ length: 12 }, (_, i) => n(`o${i}`, "out", "contains")));
    const ys = placed.map((p) => p.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(30);
  });
});

describe("containerGraph", () => {
  it("caps at 24 nodes keeping the best connected, and reports the total", () => {
    const edges = Array.from({ length: 40 }, (_, i) => ({
      relationId: `r${i}`,
      relationType: "contains",
      source: "hub",
      target: `leaf${i}`,
    }));
    const g = containerGraph(edges, (id) => id);
    expect(g.nodes).toHaveLength(CONTAINER_NODE_CAP);
    expect(g.totalNodes).toBe(41);
    expect(g.nodes.some((x) => x.id === "hub")).toBe(true);
    expect(g.edges).toHaveLength(CONTAINER_NODE_CAP - 1);
  });

  it("draws everything under the cap", () => {
    const g = containerGraph([{ relationId: "r", relationType: "t", source: "a", target: "b" }], (id) => id);
    expect(g.nodes).toHaveLength(2);
    expect(g.totalNodes).toBe(2);
  });
});
