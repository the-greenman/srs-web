import { expect, it } from "vitest";
import { annotationsFor } from "../src/lib/annotations.js";
import { essaySource } from "../src/lib/essay/annotation-source.js";
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
  sharedIn: { p: [{ id: "e2", title: "Other essay" }] },
} as unknown as EssayModel;

it("lists comments first, then attachments, then relations, with counts and both directions", () => {
  const a = annotationsFor(essaySource(model), "p");
  expect(a.map((x) => [x.kind, x.key])).toEqual([
    ["comments", "comments:p"],
    ["attachment", "a1"],
    ["shared", "shared:p"],
    ["relation", "r1"],
    ["relation", "r2"],
  ]);
  expect(a[2]).toMatchObject({ label: "Also in Other essay" });
  expect(a[0]).toMatchObject({ count: 2, label: "Opening" });
  expect(a[3]).toMatchObject({
    icon: "derived-from",
    direction: "out",
    targetId: "q",
    label: "Original",
  });
  expect(a[4].direction).toBe("in");
});

it("a bare paragraph still carries the (empty) comments annotation", () => {
  const bare = {
    paragraphs: { p: { id: "p", title: "", body: "" } },
    comments: {},
    attachments: {},
    related: {},
    sharedIn: {},
  } as unknown as EssayModel;
  expect(annotationsFor(essaySource(bare), "p")).toEqual([
    {
      kind: "comments",
      key: "comments:p",
      count: 0,
      label: "untitled paragraph",
      actor: undefined,
    },
  ]);
});

it("reads any instance-keyed source, not an essay: a generic instance gets comments and relation actors", () => {
  const who = { kind: "ai" as const, id: "agent:1" };
  const source = {
    comments: { i: [{ id: "c", text: "t", createdAt: "", author: who }] },
    attachments: {},
    related: {
      i: [
        {
          id: "r",
          relationType: "refines",
          direction: "out" as const,
          otherId: "j",
          label: "J",
          actor: who,
        },
      ],
    },
    label: (id: string) => (id === "i" ? "Instance" : ""),
  };
  const a = annotationsFor(source, "i");
  expect(a.map((x) => [x.kind, x.label, x.actor])).toEqual([
    ["comments", "Instance", who],
    ["relation", "J", who],
  ]);
});
