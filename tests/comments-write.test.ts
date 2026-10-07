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
import { addComment } from "../src/lib/comments";

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
