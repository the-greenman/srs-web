// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Context from "../src/lib/lens/Context.svelte";
import ContextGroup from "../src/lib/lens/ContextGroup.svelte";
import { type ContextGroupData, type ContextItem, NEIGHBOUR_PAGE } from "../src/lib/lens/lens-data.js";

const edge = (id: string, direction: "in" | "out" = "out"): ContextItem => ({
  id,
  label: `Record ${id}`,
  typeName: "claim",
  direction,
  relationType: "rel",
});
const group = (label: string, items: ContextItem[]): ContextGroupData => ({
  def: { label, relationType: "rel", direction: "out" },
  total: items.length,
  items,
});
const labels = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-testid="lens-context-group"]')].map((e) => e.getAttribute("data-label"));

describe("Context", () => {
  it("empty groups hidden", () => {
    const { container } = render(Context, {
      groups: [group("Depends on", [edge("a")]), group("Refines", [])],
      onPick: () => {},
    });
    expect(labels(container)).toEqual(["Depends on"]);
  });

  it("inside/outside shows both groups", () => {
    const { container } = render(Context, {
      groups: [group("Inside this set", [edge("a")]), group("Leaving this set", [edge("b", "in"), edge("c")])],
      by: "boundary",
      onPick: () => {},
    });
    expect(labels(container)).toEqual(["Inside this set", "Leaving this set"]);
    expect(container.querySelector('[data-direction="in"]')?.textContent).toContain("links here");
  });

  it("Shown in lists only the given compositions", () => {
    const shown = [{ compositionId: "v1", containerId: "c1", label: "Articles and roles" }];
    const { container } = render(Context, {
      groups: [group("Depends on", [edge("a")])],
      containers: [{ containerId: "c1", title: "Articles" }, { containerId: "c2", title: "Limoma" }],
      shown,
      onPick: () => {},
    });
    expect([...container.querySelectorAll('[data-testid="lens-shown-in"]')].map((e) => e.textContent)).toEqual([
      "Articles and roles",
    ]);
    const none = render(Context, { groups: [group("Depends on", [edge("a")])], containers: [{ containerId: "c1", title: "A" }], onPick: () => {} });
    expect(none.container.querySelector('[data-testid="lens-shown-in"]')).toBeNull();
  });

  it("Show more reveals the next NEIGHBOUR_PAGE of a 41-item group", async () => {
    const items = Array.from({ length: 41 }, (_, i) => edge(`n${i}`));
    const { container } = render(ContextGroup, { label: "Contains", total: 41, items, onPick: () => {} });
    const rows = () => container.querySelectorAll('[data-testid="lens-context-item"]').length;
    const more = () => container.querySelector('[data-testid="lens-context-more"]') as HTMLButtonElement | null;
    expect(rows()).toBe(NEIGHBOUR_PAGE);
    await fireEvent.click(more() as HTMLButtonElement);
    expect(rows()).toBe(2 * NEIGHBOUR_PAGE);
    expect(more()?.textContent).toBe("Show 1 more");
    await fireEvent.click(more() as HTMLButtonElement);
    expect(rows()).toBe(41);
    expect(more()).toBeNull();
  });
});
