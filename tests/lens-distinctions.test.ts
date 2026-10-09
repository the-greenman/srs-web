import { describe, expect, it } from "vitest";
import type { Item } from "../src/lib/lens/lens-data";
import {
  HUB_LINKS,
  NOT_SET,
  collectionOptions,
  groupItems,
  skipHubs,
  splitByBoundary,
} from "../src/lib/lens/lens-distinctions";

const rec = (id: string, fieldValues: Record<string, unknown>) => ({
  instanceId: id,
  typeId: "t",
  typeVersion: 1,
  displayLabel: id,
  fieldValues,
});
const human = { kind: "human" as const, id: "u-1", name: "Ann" };
const ai = { kind: "ai" as const, id: "a-1" };
const items: Item[] = [
  { id: "a", label: "A", typeName: "claim", lifecycle: "draft", createdBy: human, depth: 0, group: "Part 1", record: rec("a", { kind: "mechanism" }) },
  { id: "b", label: "B", typeName: "source", lifecycle: "active", createdBy: ai, depth: 1, group: "Part 1", record: rec("b", { kind: "stance" }) },
  { id: "c", label: "C", typeName: "claim", depth: 1, group: "Part 2", record: rec("c", {}) },
  { id: "d", label: "D", typeName: "claim", lifecycle: "draft", createdBy: human, depth: 0, group: "Part 2", record: rec("d", { kind: "mechanism" }) },
];
const groups = (xs: Item[]) => xs.map((i) => `${i.group}:${i.id}`);

describe("lens distinctions", () => {
  it("none: flat, no groups, no depth", () => {
    const out = groupItems(items, "none");
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(out.every((i) => i.group === undefined && i.depth === 0)).toBe(true);
  });

  it("nesting keeps the loader's sections and depth", () => {
    expect(groupItems(items, "nesting")).toBe(items);
  });

  it("type: groups in order of first appearance", () => {
    expect(groups(groupItems(items, "type"))).toEqual(["claim:a", "claim:c", "claim:d", "source:b"]);
  });

  it("state: a missing value groups under Not set, last", () => {
    expect(groups(groupItems(items, "state"))).toEqual(["draft:a", "draft:d", "active:b", `${NOT_SET}:c`]);
  });

  it("container: a member in several containers appears under each", () => {
    const of: Record<string, string[]> = { a: ["x", "y"], b: ["y"], c: [], d: ["x"] };
    expect(groups(groupItems(items, "container", { containersOf: (id) => of[id] }))).toEqual([
      "x:a",
      "x:d",
      "y:a",
      "y:b",
      `${NOT_SET}:c`,
    ]);
  });

  it("created-by groups by actor id", () => {
    expect(groups(groupItems(items, "created-by"))).toEqual(["u-1:a", "u-1:d", "a-1:b", `${NOT_SET}:c`]);
  });

  it("a field:<fieldId> value falls back to the kind default", () => {
    const by = "field:00000000-0000-4000-8000-000000000001" as const;
    expect(groups(groupItems(items, by))).toEqual(groups(groupItems(items, "type")));
    expect(groupItems(items, by, { kindDefault: "nesting" })).toBe(items);
  });

  it("splitByBoundary is the one edge-to-set classifier", () => {
    const edges = [{ id: "a" }, { id: "x" }, { id: "d" }, { id: "y" }, { id: "a" }];
    const { inside, outside } = splitByBoundary(edges, new Set(items.map((i) => i.id)));
    expect(inside.map((e) => e.id)).toEqual(["a", "d", "a"]);
    expect(outside.map((e) => e.id)).toEqual(["x", "y"]);
    expect(inside.length + outside.length).toBe(edges.length);
  });

  it("skipHubs: records above HUB_LINKS are skipped, at HUB_LINKS added", () => {
    expect(HUB_LINKS).toBe(50);
    const links: Record<string, number> = { a: 3, owner: 495, b: HUB_LINKS, c: HUB_LINKS + 1 };
    const { add, skipped } = skipHubs([{ id: "a" }, { id: "owner" }, { id: "b" }, { id: "c" }], (id) => links[id]);
    expect(add.map((i) => i.id)).toEqual(["a", "b"]);
    expect(skipped.map((i) => i.id)).toEqual(["owner", "c"]);
  });

  it("collectionOptions: Nesting only for outlines, State and Created by only when present, never a field option", () => {
    const values = (xs: Item[], outline: boolean) => collectionOptions(xs, outline).map((o) => o.value);
    expect(values(items, true)).toEqual(["none", "type", "nesting", "container", "state", "created-by"]);
    expect(values(items, false)).toEqual(["none", "type", "container", "state", "created-by"]);
    const bare = items.map((i) => ({ ...i, lifecycle: undefined, createdBy: undefined }));
    expect(values(bare, false)).toEqual(["none", "type", "container"]);
    expect(collectionOptions(items, true).some((o) => o.value.startsWith("field:"))).toBe(false);
  });
});
