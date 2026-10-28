import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createRecord: vi.fn(() => ({ instanceId: "c1" })),
  createRelation: vi.fn(),
  deleteRecord: vi.fn(),
  listTypes: vi.fn(() => [
    { id: "11cd0a5f-8c3f-4ec2-a055-5b9f56c5b0bc", version: 1, namespace: "com.semanticops.comments", name: "comment" },
    { id: "11cd0a5f-8c3f-4ec2-a055-5b9f56c5b0bc", version: 2, namespace: "com.semanticops.comments", name: "comment" },
  ]),
  listRelations: vi.fn((_r: unknown, _f: { relationType: string }) => [] as unknown[]),
  listRecords: vi.fn(() => [] as unknown[]),
}));
vi.mock("../src/lib/srs-client.js", () => m);
import { currentAnswers, loadProposals, proposeLink, respond } from "../src/lib/link-proposals";

const T = "11cd0a5f-8c3f-4ec2-a055-5b9f56c5b0bc";
const ON = "com.semanticops.comments/comments-on";
const TO = "com.semanticops.comments/proposes-link-to";
const owner = { kind: "human", id: "human:owner" };
const agent = { kind: "ai", id: "agent:analyst" };

beforeEach(() => vi.clearAllMocks());

it("currentAnswers: latest per author wins, withdrawn clears, other kinds ignored", () => {
  expect(
    currentAnswers([
      { author: owner, kind: "agree", createdAt: "1" },
      { author: owner, kind: "disagree", createdAt: "2" },
      { author: agent, kind: "agree", createdAt: "1" },
      { author: agent, kind: "withdrawn", createdAt: "3" },
      { author: owner, kind: "question", createdAt: "9" },
    ])
  ).toEqual({ "human:owner": "disagree" });
});

it("proposeLink writes a suggestion comment at the newest comment version, then both relations", () => {
  const id = proposeLink({} as never, "para", "problem", "com.semanticops.method/answers", "it answers SP-1");
  expect(id).toBe("c1");
  expect(m.createRecord).toHaveBeenCalledWith(expect.anything(), T, 2, {
    fieldValues: { comment_text: "it answers SP-1", kind: "suggestion", proposed_relation: "com.semanticops.method/answers" },
  });
  expect(m.createRelation.mock.calls.map((c) => c[1])).toEqual([
    { relationType: ON, targetInstanceId: "para", sourceInstanceId: "c1" },
    { relationType: TO, targetInstanceId: "problem", sourceInstanceId: "c1" },
  ]);
});

it("a failed relation removes the comment with a cascading delete and rethrows", () => {
  m.createRelation.mockImplementationOnce(() => undefined).mockImplementationOnce(() => {
    throw new Error("nope");
  });
  expect(() => proposeLink({} as never, "p", "t", "k", "why")).toThrow("nope");
  expect(m.deleteRecord).toHaveBeenCalledWith(expect.anything(), "c1", true);
});

it("respond writes a typed response on the proposal, with the answer as text when none is given", () => {
  respond({} as never, "prop", "agree");
  expect(m.createRecord).toHaveBeenCalledWith(expect.anything(), T, 2, {
    fieldValues: { comment_text: "agree", kind: "agree" },
  });
  expect(m.createRelation).toHaveBeenCalledWith(expect.anything(), {
    relationType: ON,
    targetInstanceId: "prop",
    sourceInstanceId: "c1",
  });
});

it("loadProposals finds proposals on a record with their current answers, ignoring plain comments", () => {
  const rec = (id: string, fv: Record<string, string>, by: object, at: string) => ({
    instanceId: id, typeId: T, fieldValues: fv, createdBy: by, createdAt: at,
  });
  m.listRecords.mockReturnValue([
    rec("p1", { comment_text: "answers it", kind: "suggestion", proposed_relation: "k" }, agent, "1"),
    rec("plain", { comment_text: "just a note" }, agent, "1"),
    rec("r1", { comment_text: "yes", kind: "agree" }, owner, "2"),
  ]);
  m.listRelations.mockImplementation((_r, f) =>
    f.relationType === ON
      ? [
          { sourceInstanceId: "p1", targetInstanceId: "para" },
          { sourceInstanceId: "plain", targetInstanceId: "para" },
          { sourceInstanceId: "r1", targetInstanceId: "p1" },
        ]
      : [{ sourceInstanceId: "p1", targetInstanceId: "problem" }]
  );
  const types = m.listTypes() as never;
  expect(loadProposals({} as never, types, "para")).toEqual([
    {
      id: "p1", sourceId: "para", targetId: "problem", relationType: "k", why: "answers it",
      author: agent, createdAt: "1", answers: { "human:owner": "agree" },
    },
  ]);
});
