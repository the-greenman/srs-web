import { describe, expect, it, vi } from "vitest";
import { groupedActions, headerActions } from "../src/lib/essay/header-actions.js";

const noop = () => {};
const base = {
  onnew: noop,
  onhelp: noop,
  onvariant: noop,
  oncomments: noop,
  onexport: noop,
  onopenanother: noop,
};
const state = { expanded: false, comments: "none" as const, saving: false, dirty: true };

describe("headerActions (srs-web#383)", () => {
  it("lists the always-present actions in desktop order", () => {
    expect(headerActions(base, state).map((a) => a.id)).toEqual([
      "new",
      "export",
      "margin",
      "comments",
      "other",
      "help",
    ]);
  });

  it("adds copy, save and explorer only when their handler exists", () => {
    const ids = headerActions({ ...base, oncopy: noop, onsave: noop, onexplorer: noop }, state).map(
      (a) => a.id
    );
    expect(ids).toEqual([
      "save",
      "new",
      "copy",
      "export",
      "margin",
      "comments",
      "explorer",
      "other",
      "help",
    ]);
  });

  it("carries toggle state and the saving label, and runs the handler", () => {
    const onsave = vi.fn();
    const a = headerActions(
      { ...base, onsave },
      { expanded: true, comments: "all" as const, saving: true, dirty: true }
    );
    expect(a.find((x) => x.id === "margin")?.checked).toBe(true);
    expect(a.find((x) => x.id === "comments")?.checked).toBe(true);
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

  it("groups and orders actions, toggles carry checked, mixed maps through", () => {
    const a = headerActions(
      { ...base, oncopy: noop, onagent: noop, onexportmd: noop, onexplorer: noop, onsave: noop },
      { ...state, comments: "mixed" }
    );
    const g = groupedActions(a);
    expect(g.groups.map((x) => x.group)).toEqual(["document", "view", "go", "help"]);
    expect(g.groups.find((x) => x.group === "view")!.items.map((x) => [x.id, x.kind])).toEqual([
      ["margin", "toggle"],
      ["comments", "toggle"],
    ]);
    expect(a.find((x) => x.id === "comments")?.checked).toBe("mixed");
    expect(a.find((x) => x.id === "margin")?.checked).toBe(false);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
  });

  it("primary is never in a menu group; an emptied group disappears", () => {
    const g = groupedActions(headerActions({ ...base, onsave: noop }, state));
    expect(g.primary.map((x) => x.id)).toEqual(["save"]);
    expect(g.groups.flatMap((x) => x.items).some((x) => x.kind === "primary")).toBe(false);
    expect(g.groups.map((x) => x.group)).not.toContain("go-empty");
    const none = groupedActions(headerActions(base, state));
    expect(none.groups.map((x) => x.group)).toEqual(["document", "view", "go", "help"]);
    expect(none.primary).toEqual([]);
    expect(
      groupedActions(
        [{ ...none.groups[0].items[0], group: "document" }],
        [
          { id: "document", label: "D" },
          { id: "go", label: "G" },
        ]
      ).groups.map((x) => x.group)
    ).toEqual(["document"]);
  });

  it("save: Saving… and disabled while saving, disabled when clean, enabled when dirty", () => {
    const save = (o: object) =>
      headerActions({ ...base, onsave: noop }, { ...state, ...o }).find((x) => x.id === "save")!;
    expect([save({ saving: true }).label, save({ saving: true }).enabled]).toEqual([
      "Saving…",
      false,
    ]);
    expect(save({ dirty: false }).enabled).toBe(false);
    expect(save({}).enabled).toBe(true);
    expect(headerActions(base, state).some((x) => x.id === "save")).toBe(false);
  });
});
