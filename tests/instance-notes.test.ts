import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  contextRecord: vi.fn(),
  listRelationTypes: vi.fn(),
  listTypes: vi.fn(),
  listRelations: vi.fn(() => []),
  listRecords: vi.fn(() => []),
  createRecord: vi.fn(),
  createRelation: vi.fn(),
}));
vi.mock("../src/lib/srs-client.js", () => m);
import { COMMENTS_ON, COMMENT_TYPE_ID } from "../src/lib/comments";
import { loadInstanceNotes } from "../src/lib/instance-notes";

const who = { kind: "ai", id: "agent:1", name: "Scribe" };
const edge = (relationId: string, relationType: string, direction: "out" | "in", extra = {}) => ({
  relationId,
  relationType,
  direction,
  sourceId: direction === "out" ? "i" : "n",
  targetId: direction === "out" ? "n" : "i",
  sourceLabel: "Src",
  targetLabel: "Tgt",
  neighbour: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.listRelationTypes.mockReturnValue([{ key: "refines", label: "refines (label)" }]);
  m.listTypes.mockReturnValue([]);
  m.contextRecord.mockReturnValue({
    relations: [
      edge("a", "refines", "out", { createdBy: who }),
      edge("b", "mystery", "in"),
      edge("c", COMMENTS_ON, "in"),
    ],
  });
});

it("asks the engine to leave structural edges out and shows every other relation with label, direction, neighbour and actor", () => {
  const n = loadInstanceNotes({} as never, "i");
  expect(m.contextRecord).toHaveBeenCalledWith(expect.anything(), "i", undefined, ["composition", "sequence"]);
  expect(n.annotations.map((a) => [a.kind, a.icon, a.direction, a.label, a.actor])).toEqual([
    ["relation", "refines (label)", "out", "Tgt", who],
    ["relation", "mystery", "in", "Src", undefined],
  ]);
});

it("without the comment package there is no thread; with it, comments-on rows never appear as relations", () => {
  expect(loadInstanceNotes({} as never, "i").available).toBe(false);
  m.listTypes.mockReturnValue([{ id: COMMENT_TYPE_ID, namespace: "n", name: "comment", version: 1 }]);
  m.listRelationTypes.mockReturnValue([{ key: COMMENTS_ON, label: "comments on" }]);
  const n = loadInstanceNotes({} as never, "i");
  expect(n.available).toBe(true);
  expect(n.annotations).toHaveLength(2);
});
