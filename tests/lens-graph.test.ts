import { describe, expect, it } from "vitest";
import { type ContextItem, contextGroups, graphEdges } from "../src/lib/lens/lens-data";
import type { RelationTypeInfo } from "../src/lib/srs-client";

// Synthetic edges and installed types; relation keys are opaque strings here.
const types = [
  { key: "needs", label: "Needs" },
  { key: "cites", label: "Cites", inverseType: "cited-by" },
  { key: "cited-by", label: "Cited by" },
] as unknown as RelationTypeInfo[];
const edge = (id: string, label: string, direction: "in" | "out", relationType: string): ContextItem => ({
  id,
  label,
  direction,
  relationType,
});
const edges = [
  edge("a", "Field", "out", "needs"),
  edge("b", "Type", "out", "needs"),
  edge("c", "Glossary", "in", "needs"),
  edge("d", "Paper", "in", "cites"),
];
const inSet = new Set(["a", "c"]);

describe("lens graph", () => {
  it("edge labels reuse the Context group label for that relation and direction", () => {
    const groups = contextGroups(edges, "link-type", inSet, types);
    const byId = new Map(graphEdges(groups, edges, inSet).map((e) => [e.id, e.edgeLabel]));
    for (const g of groups) for (const e of g.items) expect(byId.get(e.id)).toBe(g.def.label);
    expect(byId.get("a")).toBe("Needs");
    expect(byId.get("c")).toBe("Needs this");
    expect(byId.get("d")).toBe("Cited by");
  });

  it("graph nodes keep the neighbour's name", () => {
    const groups = contextGroups(edges, "link-type", inSet, types);
    const out = graphEdges(groups, edges, inSet);
    expect(out.map((e) => e.label).sort()).toEqual(["Field", "Glossary", "Paper", "Type"]);
    expect(out.every((e) => e.label !== e.edgeLabel)).toBe(true);
  });

  it("under inside/outside, edges are relabelled by set membership", () => {
    const out = graphEdges(contextGroups(edges, "boundary", inSet, types), edges, inSet);
    const label = new Map(out.map((e) => [e.id, e.edgeLabel]));
    expect(label.get("a")).toBe("Inside this set");
    expect(label.get("c")).toBe("Inside this set");
    expect(label.get("b")).toBe("Leaving this set");
    expect(label.get("d")).toBe("Leaving this set");
    // Every distinction tells edges apart inside vs leaving (the default colouring).
    for (const by of ["link-type", "none", "boundary"] as const)
      for (const e of graphEdges(contextGroups(edges, by, inSet, types), edges, inSet))
        expect(e.leaves).toBe(!inSet.has(e.id));
  });

  it("graph never blank for a record with links", () => {
    const out = graphEdges([], edges, inSet);
    expect(out).toHaveLength(edges.length);
    expect(out.find((e) => e.id === "a")).toMatchObject({ label: "Field", edgeLabel: "Needs", leaves: false });
    expect(graphEdges([], [], inSet)).toEqual([]);
  });
});
