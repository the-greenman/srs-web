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
  createRelation: vi.fn(),
  deleteRecord: vi.fn(),
  deleteRelation: vi.fn(),
  typeSchema: vi.fn(() => ({ schema: { properties: { title: {}, purpose: {} } } })),
  listRelationTypes: vi.fn(() => [
    { key: "evidences", label: "evidences" },
    { key: "x/counters", label: "counters" },
  ]),
}));
vi.mock("../src/lib/srs-client.js", () => m);

import {
  addParagraph,
  agentHandoff,
  binParagraph,
  deleteForever,
  loadEssay,
  moveEntry,
  removeAttachment,
  setEssayPurpose,
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

  it("asks the core to leave out structural edges; a contains/precedes neighbour is never shown", () => {
    const para = (instanceId: string) => ({
      kind: "record",
      instanceId,
      typeId: PARAGRAPH_TYPE_ID,
      typeName: "paragraph",
      fieldValues: { body: "x" },
    });
    const edge = (relationId: string, relationType: string, category: string) => ({
      direction: "out",
      relationId,
      relationType,
      sourceId: "p1",
      targetId: "p2",
      neighbour: para("p2"),
      category,
    });
    const all = [
      edge("c", "contains", "composition"),
      edge("s", "precedes", "sequence"),
      edge("d", "depends-on", "x"),
    ];
    // stand-in for the core: honours the exclusion by category
    m.contextRecord.mockImplementation((_r: unknown, _id: string, _c: unknown, ex?: string[]) => ({
      relations: all.filter((r) => !ex?.includes(r.category)),
    }));
    const model = loadEssay({ write_epoch: () => 0 } as never, "E");
    expect(m.contextRecord).toHaveBeenCalledWith(expect.anything(), "p1", undefined, [
      "composition",
      "sequence",
    ]);
    expect(model.attachments.p1).toBeUndefined();
    expect(model.related.p1.map((r) => r.relationType)).toEqual(["depends-on"]);
  });

  it("labels an attachment from the core vocabulary (key when unknown); removeAttachment deletes the relation", () => {
    const note = { kind: "note", instanceId: "n1", title: "N", sections: [{ content: "c" }] };
    const edge = (relationId: string, relationType: string) => ({
      direction: "in",
      relationId,
      relationType,
      sourceId: "n1",
      targetId: "p1",
      sourceLabel: "N",
      neighbour: note,
      category: "x",
    });
    m.contextRecord.mockImplementation(() => ({
      relations: [edge("a", "x/counters"), edge("b", "mystery")],
    }));
    const model = loadEssay({ write_epoch: () => 1 } as never, "E");
    expect(model.attachments.p1.map((a) => a.relationLabel)).toEqual(["counters", "mystery"]);
    removeAttachment({} as never, "a");
    expect(m.deleteRelation).toHaveBeenCalledWith(expect.anything(), "a");
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
    m.getContainerOutline.mockReturnValue({ body: [{ instanceId: "p1", depth: 0 }] });
    transfer({} as never, "C", "D", "p1", { id: "p9", zone: "before" });
    expect(m.removeContainerMember).toHaveBeenCalledWith({}, "C", "p1");
    expect(m.addContainerMemberRelative).toHaveBeenCalledWith({}, "D", "p1", "p9", "before");
    transfer({} as never, "D", "C", "p9");
    expect(m.addContainerMember).toHaveBeenLastCalledWith({}, "C", "p9");
  });

  it("transfer moves the whole subtree, keeping its shape", () => {
    m.getContainerOutline.mockReturnValue({
      body: [
        { instanceId: "a", depth: 1 },
        { instanceId: "b", depth: 2 },
        { instanceId: "c", depth: 2 },
        { instanceId: "d", depth: 1 },
      ],
    });
    transfer({} as never, "C", "B", "a");
    expect(m.removeContainerMember.mock.calls.map((c) => c[2])).toEqual(["c", "b", "a"]);
    expect(m.addContainerMember).toHaveBeenCalledWith({}, "B", "a");
    expect(m.addContainerMemberRelative.mock.calls.map((c) => c.slice(2))).toEqual([
      ["b", "a", "into"],
      ["c", "b", "after"],
    ]);
  });

  it("delete creates the Bin once and upgrades the state record to the installed type version", () => {
    m.getRecord.mockReturnValue(rec("S", DOCUMENT_STATE_TYPE_ID, { essay: "E" }));
    m.createContainer.mockReturnValue({ containerId: "B" });
    m.listTypes.mockReturnValueOnce([
      { id: DOCUMENT_STATE_TYPE_ID, namespace: "n", name: "document-state", version: 2 },
    ]);
    m.getContainerOutline.mockReturnValue({ body: [{ instanceId: "p1", depth: 0 }] });
    const model = { stateId: "S", title: "T", containerId: "C", binContainerId: null };
    binParagraph({} as never, model as never, "p1");
    expect(m.updateRecord).toHaveBeenCalledWith({}, "S", {
      fieldValues: { essay: "E", bin_container_id: "B" },
      typeVersion: 2,
    });
    expect(m.createContainer).toHaveBeenCalledWith({}, { title: "T (bin)" });
    expect(m.addContainerMember).toHaveBeenCalledWith({}, "B", "p1");
    binParagraph({} as never, { ...model, binContainerId: "B" } as never, "p1");
    expect(m.createContainer).toHaveBeenCalledOnce();
  });

  it("permanent delete removes the paragraph and its comments; a shared paragraph only leaves the Bin", () => {
    m.getContainerOutline.mockReturnValue({
      body: [
        { instanceId: "p1", depth: 0 },
        { instanceId: "p2", depth: 0 },
      ],
    });
    m.listRelations.mockReturnValue([{ sourceInstanceId: "c1" }]);
    const model = { binContainerId: "B", sharedIn: {} };
    deleteForever({} as never, model as never, "p1");
    expect(m.deleteRecord.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["c1", true],
      ["p1", true],
    ]);
    m.deleteRecord.mockClear();
    deleteForever({} as never, { ...model, sharedIn: { p2: [{}] } } as never, "p2");
    expect(m.removeContainerMember).toHaveBeenLastCalledWith({}, "B", "p2");
    expect(m.deleteRecord).not.toHaveBeenCalled();
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
    setEssayTitle(
      {} as never,
      { essayId: "E", containerId: "C", draftContainerId: null, binContainerId: null },
      "New"
    );
    expect(m.updateContainer.mock.calls).toEqual([[{}, "C", { title: "New" }]]);
  });

  it("setEssayTitle patches the essay's title field and renames its container and draft", () => {
    m.getRecord.mockReturnValue(rec("E", ESSAY_TYPE_ID, { title: "Old", other: "kept" }));
    setEssayTitle(
      {} as never,
      { essayId: "E", containerId: "C", draftContainerId: "D", binContainerId: "B" },
      "New"
    );
    expect(m.updateContainer).toHaveBeenCalledWith({}, "C", { title: "New" });
    expect(m.updateContainer).toHaveBeenCalledWith({}, "D", { title: "New (draft)" });
    expect(m.updateContainer).toHaveBeenCalledWith({}, "B", { title: "New (bin)" });
    expect(m.updateRecord).toHaveBeenCalledWith({}, "E", {
      fieldValues: { title: "New", other: "kept" },
    });
  });

  it("purpose: read when the essay type declares it, null (UI hidden) when not", () => {
    const repo = { write_epoch: () => 0 } as never;
    m.listRecords.mockImplementation((_r: unknown, f: { typeName?: string }) =>
      f.typeName === "essay" ? [rec("E", ESSAY_TYPE_ID, { title: "T", purpose: "Why" })] : []
    );
    expect(loadEssay(repo, "E").purpose).toBe("Why");
    m.typeSchema.mockReturnValue({ schema: { properties: { title: {} } } });
    expect(loadEssay({ write_epoch: () => 0 } as never, "E").purpose).toBeNull();
  });

  it("setEssayPurpose patches the purpose field like the title; clearing drops it", () => {
    m.getRecord.mockReturnValue(rec("E", ESSAY_TYPE_ID, { title: "T", purpose: "old" }));
    setEssayPurpose({} as never, "E", "new");
    expect(m.updateRecord).toHaveBeenLastCalledWith({}, "E", {
      fieldValues: { title: "T", purpose: "new" },
    });
    setEssayPurpose({} as never, "E", "");
    expect(m.updateRecord).toHaveBeenLastCalledWith({}, "E", { fieldValues: { title: "T" } });
  });
});

