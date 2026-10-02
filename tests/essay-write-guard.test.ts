import { describe, expect, it } from "vitest";
import { type EssayModel, essayWriteGuard } from "../src/lib/essay/essay-document.js";

const base = {
  essayId: "e",
  containerId: "c",
  stateId: null,
  draftContainerId: null,
} as EssayModel;

describe("essayWriteGuard", () => {
  it("guards the essay and its container; labels are fill-only", () => {
    expect(essayWriteGuard(base)).toEqual({
      containerIds: ["c"],
      instanceIds: ["e"],
      fillOnlyFields: ["paragraph_title"],
    });
  });
  it("adds the draft container and document-state record when present", () => {
    const g = essayWriteGuard({ ...base, stateId: "s", draftContainerId: "d" });
    expect(g.containerIds).toEqual(["c", "d"]);
    expect(g.instanceIds).toEqual(["e", "s"]);
  });
});
