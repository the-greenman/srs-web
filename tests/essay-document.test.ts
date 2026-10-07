import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMENT_TYPE_ID } from "../src/lib/comments.js";
import {
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
  getContainer: vi.fn(),
  exportSlice: vi.fn(() => new Uint8Array([1])),
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
  listDocumentViews: vi.fn(() => [{ id: "V" }]),
  renderDocumentView: vi.fn(() => ({ rendered: "# T\n" })),
  listRelations: vi.fn(() => []),
  contextRecord: vi.fn(() => ({ relations: [] })),
  containersForInstance: vi.fn(() => []),
  resolveAttachments: vi.fn(() => ({ sourceDocumentsPath: "s", records: [] as unknown[] })),
  addAttachment: vi.fn(() => ({ documentId: "doc" })),
  linkAttachment: vi.fn(),
  copyContainer: vi.fn(),
  forkRecord: vi.fn(),
  createRelation: vi.fn(),
  deleteRecord: vi.fn(),
  deleteRelation: vi.fn(),
  typeSchema: vi.fn(() => ({
    schema: {
      properties: {
        title: {},
        purpose: {},
        comments_container_id: {},
        references_container_id: {},
      },
    },
  })),
  listRelationTypes: vi.fn(() => [
    { key: "evidences", label: "evidences" },
    { key: "x/counters", label: "counters" },
  ]),
}));
vi.mock("../src/lib/srs-client.js", () => m);

