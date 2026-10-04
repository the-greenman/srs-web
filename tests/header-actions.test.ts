import { describe, expect, it, vi } from "vitest";
import { headerActions } from "../src/lib/essay/header-actions.js";

const noop = () => {};
const base = {
  onnew: noop,
  onhelp: noop,
  onvariant: noop,
  oncomments: noop,
  onexport: noop,
  onopenanother: noop,
};
const state = { expanded: false, comments: "none" as const, saving: false };

describe("headerActions (srs-web#383)", () => {
  it("lists the always-present actions in desktop order", () => {
    expect(headerActions(base, state).map((a) => a.id)).toEqual([
      "new",
      "help",
      "margin",
      "comments",
      "export",
      "other",
    ]);
  });

  it("adds copy, save and explorer only when their handler exists", () => {
    const ids = headerActions({ ...base, oncopy: noop, onsave: noop, onexplorer: noop }, state).map(
      (a) => a.id
    );
    expect(ids).toEqual([
      "new",
      "copy",
      "help",
      "margin",
      "comments",
      "save",
      "export",
      "explorer",
      "other",
    ]);
  });

  it("carries toggle state and the saving label, and runs the handler", () => {
    const onsave = vi.fn();
    const a = headerActions(
      { ...base, onsave },
      { expanded: true, comments: "all" as const, saving: true }
    );
    expect(a.find((x) => x.id === "margin")?.pressed).toBe(true);
    expect(a.find((x) => x.id === "comments")?.pressed).toBe(true);
    const save = a.find((x) => x.id === "save")!;
    expect([save.label, save.enabled]).toEqual(["Saving…", false]);
    save.run();
    expect(onsave).toHaveBeenCalledOnce();
  });

  it("adds Copy for agent only when its handler exists", () => {
    expect(headerActions(base, state).some((a) => a.id === "agent")).toBe(false);
    const onagent = vi.fn();
    const a = headerActions({ ...base, onagent }, state).find((x) => x.id === "agent")!;
    a.run();
    expect([a.label, onagent.mock.calls.length]).toEqual(["Copy for agent", 1]);
  });
});