describe("agentHandoff (srs-web#411)", () => {
  const base = {
    repositoryId: "R",
    essay: { id: "E", title: "On small democracy" },
    containerId: "C",
  };

  it("whole essay: title, purpose, ids, the container URI and the rules; no focus", () => {
    const t = agentHandoff({ ...base, purpose: "Persuade the board." });
    expect(t).toContain("On small democracy");
    expect(t).toContain("Purpose: Persuade the board.");
    expect(t).toContain("Repository R, essay record E, container C");
    expect(t).toContain("srs://R/container/C");
    expect(t).not.toContain("/context/");
    expect(t).toContain("The text is the writer's: comment and attach, never edit it.");
  });

  it("with a focus: its title, id and context URI; stays short", () => {
    const t = agentHandoff({ ...base, purpose: "P", focus: { id: "p1", title: "Opening" } });
    expect(t).toContain('"Opening" (paragraph p1)');
    expect(t).toContain("srs://R/context/C/p1");
    expect(t.split("\n").length).toBeLessThanOrEqual(15);
  });

  it("no purpose: the line is left out", () => {
    expect(agentHandoff({ ...base, purpose: "" })).not.toContain("Purpose");
    expect(agentHandoff({ ...base, purpose: null })).not.toContain("Purpose");
  });
});