import { annotationsFor } from "../src/lib/annotations.js";
import { essaySource } from "../src/lib/essay/annotation-source.js";
import {
  addParagraph,
  agentHandoff,
  attachFiles,
  binParagraph,
  deleteForever,
  essayWriteGuard,
  loadEssay,
  moveEntry,
  newEssay,
  refreshBundle,
  removeAttachment,
  removeReference,
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

  it("carries the relation's createdBy into the attachment and related actor", () => {
    const who = { kind: "ai", id: "agent:1", name: "Scribe" };
    const note = { kind: "note", instanceId: "n1", title: "N", sections: [{ content: "c" }] };
    const para = {
      kind: "record",
      instanceId: "p2",
      typeId: PARAGRAPH_TYPE_ID,
      typeName: "paragraph",
      fieldValues: { body: "x" },
    };
    const edge = (relationId: string, neighbour: unknown, createdBy?: unknown) => ({
      direction: "out",
      relationId,
      relationType: "evidences",
      sourceId: "p1",
      targetId: "x",
      neighbour,
      createdBy,
    });
    m.contextRecord.mockImplementation(() => ({
      relations: [edge("a", note, who), edge("b", para, who), edge("c", note)],
    }));
    const model = loadEssay({ write_epoch: () => 2 } as never, "E");
    expect(model.attachments.p1.map((a) => a.actor)).toEqual([who, undefined]);
    expect(model.related.p1[0].actor).toEqual(who);
    expect(annotationsFor(essaySource(model), "p1").map((a) => a.actor)).toEqual([
      undefined, // comments: no comments yet
      who,
      undefined,
      who,
    ]);
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
    m.typeSchema.mockImplementation(() => ({ schema: { properties: { title: {} } } }));
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

describe("agentHandoff (srs-web#411, #498)", () => {
  const base = {
    repositoryId: "R",
    essay: { id: "E", title: "On small democracy" },
    containerId: "C",
  };
  const all = {
    ...base,
    stateId: "S",
    draftContainerId: "D",
    binContainerId: "B",
    commentsContainerId: "K",
    referencesContainerId: "F",
  };

  it("names the document-state and every container, and teaches the rules", () => {
    const t = agentHandoff({ ...all, purpose: "Persuade the board.", bundleContainerId: "Z" });
    expect(t).toContain("# Essay: On small democracy");
    expect(t).toContain("Purpose: Persuade the board.");
    expect(t).toContain("Repository R. Essay record E, document-state S.");
    expect(t).toContain(
      "Containers: essay C (the text, in order) · draft D · bin B · comments K · references F"
    );
    expect(t).toContain("srs://R/container/C · one paragraph: srs://R/context/C/<paragraphId>");
    expect(t).toContain("Snapshot bundle: srs://R/container/Z");
    expect(t).toContain("How to work on this essay");
    expect(t).toContain("{comment_text} with containerId K, then relation_create");
    expect(t).toContain("create it with containerId F, or container_member_add");
    expect(t).toContain("paragraph_title only where it is empty");
    expect(t).toContain("read its type_schema");
    expect(t).not.toContain("Focus:");
    expect(t).not.toContain("\u2014"); // no em dashes
  });

  it("with a focus: its title, id and context URI", () => {
    const t = agentHandoff({ ...all, focus: { id: "p1", title: "Opening" } });
    expect(t).toContain('Focus: "Opening" (paragraph p1) · srs://R/context/C/p1');
  });

  it("lines for absent ids are omitted", () => {
    const t = agentHandoff(base);
    expect(t).toContain("Repository R. Essay record E.");
    expect(t).toContain("Containers: essay C (the text, in order)");
    expect(t).not.toMatch(
      /draft|bin |comments [A-Z0-9]|references [A-Z0-9]|document-state|Snapshot|Purpose/
    );
    expect(t).toContain("record_create com.mudemocracy.essay/comment {comment_text}, then");
  });
});

describe("essayMarkdown (srs-web#416)", () => {
  it("renders the essay container, excluding hidden ids, their nested children and the anchor", async () => {
    const { essayMarkdown } = await import("../src/lib/essay/essay-document.js");
    const entries = [
      { instanceId: "h1", parentInstanceId: null },
      { instanceId: "c1", parentInstanceId: "h1" },
      { instanceId: "g1", parentInstanceId: "c1" },
      { instanceId: "v1", parentInstanceId: null },
    ];
    const model = { essayId: "E", containerId: "C", hidden: ["h1", "h2"], entries };
    expect(essayMarkdown({} as never, model as never)).toBe("# T\n");
    expect(m.listDocumentViews).toHaveBeenCalledWith(expect.anything(), {
      namespace: "com.mudemocracy.essay",
      name: "essay",
    });
    expect(m.renderDocumentView).toHaveBeenCalledWith({}, "V", "markdown", "C", null, [
      "h1",
      "h2",
      "c1",
      "g1",
      "E",
    ]);
  });
});

describe("refreshBundle (srs-web#417)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: a hand-built model with only what the refresh reads
  const model = (over: Record<string, unknown> = {}): any => ({
    essayId: "E",
    title: "T",
    containerId: "C",
    draftContainerId: "D",
    binContainerId: null,
    stateId: "S",
    canSnapshot: true,
    bundleContainerId: null,
    paragraphs: { p1: {}, p2: {} },
    comments: { p1: [{ id: "c1" }] },
    attachments: { p2: [{ neighbourId: "prob" }] },
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    m.getRecord.mockReturnValue({ instanceId: "S", fieldValues: { essay: "E" } });
  });

  it("first use: creates the bundle declaring the containers as children and the records as members, and links it from the state", () => {
    m.createContainer.mockReturnValue({ containerId: "B" });
    expect(refreshBundle({} as never, model())).toBe("B");
    const input = m.createContainer.mock.calls[0][1];
    expect(input.childContainerIds).toEqual(["C", "D"]);
    expect(input.memberInstanceIds.map((e: { instanceId: string }) => e.instanceId).sort()).toEqual(
      ["E", "S", "c1", "prob"]
    );
    expect(m.updateRecord.mock.calls[0][2].fieldValues.bundle_container_id).toBe("B");
  });

  it("later: applies only the difference with the member ops, and children once", () => {
    m.getContainer.mockReturnValue({
      childContainerIds: ["C", "D"],
      memberInstanceIds: [{ instanceId: "E" }, { instanceId: "S" }, { instanceId: "gone" }],
    });
    refreshBundle({} as never, model({ bundleContainerId: "B" }));
    expect(m.createContainer).not.toHaveBeenCalled();
    expect(m.updateContainer).not.toHaveBeenCalled();
    expect(m.removeContainerMember).toHaveBeenCalledWith(expect.anything(), "B", "gone");
    expect(m.addContainerMember.mock.calls.map((c) => c[2]).sort()).toEqual(["c1", "prob"]);
  });

  it("a new bin is declared as a child on the next refresh", () => {
    m.getContainer.mockReturnValue({ childContainerIds: ["C", "D"], memberInstanceIds: [] });
    refreshBundle({} as never, model({ bundleContainerId: "B", binContainerId: "X" }));
    expect(m.updateContainer).toHaveBeenCalledWith(expect.anything(), "B", {
      childContainerIds: ["C", "D", "X"],
    });
  });

  it("refuses when the package cannot record a bundle", () => {
    expect(() => refreshBundle({} as never, model({ canSnapshot: false }))).toThrow();
  });
});

describe("essayReferences (srs-web#278)", () => {
  it("refreshes the bundle, then renders the essay-references composition for it", async () => {
    const { essayReferences } = await import("../src/lib/essay/essay-document.js");
    vi.clearAllMocks();
    m.getContainer.mockReturnValue({ childContainerIds: ["C"], memberInstanceIds: [] });
    m.getRecord.mockReturnValue({ instanceId: "S", fieldValues: { essay: "E" } });
    // biome-ignore lint/suspicious/noExplicitAny: a hand-built model with only what the refresh reads
    const model: any = {
      essayId: "E",
      title: "T",
      containerId: "C",
      draftContainerId: null,
      binContainerId: null,
      stateId: "S",
      canSnapshot: true,
      bundleContainerId: "B",
      paragraphs: {},
      comments: {},
      attachments: {},
    };
    expect(essayReferences({} as never, model)).toBe("# T\n");
    expect(m.listDocumentViews).toHaveBeenCalledWith(expect.anything(), {
      namespace: "com.mudemocracy.essay",
      name: "essay-references",
    });
    expect(m.renderDocumentView).toHaveBeenCalledWith({}, "V", "markdown", "B");
  });

  it("says so when the package predates the composition", async () => {
    const { essayReferences } = await import("../src/lib/essay/essay-document.js");
    m.listDocumentViews.mockReturnValueOnce([]);
    expect(() =>
      essayReferences({} as never, { canSnapshot: true, stateId: "S" } as never)
    ).toThrow(/1\.6\.0/);
  });
});

describe("comments and references containers (srs-web#494, #495, #496)", () => {
  const repo = () => ({ write_epoch: () => 0 }) as never;
  beforeEach(() => {
    // clearAllMocks keeps implementations: put back the defaults these tests override.
    m.typeSchema.mockImplementation(() => ({
      schema: {
        properties: {
          title: {},
          purpose: {},
          comments_container_id: {},
          references_container_id: {},
        },
      },
    }));
    m.createRecord.mockImplementation((() => ({ instanceId: "new" })) as never);
    m.createContainer.mockReset();
    m.getContainer.mockReset();
    m.getContainer.mockImplementation(() => {
      throw new Error("no such container");
    });
    m.listRelations.mockReturnValue([]);
    m.contextRecord.mockReturnValue({ relations: [] });
    m.addContainerMember.mockReset();
  });
  const stateRec = (extra: Record<string, unknown> = {}) =>
    rec("S", DOCUMENT_STATE_TYPE_ID, {
      essay: "E",
      hidden_instance_ids: [],
      draft_container_id: "D",
      ...extra,
    });
  const withState = (state: unknown[]) => {
    const base = m.listRecords.getMockImplementation() as (r: unknown, f: unknown) => unknown;
    m.listRecords.mockImplementation((r: unknown, f: { typeName?: string }) =>
      f.typeName === "document-state" ? state : base(r, f)
    );
    return m.listRecords.getMockImplementation() as (r: unknown, f: unknown) => unknown;
  };

  it("a new essay creates both containers and records their ids on the state", () => {
    let n = 0;
    m.createContainer.mockImplementation(({ title }: { title: string }) => ({
      containerId: `k${++n}`,
      title,
    }));
    newEssay(repo(), "T");
    expect(m.createContainer.mock.calls.map((c) => c[1].title)).toEqual([
      "T",
      "T (draft)",
      "T (comments)",
      "T (references)",
    ]);
    const state = m.createRecord.mock.calls.at(-1) as unknown[];
    expect((state[3] as { fieldValues: unknown }).fieldValues).toEqual({
      essay: "new",
      hidden_instance_ids: [],
      draft_container_id: "k2",
      comments_container_id: "k3",
      references_container_id: "k4",
    });
  });

  it("an older state type without the fields gets no containers (feature-detected)", () => {
    m.typeSchema.mockImplementation(() => ({ schema: { properties: { title: {} } } }));
    m.createContainer.mockReturnValue({ containerId: "k" });
    newEssay(repo(), "T");
    expect(m.createContainer).toHaveBeenCalledTimes(2); // essay + draft only
  });

  it("repair: an essay with no document-state gets one on load; a read-only load writes nothing", () => {
    withState([]);
    let n = 0;
    m.createContainer.mockImplementation(() => ({ containerId: `k${++n}` }));
    m.createRecord.mockImplementation(((
      _r: unknown,
      _t: string,
      _v: number,
      i: { fieldValues: unknown }
    ) => ({
      instanceId: "S2",
      fieldValues: i.fieldValues,
    })) as never);
    expect(loadEssay(repo(), "E").stateId).toBeNull();
    expect(m.createRecord).not.toHaveBeenCalled();
    const model = loadEssay(repo(), "E", { repair: true });
    expect(model.stateId).toBe("S2");
    expect(model.draftContainerId).toBe("k1");
    expect(model.commentsContainerId).toBe("k2");
    expect(model.referencesContainerId).toBe("k3");
  });

  it("repair: a state missing either container creates it lazily, and a second load is a no-op", () => {
    let n = 0;
    m.createContainer.mockImplementation(() => ({ containerId: `k${++n}` }));
    const model = loadEssay(repo(), "E", { repair: true });
    expect(model.commentsContainerId).toBe("k1");
    expect(model.referencesContainerId).toBe("k2");
    expect(m.updateRecord).toHaveBeenCalledOnce();
    expect(m.updateRecord.mock.calls[0][2]).toMatchObject({
      typeVersion: 1,
      fieldValues: { comments_container_id: "k1", references_container_id: "k2" },
    });
    vi.clearAllMocks();
    withState([stateRec({ comments_container_id: "K", references_container_id: "F" })]);
    m.getContainerOutline.mockReturnValue({ entries: [], body: [] });
    loadEssay(repo(), "E", { repair: true });
    expect(m.createContainer).not.toHaveBeenCalled();
    expect(m.updateRecord).not.toHaveBeenCalled();
  });

  it("sweep: files a linked comment that is not in the comments container; never removes; a second load adds nothing", () => {
    m.listTypes.mockReturnValue([
      ...m.listTypes(),
      { id: COMMENT_TYPE_ID, namespace: "n", name: "comment", version: 1 },
    ]);
    const base = withState([
      stateRec({ comments_container_id: "K", references_container_id: "F" }),
    ]);
    const c = (id: string) => ({
      ...rec(id, COMMENT_TYPE_ID, { comment_text: id }),
      createdAt: id,
    });
    m.listRecords.mockImplementation((r: unknown, f: { typeName?: string }) =>
      f.typeName === "comment"
        ? [c("c1"), c("c2")]
        : (base as (r: unknown, f: unknown) => unknown)(r, f)
    );
    m.listRelations.mockReturnValue([
      { relationId: "r1", sourceInstanceId: "c1", targetInstanceId: "p1" },
      { relationId: "r2", sourceInstanceId: "c2", targetInstanceId: "p1" },
    ]);
    const filed = [{ instanceId: "c1" }, { instanceId: "stray" }];
    m.getContainerOutline.mockImplementation((_r: unknown, id: string) =>
      id === "K" ? { entries: filed, body: filed } : { entries: [], body: [] }
    );
    m.addContainerMember.mockImplementation((_r: unknown, k: string, id: string) => {
      if (k === "K") filed.push({ instanceId: id });
    });
    loadEssay(repo(), "E");
    expect(m.addContainerMember).not.toHaveBeenCalled(); // read-only load: no sweep
    loadEssay(repo(), "E", { repair: true });
    expect(m.addContainerMember.mock.calls).toEqual([[expect.anything(), "K", "c2"]]);
    expect(m.removeContainerMember).not.toHaveBeenCalled();
    m.addContainerMember.mockClear();
    loadEssay(repo(), "E", { repair: true });
    expect(m.addContainerMember).not.toHaveBeenCalled();
  });

  it("references carry the paragraphs they are linked to; an unlinked one has none", () => {
    const base = withState([
      stateRec({ comments_container_id: "K", references_container_id: "F" }),
    ]);
    m.listRecords.mockImplementation((r: unknown, f: { containerId?: string }) =>
      f.containerId === "F"
        ? [
            { ...rec("s1", "t", {}), displayLabel: "Linked source", typeName: "source" },
            { ...rec("s2", "t", {}), displayLabel: "Loose claim", typeName: "claim" },
          ]
        : (base as (r: unknown, f: unknown) => unknown)(r, f)
    );
    const note = { kind: "note", instanceId: "s1", title: "N", sections: [] };
    m.contextRecord.mockImplementation((_r: unknown, id: string) => ({
      relations:
        id === "p1"
          ? [
              {
                direction: "in",
                relationId: "a",
                relationType: "evidences",
                sourceId: "s1",
                targetId: "p1",
                neighbour: note,
              },
            ]
          : [],
    }));
    m.getContainerOutline.mockReturnValue({ entries: [], body: [] });
    const model = loadEssay(repo(), "E");
    expect(model.references).toEqual([
      { id: "s1", label: "Linked source", typeName: "source", paragraphIds: ["p1"] },
      { id: "s2", label: "Loose claim", typeName: "claim", paragraphIds: [] },
    ]);
    removeReference({} as never, model, "s2");
    expect(m.removeContainerMember).toHaveBeenCalledWith(expect.anything(), "F", "s2");
    expect(m.deleteRecord).not.toHaveBeenCalled();
  });

  it("the write guard keeps the state record, and leaves the comments and references containers writable", () => {
    const g = essayWriteGuard({
      essayId: "E",
      containerId: "C",
      stateId: "S",
      draftContainerId: "D",
      binContainerId: "B",
      commentsContainerId: "K",
      referencesContainerId: "F",
    } as never);
    expect(g.instanceIds).toContain("S");
    expect(g.containerIds).toEqual(["C", "D", "B"]);
    expect(
      essayWriteGuard({ essayId: "E", containerId: "C", bundleContainerId: "Z" } as never)
        .containerIds
    ).toEqual(["C"]); // the bundle's closure includes comments and references
  });

  it("the snapshot bundle declares both containers as children and drops the per-comment member loop", () => {
    m.getRecord.mockReturnValue({ instanceId: "S", fieldValues: { essay: "E" } });
    m.createContainer.mockReturnValue({ containerId: "Z" });
    // biome-ignore lint/suspicious/noExplicitAny: hand-built model
    const model: any = {
      essayId: "E",
      title: "T",
      containerId: "C",
      draftContainerId: "D",
      binContainerId: null,
      commentsContainerId: "K",
      referencesContainerId: "F",
      stateId: "S",
      canSnapshot: true,
      bundleContainerId: null,
      paragraphs: { p1: {} },
      comments: { p1: [{ id: "c0" }, { id: "c1" }] },
      attachments: { p1: [{ neighbourId: "prob" }] },
    };
    m.getContainerOutline.mockReturnValue({ entries: [{ instanceId: "c0" }], body: [] });
    refreshBundle({} as never, model);
    const input = m.createContainer.mock.calls[0][1];
    expect(input.childContainerIds).toEqual(["C", "D", "K", "F"]);
    expect(input.memberInstanceIds.map((e: { instanceId: string }) => e.instanceId).sort()).toEqual(
      ["E", "S", "c1", "prob"] // c0 is filed in K; the unfiled c1 (a read-only doc never sweeps) is a member
    );
  });

  it("repair is tried once per essay per repo handle: a failure is reported once and not retried", () => {
    m.createContainer.mockImplementation(() => {
      throw new Error("boom");
    });
    const r = repo();
    expect(loadEssay(r, "E", { repair: true }).repairError).toBe("boom");
    expect(loadEssay(r, "E", { repair: true }).repairError).toBeNull();
    expect(m.createContainer).toHaveBeenCalledTimes(1);
  });

  it("area containers get deterministic ids; one that already exists is reused, not created again", () => {
    m.createContainer.mockImplementation(
      (_r: unknown, { containerId }: { containerId: string }) => ({
        containerId,
      })
    );
    const a = loadEssay(repo(), "E", { repair: true });
    const b = loadEssay(repo(), "E", { repair: true }); // a second tab: fresh handle, same state
    expect(b.commentsContainerId).toBe(a.commentsContainerId);
    expect(a.commentsContainerId).toMatch(/^[0-9a-f-]{8}-[0-9a-f-]{4}-5/);
    expect(a.commentsContainerId).not.toBe(a.referencesContainerId);
    vi.clearAllMocks();
    m.getContainer.mockReturnValue({ containerId: "x" }); // now they exist
    loadEssay(repo(), "E", { repair: true });
    expect(m.createContainer).not.toHaveBeenCalled();
  });
});

describe("file attachments (srs-web#506)", () => {
  const file = (name: string) => ({ name, type: "text/markdown", bytes: new Uint8Array([1]) });

  it("attachFiles adds then links each file, in order", () => {
    m.addAttachment
      .mockReturnValueOnce({ documentId: "d1" })
      .mockReturnValueOnce({ documentId: "d2" });
    attachFiles({} as never, "p1", [file("a.md"), file("b.md")]);
    expect(m.addAttachment.mock.calls.map((c) => c[1])).toEqual([
      { fileName: "a.md", contentType: "text/markdown" },
      { fileName: "b.md", contentType: "text/markdown" },
    ]);
    expect(m.linkAttachment.mock.calls.map((c) => c[1])).toEqual([
      { instanceId: "p1", documentId: "d1" },
      { instanceId: "p1", documentId: "d2" },
    ]);
  });

  it("surfaces the core's error (a duplicate name) and links nothing for that file", () => {
    m.addAttachment.mockImplementationOnce(() => {
      throw new Error("an attachment named a.md already exists");
    });
    expect(() => attachFiles({} as never, "p1", [file("a.md")])).toThrow("already exists");
    expect(m.linkAttachment).not.toHaveBeenCalled();
  });

  it("loads a paragraph's files with the size the core knows, and the margin shows them as a file annotation", () => {
    m.resolveAttachments.mockReturnValue({
      sourceDocumentsPath: "s",
      records: [
        {
          instanceId: "p1",
          attachments: [{ documentId: "d1", title: "notes.md", sizeBytes: 2048 }],
        },
      ],
    });
    const model = loadEssay({ write_epoch: () => 7 } as never, "E");
    expect(model.files.p1).toEqual([{ documentId: "d1", name: "notes.md", sizeBytes: 2048 }]);
    expect(model.files.p9).toBeUndefined();
    expect(m.resolveAttachments).toHaveBeenCalledTimes(1); // one batch read, not one per paragraph
    const file = annotationsFor(essaySource(model), "p1").find((a) => a.kind === "file");
    expect(file).toMatchObject({
      key: "file:d1",
      label: "notes.md",
      text: "2 KB",
      documentId: "d1",
    });
  });
});
