import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createRecord: vi.fn(() => ({ instanceId: "c1" })),
  createRecordInContainer: vi.fn(() => ({ instanceId: "c1" })),
  createRelation: vi.fn(),
  deleteRecord: vi.fn(),
  listTypes: vi.fn(() => [{ id: "7482e41b-7d3d-4069-b165-ee509dacce22", version: 1 }]),
  listRelationTypes: vi.fn(() => []),
  listRelations: vi.fn(() => []),
  listRecords: vi.fn(() => []),
  renderMarkdown: (s: string) =>
    `<p>${s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p><script>x</script>`,
}));
vi.mock("../src/lib/srs-client.js", () => m);
import { addComment, commentsAvailable, loadComments } from "../src/lib/comments";

beforeEach(() => vi.clearAllMocks());

it("deletes the created comment record when the relation fails, and rethrows", () => {
  m.createRelation.mockImplementationOnce(() => {
    throw new Error("nope");
  });
  expect(() => addComment({} as never, "t", "hi")).toThrow("nope");
  expect(m.deleteRecord).toHaveBeenCalledWith(expect.anything(), "c1");
});

it("keeps the record when the relation succeeds", () => {
  addComment({} as never, "t", "hi");
  expect(m.deleteRecord).not.toHaveBeenCalled();
});

it("with a comments container the record is created into it in the same call", () => {
  addComment({} as never, "t", "hi", "K");
  expect(m.createRecordInContainer).toHaveBeenCalledWith(
    expect.anything(),
    "K",
    "7482e41b-7d3d-4069-b165-ee509dacce22",
    1,
    { fieldValues: { comment_text: "hi" } }
  );
  expect(m.createRecord).not.toHaveBeenCalled();
  expect(m.createRelation).toHaveBeenCalledOnce();
});

const SO_TYPE = "11cd0a5f-8c3f-4ec2-a055-5b9f56c5b0bc";
const SO_REL = "com.semanticops.comments/comments-on";
const OLD_TYPE = "7482e41b-7d3d-4069-b165-ee509dacce22";
const OLD_REL = "com.mudemocracy.essay/comments-on";
const only = (typeId: string, key: string) => {
  m.listTypes.mockReturnValue([{ id: typeId, version: 2 }] as never);
  m.listRelationTypes.mockReturnValue([{ key }] as never);
};

it("commentsAvailable with either pair, not with neither", () => {
  expect(commentsAvailable({} as never)).toBe(false);
  only(SO_TYPE, SO_REL);
  expect(commentsAvailable({} as never)).toBe(true);
  only(OLD_TYPE, OLD_REL);
  expect(commentsAvailable({} as never)).toBe(true);
});

it("writes the SemanticOps pair when installed, the essay pair when only that is", () => {
  m.listTypes.mockReturnValue([
    { id: OLD_TYPE, version: 1 },
    { id: SO_TYPE, version: 2 },
  ] as never);
  m.listRelationTypes.mockReturnValue([{ key: OLD_REL }, { key: SO_REL }] as never);
  addComment({} as never, "t", "hi");
  expect(m.createRecord).toHaveBeenLastCalledWith(expect.anything(), SO_TYPE, 2, expect.anything());
  expect(m.createRelation).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ relationType: SO_REL })
  );
  only(OLD_TYPE, OLD_REL);
  addComment({} as never, "t", "hi");
  expect(m.createRecord).toHaveBeenLastCalledWith(
    expect.anything(),
    OLD_TYPE,
    2,
    expect.anything()
  );
  expect(m.createRelation).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ relationType: OLD_REL })
  );
});

it("loadComments reads comments linked by either relation", () => {
  const types = [
    { id: SO_TYPE, namespace: "s", name: "comment" },
    { id: OLD_TYPE, namespace: "o", name: "comment" },
  ];
  m.listRelations.mockImplementation(((_r: unknown, f: { relationType: string }) =>
    f.relationType === SO_REL
      ? [{ relationId: "r1", sourceInstanceId: "a", targetInstanceId: "T" }]
      : [{ relationId: "r2", sourceInstanceId: "b", targetInstanceId: "T" }]) as never);
  m.listRecords.mockImplementation(((_r: unknown, f: { typeNamespace: string }) => [
    f.typeNamespace === "s"
      ? { instanceId: "a", typeId: SO_TYPE, fieldValues: { comment_text: "new" }, createdAt: "1" }
      : { instanceId: "b", typeId: OLD_TYPE, fieldValues: { comment_text: "old" }, createdAt: "2" },
  ]) as never);
  expect(loadComments({} as never, types as never)["T"].map((c) => c.text)).toEqual(["new", "old"]);
});
