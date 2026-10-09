// @vitest-environment happy-dom
/**
 * RelationGraph's focus view: an edge with a tone names it in its aria-label, its <title> and the legend's
 * line key; with no tone (Generic's map) the labels and legend are unchanged. The edge shows `edgeLabel`
 * while `data-relation` keeps the relation key.
 */
import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import RelationGraph from "../src/lib/generic/RelationGraph.svelte";
import { type MapNeighbour, focusLayout } from "../src/lib/generic/map-layout.js";

const focus = { id: "f", label: "Focus" };
const draw = (ns: MapNeighbour[]) => render(RelationGraph, { view: "focus", focus, layout: focusLayout(ns), onOpen: () => {} });
const node = (c: HTMLElement, id: string) => c.querySelector(`g.neighbour[data-direction][aria-label*="${id}"]`) as SVGGElement;

describe("RelationGraph tone", () => {
  it("names the tone in aria-label, <title> and a line key", () => {
    const { container, getByTestId } = draw([
      { id: "a", label: "Alpha", relationType: "depends-on", edgeLabel: "Depends on", direction: "out", tone: "inside" },
      { id: "b", label: "Beta", relationType: "depends-on", edgeLabel: "Depends on", direction: "out", tone: "leaving" },
    ]);
    const b = node(container, "Beta");
    expect(b.getAttribute("aria-label")).toBe("Outbound Depends on, leaving the set: Beta");
    expect(b.querySelector("title")?.textContent).toBe("Depends on, leaving the set (outbound): Beta");
    expect(b.getAttribute("data-relation")).toBe("depends-on");
    expect(b.getAttribute("data-tone")).toBe("leaving");
    expect(node(container, "Alpha").getAttribute("aria-label")).toBe("Outbound Depends on, inside the set: Alpha");
    expect(getByTestId("graph-legend").textContent).toContain("Depends on");
    const key = getByTestId("graph-tone-key");
    expect(key.textContent).toContain("Solid: inside the set");
    expect(key.textContent).toContain("Dashed: leaving the set");
    expect(key.querySelectorAll(".generic-graph-key-line")).toHaveLength(2);
  });

  it("with no tone (Generic map) labels and legend are unchanged", () => {
    const { container, getByTestId, queryByTestId } = draw([{ id: "a", label: "Alpha", relationType: "contains", direction: "in" }]);
    const a = node(container, "Alpha");
    expect(a.getAttribute("aria-label")).toBe("Inbound contains: Alpha");
    expect(a.querySelector("title")?.textContent).toBe("contains (inbound): Alpha");
    expect(a.hasAttribute("data-tone")).toBe(false);
    expect(getByTestId("graph-legend").textContent).toContain("contains");
    expect(queryByTestId("graph-tone-key")).toBeNull();
  });
});
