// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Collection from "../src/lib/lens/Collection.svelte";
import type { CollectionData, Item } from "../src/lib/lens/lens-data.js";
import { groupItems } from "../src/lib/lens/lens-distinctions.js";

const ann = { kind: "human" as const, id: "u-ann", name: "Ann" };
const bot = { kind: "ai" as const, id: "a-bot", name: "Bot" };
const items: Item[] = [
  { id: "a", label: "Alpha", typeName: "claim", depth: 0, createdBy: ann, sectionContainerId: "s-a",
    record: { instanceId: "a", typeId: "t", typeVersion: 1, fieldValues: { kind: "x", scale: "group" } } },
  { id: "b", label: "Beta", typeName: "source", depth: 1, createdBy: bot,
    record: { instanceId: "b", typeId: "t", typeVersion: 1, fieldValues: { kind: "y" } } },
  { id: "c", label: "Gamma", typeName: "claim", depth: 0 },
];
const data = (xs: Item[], columns: CollectionData["columns"] = []): CollectionData => ({ items: xs, columns, total: xs.length });

describe("Collection", () => {
  it("group headings carry counts", () => {
    const { container } = render(Collection, { data: data(groupItems(items, "type")), by: "type", onSelect: () => {} });
    const heads = [...container.querySelectorAll('[data-testid="lens-group"]')].map((e) => e.textContent?.replace(/\s+/g, " ").trim());
    expect(heads).toEqual(["claim 2", "source 1"]);
  });

  it("None shows labels only", () => {
    const { container } = render(Collection, { data: data(groupItems(items, "none")), by: "none", onSelect: () => {} });
    expect(container.querySelectorAll('[data-testid="lens-group"]')).toHaveLength(0);
    expect(container.querySelectorAll(".lens-list__meta")).toHaveLength(0);
    expect(container.querySelectorAll(".actor-chip")).toHaveLength(0);
    expect([...container.querySelectorAll(".lens-list__label")].map((e) => e.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("Created by headings are ActorChips", () => {
    const { container } = render(Collection, { data: data(groupItems(items, "created-by")), by: "created-by", onSelect: () => {} });
    const heads = container.querySelectorAll('[data-testid="lens-group"]');
    expect(heads).toHaveLength(3);
    for (const h of heads) expect(h.querySelector(".actor-chip")).not.toBeNull();
    expect(heads[0].textContent).toContain("Ann");
    expect(heads[2].textContent).toContain("Unattributed");
  });

  it("expand toggle is an IconButton with a name", async () => {
    const onExpand = vi.fn();
    const { container, getByRole } = render(Collection, { data: data(items), by: "nesting", onExpand, onSelect: () => {} });
    const toggle = container.querySelector('[data-part="toggle"]') as HTMLButtonElement;
    expect(toggle.classList.contains("icon-btn")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(getByRole("button", { name: "Expand Alpha" })).toBe(toggle);
    await fireEvent.click(toggle);
    expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("table columns are the given ColumnSpec labels in order", () => {
    const columns: CollectionData["columns"] = [
      { kind: "field", fieldId: "f-2", fieldName: "scale", label: "Scale" },
      { kind: "field", fieldId: "f-1", fieldName: "kind", label: "Kind" },
      { kind: "field", fieldId: "f-3", fieldName: "empty", label: "Never filled" },
    ];
    const { container } = render(Collection, { data: data(items, columns), mode: "table", by: "nesting", onSelect: () => {} });
    const th = [...container.querySelectorAll("thead th")].map((e) => e.textContent?.trim());
    expect(th).toEqual(["", "Scale", "Kind"]);
    const first = [...container.querySelectorAll("tbody tr")[0].querySelectorAll("td")].map((e) => e.textContent?.trim());
    expect(first.slice(1)).toEqual(["group", "x"]);
  });
});
