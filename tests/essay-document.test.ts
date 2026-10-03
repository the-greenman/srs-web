import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMENT_TYPE_ID,
  DOCUMENT_STATE_TYPE_ID,
  ESSAY_TYPE_ID,
  PARAGRAPH_TYPE_ID,
} from "../src/lib/essay/type-registry.js";

const m = vi.hoisted(() => ({
  addContainerMember: vi.fn(),
  removeContainerMember: vi.fn(),
  moveContainerMemberRelative: vi.fn(),
  addContainerMemberRelative: vi.fn(),
  createRecord: vi.fn(() => ({ instanceId: "new" })),
  createContainer: vi.fn(),
  updateRecord: vi.fn(),
  updateContainer: vi.fn(),
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
  listRelations: vi.fn(() => []),
  contextRecord: vi.fn(() => ({ relations: [] })),
  containersForInstance: vi.fn(() => []),
  copyContainer: vi.fn(),
  forkRecord: vi.fn(),
  listRelationTypes: vi.fn(() => []),
  createRelation: vi.fn(),
}));
vi.mock("../src/lib/srs-client.js", () => m);

import {
  addParagraph,
  loadEssay,
  moveEntry,
  setEssayTitle,
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
    const model = loadEssay({ write_epoch: () => 0 } as never, "E");
    expect(model.entries.map((e) => e.instanceId)).toEqual(["p1", "p2"]);
    expect(model.paragraphs.p1).toEqual({ id: "p1", title: "One", body: "x" });
    expect(model.hidden).toEqual(["p2"]);
    expect(model.draftContainerId).toBe("D");
    expect(model.draftEntries.map((e) => e.instanceId)).toEqual(["p9"]);
  });

  it("reads comment records once per change of the comments-on set, oldest first", () => {
    m.listTypes.mockReturnValue([
      ...m.listTypes(),
      { id: COMMENT_TYPE_ID, namespace: "n", name: "comment", version: 1 },
    ]);
    const c = (id: string, at: string) => ({
      ...rec(id, COMMENT_TYPE_ID, { comment_text: id }),
      createdAt: at,
    });
    const rel = (relationId: string, sourceInstanceId: string) => ({
      relationId,
      sourceInstanceId,
      targetInstanceId: "p1",
    });
    const base = m.listRecords.getMockImplementation() as (r: unknown, f: unknown) => unknown;
    m.listRecords.mockImplementation((r: unknown, f: { typeName?: string }) =>
      f.typeName === "comment" ? [c("b", "2"), c("a", "1")] : base(r, f)
    );
    m.listRelations.mockReturnValue([rel("r1", "b"), rel("r2", "a")]);
    const repo = { write_epoch: () => 0 };
    const commentReads = () =>
      m.listRecords.mock.calls.filter(([, f]) => f.typeName === "comment").length;
    expect(loadEssay(repo as never, "E").comments.p1.map((x) => x.id)).toEqual(["a", "b"]);
    loadEssay(repo as never, "E");
    expect(commentReads()).toBe(1);
    m.listRelations.mockReturnValue([rel("r1", "b"), rel("r2", "a"), rel("r3", "a")]);
    loadEssay(repo as never, "E");
    expect(commentReads()).toBe(2);
  });

  it("passes gestures to the core's relative ops unchanged (no client arithmetic)", () => {
    const model = loadEssay({ write_epoch: () => 0 } as never, "E");
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
    // no target = after the last top-level run, read from the core's outline
    m.getContainerOutline.mockReturnValueOnce({
      entries: [
        { instanceId: "p9", depth: 0 },
        { instanceId: "p8", depth: 0 },
        { instanceId: "p7", depth: 1 },
      ],
    });
    moveEntry({} as never, "D", "p9", { id: null, zone: "after" });
    expect(m.moveContainerMemberRelative).toHaveBeenLastCalledWith({}, "D", "p9", {
      relativeTo: "p8",
      placement: "after",
    });
    m.moveContainerMemberRelative.mockClear();
    m.getContainerOutline.mockReturnValueOnce({ entries: [{ instanceId: "p9", depth: 0 }] });
    moveEntry({} as never, "D", "p9", { id: null, zone: "after" }); // already last: no-op
    expect(m.moveContainerMemberRelative).not.toHaveBeenCalled();
  });

  it("pull-out / put-back are remove + add through the engine", () => {
    transfer({} as never, "C", "D", "p1", { id: "p9", zone: "before" });
    expect(m.removeContainerMember).toHaveBeenCalledWith({}, "C", "p1");
    expect(m.addContainerMemberRelative).toHaveBeenCalledWith({}, "D", "p1", "p9", "before");
    transfer({} as never, "D", "C", "p9");
    expect(m.addContainerMember).toHaveBeenLastCalledWith({}, "C", "p9");
  });

  it("the eye writes hidden ids into the document-state record, not the paragraph", () => {
    const model = loadEssay({ write_epoch: () => 0 } as never, "E");
    setHidden({} as never, model, "p1", true);
    expect(m.updateRecord).toHaveBeenCalledWith({}, "S", {
      fieldValues: { essay: "E", hidden_instance_ids: ["p2", "p1"], draft_container_id: "D" },
    });
    setHidden({} as never, model, "p2", false);
    expect(m.updateRecord.mock.calls[1][2].fieldValues.hidden_instance_ids).toEqual([]);
  });

  it("setEssayTitle without a draft container renames only the essay and its container", () => {
    m.getRecord.mockReturnValue(rec("E", ESSAY_TYPE_ID, { title: "Old" }));
    m.updateContainer.mockClear();
    setEssayTitle({} as never, { essayId: "E", containerId: "C", draftContainerId: null }, "New");
    expect(m.updateContainer.mock.calls).toEqual([[{}, "C", { title: "New" }]]);
  });

  it("setEssayTitle patches the essay's title field and renames its container and draft", () => {
    m.getRecord.mockReturnValue(rec("E", ESSAY_TYPE_ID, { title: "Old", other: "kept" }));
    setEssayTitle({} as never, { essayId: "E", containerId: "C", draftContainerId: "D" }, "New");
    expect(m.updateContainer).toHaveBeenCalledWith({}, "C", { title: "New" });
    expect(m.updateContainer).toHaveBeenCalledWith({}, "D", { title: "New (draft)" });
    expect(m.updateRecord).toHaveBeenCalledWith({}, "E", {
      fieldValues: { title: "New", other: "kept" },
    });
  });
});
