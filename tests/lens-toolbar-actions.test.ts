import { describe, expect, it } from "vitest";
import { lensActions } from "../src/lib/lens/toolbar-actions.js";
import { ShellState } from "../src/lib/shell-context.svelte.js";

const noop = () => {};
const base = { onexport: noop, onopenanother: noop, onopenexplorer: noop };
const ids = (a: { id: string }[]) => a.map((x) => x.id);

describe("lensActions", () => {
  it("Explorer is in Go", () => {
    const a = lensActions(base, { shell: new ShellState({ wideEnabled: true }), saving: false, dirty: false });
    expect(a.find((x) => x.id === "explorer")).toMatchObject({ group: "go", label: "Explorer" });
  });

  it("Save absent when read-only", () => {
    const shell = new ShellState({ wideEnabled: true });
    expect(ids(lensActions({ ...base, onsavecopy: noop }, { shell, saving: false, dirty: true }))).not.toContain("save");
    const writable = lensActions({ ...base, onsave: noop }, { shell, saving: false, dirty: true });
    expect(writable.find((x) => x.id === "save")).toMatchObject({ kind: "primary", enabled: true });
  });

  it("Save a copy present only when read-only", () => {
    const shell = new ShellState({ wideEnabled: true });
    expect(ids(lensActions({ ...base, onsave: noop }, { shell, saving: false, dirty: false }))).not.toContain("save-copy");
    expect(lensActions({ ...base, onsavecopy: noop }, { shell, saving: false, dirty: false }).find((x) => x.id === "save-copy")).toMatchObject({
      group: "document",
    });
  });

  it("Wide toggles shell", () => {
    const shell = new ShellState({ wideEnabled: true });
    const wide = lensActions(base, { shell, saving: false, dirty: false }).find((x) => x.id === "wide");
    expect(wide).toBeDefined();
    const before = shell.wide;
    wide?.run();
    expect(shell.wide).toBe(!before);
  });
});
