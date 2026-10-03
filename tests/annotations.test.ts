import { expect, it } from "vitest";
import { annotationsFor } from "../src/lib/essay/annotations.js";
import type { EssayModel } from "../src/lib/essay/essay-document.js";

const model = {
  paragraphs: { p: { id: "p", title: "Opening", body: "" } },
  comments: {
    p: [
      { id: "c1", text: "a", createdAt: "", author: { kind: "ai", id: "x" } },
      { id: "c2", text: "b", createdAt: "" },
    ],
  },
  attachments: {
    p: [
      {
        id: "a1",
        relationType: "evidences",
        direction: "in",
        neighbourType: "note",
        neighbourId: "n",
        label: "Source",
        text: "t",
      },
    ],
  },
  related: {
    p: [
      { id: "r1", relationType: "derived-from", direction: "out", otherId: "q", label: "Original" },
      { id: "r2", relationType: "supersedes", direction: "in", otherId: "z", label: "Newer" },
    ],
  },
} as unknown as EssayModel;

it("lists comments first, then attachments, then relations, with counts and both directions", () => {
  const a = annotationsFor(model, "p");
  expect(a.map((x) => [x.kind, x.key])).toEqual([
    ["comments", "comments:p"],
    ["attachment", "a1"],
    ["relation", "r1"],
    ["relation", "r2"],
  ]);
  expect(a[0]).toMatchObject({ count: 2, label: "Opening" });
  expect(a[2]).toMatchObject({
    icon: "derived-from",
    direction: "out",
    targetId: "q",
    label: "Original",
  });
  expect(a[3].direction).toBe("in");
});

it("a bare paragraph still carries the (empty) comments annotation", () => {
  const bare = {
    paragraphs: { p: { id: "p", title: "", body: "" } },
    comments: {},
    attachments: {},
    related: {},
  } as unknown as EssayModel;
  expect(annotationsFor(bare, "p")).toEqual([
    {
      kind: "comments",
      key: "comments:p",
      count: 0,
      label: "untitled paragraph",
      actor: undefined,
    },
  ]);
});
