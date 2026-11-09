import { describe, expect, it } from "vitest";
import {
  type NavTreeNode,
  ancestorsOf,
  filterOptions,
  keyNavigate,
  loadExpanded,
  saveExpanded,
  visibleRows,
} from "../src/lib/nav-tree";

const nodes: NavTreeNode[] = [
  { id: "a", label: "Articles", parentId: null },
  { id: "a1", label: "Intro", parentId: "a" },
  { id: "a2", label: "Method", parentId: "a" },
  { id: "a2x", label: "Deep note", parentId: "a2" },
  { id: "b", label: "Roles", parentId: null, lazy: true },
];
const ids = (rows: { node: { id: string } }[]) => rows.map((r) => r.node.id);

describe("visibleRows", () => {
  it("shows only roots when nothing is expanded", () => {
    expect(ids(visibleRows(nodes, new Set()))).toEqual(["a", "b"]);
  });
  it("shows children of expanded nodes with their level", () => {
    const rows = visibleRows(nodes, new Set(["a", "a2"]));
    expect(ids(rows)).toEqual(["a", "a1", "a2", "a2x", "b"]);
    expect(rows.map((r) => r.level)).toEqual([0, 1, 1, 2, 0]);
  });
  it("treats a lazy node as expandable with no children yet", () => {
    const row = visibleRows(nodes, new Set()).find((r) => r.node.id === "b");
    expect(row?.expandable).toBe(true);
    expect(row?.expanded).toBe(false);
  });
  it("filter keeps matches and auto-expands their ancestors", () => {
    const rows = visibleRows(nodes, new Set(), "deep");
    expect(ids(rows)).toEqual(["a", "a2", "a2x"]);
    expect(rows.filter((r) => r.expandable).every((r) => r.expanded)).toBe(true);
  });
  it("blank filter is no filter", () => {
    expect(ids(visibleRows(nodes, new Set(), "  "))).toEqual(["a", "b"]);
  });
});

describe("ancestorsOf", () => {
  it("lists nearest first and survives a cycle", () => {
    expect(ancestorsOf(nodes, "a2x")).toEqual(["a2", "a"]);
    const cyc: NavTreeNode[] = [
      { id: "x", label: "x", parentId: "y" },
      { id: "y", label: "y", parentId: "x" },
    ];
    expect(ancestorsOf(cyc, "x")).toEqual(["y"]);
  });
});

describe("keyNavigate", () => {
  const rows = visibleRows(nodes, new Set(["a"]));
  it("moves down, up, home, end, clamped", () => {
    expect(keyNavigate(rows, "a", "ArrowDown").focus).toBe("a1");
    expect(keyNavigate(rows, "a", "ArrowUp").focus).toBe("a");
    expect(keyNavigate(rows, "a1", "End").focus).toBe("b");
    expect(keyNavigate(rows, "b", "ArrowDown").focus).toBe("b");
    expect(keyNavigate(rows, "b", "Home").focus).toBe("a");
  });
  it("right opens, then enters; left closes, then goes to the parent", () => {
    expect(keyNavigate(rows, "b", "ArrowRight").toggle).toEqual({ id: "b", open: true });
    expect(keyNavigate(rows, "a", "ArrowRight").focus).toBe("a1");
    expect(keyNavigate(rows, "a1", "ArrowLeft").focus).toBe("a");
    expect(keyNavigate(rows, "a", "ArrowLeft").toggle).toEqual({ id: "a", open: false });
  });
  it("is empty on no rows", () => {
    expect(keyNavigate([], null, "ArrowDown")).toEqual({});
  });
});

describe("persistence", () => {
  it("round-trips and tolerates garbage and a missing store", () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    saveExpanded("k", new Set(["b", "a"]), store);
    expect([...loadExpanded("k", store)]).toEqual(["a", "b"]);
    mem.set("k", "{not json");
    expect(loadExpanded("k", store).size).toBe(0);
    expect(loadExpanded("k", undefined).size).toBe(0);
    expect(() => saveExpanded("k", new Set(), undefined)).not.toThrow();
  });
});

describe("filterOptions", () => {
  it("filters case-insensitively and keeps order", () => {
    const o = [{ label: "Alpha essay" }, { label: "Beta" }, { label: "alphabet" }];
    expect(filterOptions(o, "ALPHA").map((x) => x.label)).toEqual(["Alpha essay", "alphabet"]);
    expect(filterOptions(o, "")).toHaveLength(3);
  });
});
