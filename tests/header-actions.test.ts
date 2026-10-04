import { describe, expect, it, vi } from "vitest";
import { HEADER_GROUPS, headerActions } from "../src/lib/essay/header-actions.js";
import { ShellState } from "../src/lib/shell-context.svelte.js";

const noop = () => {};
const base = {
  onnew: noop,
  onhelp: noop,
  oncomments: noop,
  onexport: noop,
  onopenanother: noop,
};
const shell = new ShellState({ wideEnabled: true });
const state = { shell, comments: "none" as const, saving: false, dirty: true };

describe("headerActions (srs-web#383)", () => {
  it("lists the always-present actions in desktop order", () => {
    expect(headerActions(base, state).map((a) => a.id)).toEqual([
      "new",
      "export",
      "wide",
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
      "wide",
      "comments",
      "explorer",
      "other",
      "help",
    ]);
  });

  it("carries toggle state and the saving label, and runs the handler", () => {
    const onsave = vi.fn();
    const onShell = new ShellState({ wideEnabled: true });
    onShell.wide = true;
    const a = headerActions(
      { ...base, onsave },
      { shell: onShell, comments: "all" as const, saving: true, dirty: true }
    );
    expect(a.find((x) => x.id === "wide")?.checked).toBe(true);
    expect(a.find((x) => x.id === "comments")?.checked).toBe(true);
    const save = a.find((x) => x.id === "save")!;
    expect([save.label, save.enabled]).toEqual(["Saving…", false]);
    save.run();
    expect(onsave).toHaveBeenCalledOnce();
  });

  it("the Wide item is hidden when the shell has no Wide capability", () => {
    const off = { ...state, shell: new ShellState({ wideEnabled: false }) };
    expect(headerActions(base, off).some((a) => a.id === "wide")).toBe(false);
  });

  it("Wide is the shared action: label, testid and run toggles the shell", () => {
    const w = headerActions(base, state).find((a) => a.id === "wide")!;
    expect([w.label, w.testid, w.kind, w.group]).toEqual([
      "Wide",
      "margin-variant",
      "toggle",
      "view",
    ]);
    w.run();
    expect(shell.wide).toBe(true);
    shell.wide = false;
  });

  it("adds Copy for agent only when its handler exists", () => {
    expect(headerActions(base, state).some((a) => a.id === "agent")).toBe(false);
    const onagent = vi.fn();
    const a = headerActions({ ...base, onagent }, state).find((x) => x.id === "agent")!;
    a.run();
    expect([a.label, onagent.mock.calls.length]).toEqual(["Copy for agent", 1]);
  });

  it("every action names a known group, toggles carry checked, mixed maps through, ids are unique", () => {
    const a = headerActions(
      { ...base, oncopy: noop, onagent: noop, onexportmd: noop, onexplorer: noop, onsave: noop },
      { ...state, comments: "mixed" }
    );
    const groups = HEADER_GROUPS.map((g) => g.id) as string[];
    expect(a.every((x) => groups.includes(x.group))).toBe(true);
    expect(a.filter((x) => x.group === "view").map((x) => [x.id, x.kind])).toEqual([
      ["wide", "toggle"],
      ["comments", "toggle"],
    ]);
    expect(a.filter((x) => x.kind === "primary").map((x) => x.id)).toEqual(["save"]);
    expect(a.find((x) => x.id === "comments")?.checked).toBe("mixed");
    expect(a.find((x) => x.id === "wide")?.checked).toBe(false);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(headerActions(base, state).some((x) => x.group === "go" && x.id === "explorer")).toBe(
      false
    );
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
