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
  createRecord: vi.fn(() => ({ instanceId: "new" })),
  createContainer: vi.fn(),
  updateRecord: vi.fn(),
  getRecord: vi.fn(),
  getContainerArrangement: vi.fn(),
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
  m.getContainerArrangement.mockImplementation((_r: unknown, id: string) =>
    id === "C"
      ? [{ instanceId: "E" }, { instanceId: "p1" }, { instanceId: "p2", depth: 1 }]
      : [{ instanceId: "p9" }]
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
  it("loads the outline without the identity entry, plus hidden ids and the draft container", () => {
    const model = loadEssay({} as never, "E");
    expect(model.entries.map((e) => e.instanceId)).toEqual(["p1", "p2"]);
    expect(model.identityIndex).toBe(0);
    expect(model.paragraphs.p1).toEqual({ id: "p1", title: "One", body: "x" });
    expect(model.hidden).toEqual(["p2"]);
    expect(model.draftContainerId).toBe("D");
    expect(model.draftEntries).toEqual([{ instanceId: "p9" }]);
  });

  it("translates positions to the full outline (identity entry shifts them)", () => {
    const model = loadEssay({} as never, "E");
    addParagraph({} as never, model, { position: 0, depth: 0 });
    expect(m.addContainerMember).toHaveBeenCalledWith({}, "C", "new", 1, 0);
    moveEntry({} as never, model, "C", "p1", { position: 1, depth: 1 });
    expect(m.moveContainerMember).toHaveBeenCalledWith({}, "C", "p1", 2, 1);
    moveEntry({} as never, model, "D", "p9", { position: 0, depth: 0 });
    expect(m.moveContainerMember).toHaveBeenLastCalledWith({}, "D", "p9", 0, 0);
  });

  it("pull-out / put-back are remove + add through the engine", () => {
    const model = loadEssay({} as never, "E");
    transfer({} as never, model, "C", "D", "p1", { position: 1, depth: 0 });
    expect(m.removeContainerMember).toHaveBeenCalledWith({}, "C", "p1");
    expect(m.addContainerMember).toHaveBeenCalledWith({}, "D", "p1", 1, 0);
    transfer({} as never, model, "D", "C", "p9", { position: 2, depth: 0 });
    expect(m.addContainerMember).toHaveBeenLastCalledWith({}, "C", "p9", 3, 0);
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
