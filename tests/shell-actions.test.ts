import { describe, expect, it, vi } from "vitest";
import {
  commonActions,
  exportActions,
  openAnotherAction,
  saveAction,
} from "../src/lib/components/shell-actions.js";
import { ShellState } from "../src/lib/shell-context.svelte.js";

const noop = () => {};
const base = { onexport: noop, onopenanother: noop };
const shell = new ShellState({ wideEnabled: true });

describe("shared shell actions (#463)", () => {
  it("saveAction is the save-document primary; the label follows saving, enabled is the caller's", () => {
    const run = vi.fn();
    const a = saveAction(run, { saving: false, enabled: true });
    expect([a.id, a.kind, a.group, a.testid, a.label, a.enabled]).toEqual([
      "save",
      "primary",
      "document",
      "save-document",
      "Save",
      true,
    ]);
    expect(saveAction(run, { saving: true, enabled: false })).toMatchObject({
      label: "Saving…",
      enabled: false,
    });
    a.run();
    expect(run).toHaveBeenCalled();
  });

  it("openAnotherAction is Go > Open another", () => {
    expect(openAnotherAction(noop)).toMatchObject({
      id: "other",
      group: "go",
      label: "Open another",
    });
  });

  it("exportActions offers .srsj only with its handler (default testids toolbar-export[-srsj])", () => {
    expect(exportActions({ onexport: noop }).map((a) => a.id)).toEqual(["export"]);
    const both = exportActions({ onexport: noop, onexportsrsj: noop });
    expect(both.map((a) => [a.id, a.label])).toEqual([
      ["export", "Export .srs"],
      ["export-srsj", "Export .srsj"],
    ]);
  });

  it("commonActions: save only with onsave (enabled unless saving), exports, wide, agents only with a handler, other", () => {
    const ids = (h: object, saving = false) =>
      commonActions({ ...base, ...h }, { shell, saving }).map((a) => a.id);
    expect(ids({})).toEqual(["export", "wide", "other"]);
    expect(ids({ onsave: noop, onexportsrsj: noop, onopenagents: noop })).toEqual([
      "save",
      "export",
      "export-srsj",
      "wide",
      "agents",
      "other",
    ]);
    const save = commonActions({ ...base, onsave: noop }, { shell, saving: true })[0];
    expect(save.enabled).toBe(false);
  });

  it("commonActions drops Wide for a shell without the capability", () => {
    const none = new ShellState({ wideEnabled: false });
    expect(commonActions(base, { shell: none, saving: false }).map((a) => a.id)).toEqual([
      "export",
      "other",
    ]);
  });
});
