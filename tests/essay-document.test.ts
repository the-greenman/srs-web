import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_STATE_TYPE_ID,
  ESSAY_TYPE_ID,
  PARAGRAPH_TYPE_ID,
} from "../src/lib/essay/type-registry.js";

const m = vi.hoisted(() => ({
  addContainerMember: vi.fn(),
  removeContainerMember: vi.fn(),
  moveContainerMember: vi.fn(),
  moveContainerMemberRelative: vi.fn(),
  addContainerMemberRelative: vi.fn(),
  createRecord: vi.fn(() => ({ instanceId: "new" })),
  createContainer: vi.fn(),
  updateRecord: vi.fn(),
  getRecord: vi.fn(),
  getContainerOutline: vi.fn(),
  listContainers: vi.fn(() => [{ containerId: "C", title: "t" }]),
  listTypes: vi.fn(() => [
    { id: "0021ef06-4d6b-42fb-af5a-2d53d287138c", namespace: "n", name: "essay", version: 1 },
    { id: "ec61d93d-1cd1-4b52-b231-9f1bfc7b40b6", namespace: "n", name: "paragraph", version: 1 },
    {
      id: "9785968f-bdd4-4c91-81ef-0e62075f3503",
      namespace: "n",
      name: "document-state",
      version: 1,
    },
  ]),
  listRecords: vi.fn(),
}));
vi.mock("../src/lib/srs-client.js", () => m);

import {
  addParagraph,
  loadEssay,
  moveEntry,
  setHidden,
  shiftEntry,
  transfer,
} from "../src/lib/essay/essay-document.js";

const rec = (instanceId: string, typeId: string, fieldValues: Record<string, unknown>) => ({
  instanceId,
  typeId,
  typeVersion: 1,
  fieldValues,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.listRecords.mockImplementation(
    (_r: unknown, f: { typeName?: string; containerId?: string }) => {
      if (f.typeName === "essay") return [rec("E", ESSAY_TYPE_ID, { title: "My essay" })];
      if (f.typeName === "document-state")
        return [
          rec("S", DOCUMENT_STATE_TYPE_ID, {
            essay: "E",
            hidden_instance_ids: ["p2"],
            draft_container_id: "D",
          }),
        ];
      if (f.containerId === "C")
        return [rec("p1", PARAGRAPH_TYPE_ID, { paragraph_title: "One", body: "x" })];
      if (f.containerId === "D") return [rec("p9", PARAGRAPH_TYPE_ID, { body: "spare" })];
      return [];
    }
  );
  const oe = (instanceId: string, depth = 0) => ({
    instanceId,
    depth,
    hasChildren: false,
    runSize: 1,
    runEnd: 0,
  });
  m.getContainerOutline.mockImplementation((_r: unknown, id: string) =>
    id === "C"
      ? { entries: [oe("E"), oe("p1"), oe("p2", 1)], body: [oe("p1"), oe("p2", 1)] }
      : { entries: [oe("p9")], body: [oe("p9")] }
  );
  m.getRecord.mockReturnValue(
    rec("S", DOCUMENT_STATE_TYPE_ID, {
      essay: "E",
      hidden_instance_ids: ["p2"],
      draft_container_id: "D",
    })
  );
});

describe("essay-document", () => {
  it("loads the core's outline body (identity excluded), plus hidden ids and the draft container", () => {
    const model = loadEssay({} as never, "E");
    expect(model.entries.map((e) => e.instanceId)).toEqual(["p1", "p2"]);
    expect(model.paragraphs.p1).toEqual({ id: "p1", title: "One", body: "x" });
    expect(model.hidden).toEqual(["p2"]);
    expect(model.draftContainerId).toBe("D");
    expect(model.draftEntries.map((e) => e.instanceId)).toEqual(["p9"]);
  });

  it("passes gestures to the core's relative ops unchanged (no client arithmetic)", () => {
    const model = loadEssay({} as never, "E");
    addParagraph({} as never, model, { id: "p1", zone: "after" });
    expect(m.addContainerMemberRelative).toHaveBeenCalledWith({}, "C", "new", "p1", "after");
    addParagraph({} as never, model);
    expect(m.addContainerMember).toHaveBeenCalledWith({}, "C", "new");
    moveEntry({} as never, "C", "p1", { id: "p2", zone: "into" });
    expect(m.moveContainerMemberRelative).toHaveBeenCalledWith({}, "C", "p1", {
      relativeTo: "p2",
      placement: "into",
    });
    shiftEntry({} as never, "C", "p1", "indent");
    expect(m.moveContainerMemberRelative).toHaveBeenLastCalledWith({}, "C", "p1", {
      shift: "indent",
    });
    moveEntry({} as never, "D", "p9", { id: null, zone: "after" });
    expect(m.moveContainerMember).toHaveBeenCalledWith({}, "D", "p9", 1, 0);
  });

  it("pull-out / put-back are remove + add through the engine", () => {
    transfer({} as never, "C", "D", "p1", { id: "p9", zone: "before" });
    expect(m.removeContainerMember).toHaveBeenCalledWith({}, "C", "p1");
    expect(m.addContainerMemberRelative).toHaveBeenCalledWith({}, "D", "p1", "p9", "before");
    transfer({} as never, "D", "C", "p9");
    expect(m.addContainerMember).toHaveBeenLastCalledWith({}, "C", "p9");
  });

  it("the eye writes hidden ids into the document-state record, not the paragraph", () => {
    const model = loadEssay({} as never, "E");
    setHidden({} as never, model, "p1", true);
    expect(m.updateRecord).toHaveBeenCalledWith({}, "S", {
      fieldValues: { essay: "E", hidden_instance_ids: ["p2", "p1"], draft_container_id: "D" },
    });
    setHidden({} as never, model, "p2", false);
    expect(m.updateRecord.mock.calls[1][2].fieldValues.hidden_instance_ids).toEqual([]);
  });
});
