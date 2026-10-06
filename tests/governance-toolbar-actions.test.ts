import { describe, expect, it } from "vitest";
import { governanceActions } from "../src/lib/governance/toolbar-actions.js";
import { ShellState } from "../src/lib/shell-context.svelte.js";

const noop = () => {};
const shell = new ShellState({ wideEnabled: true });
const base = { onexport: noop, onopenanother: noop };

describe("governanceActions (#463)", () => {
  it("New {label} is the first Document item, with the governance-new-record testid", () => {
    const acts = governanceActions(
      { ...base, onsave: noop, onnew: noop, newLabel: "Article" },
      { shell, saving: false }
    );
    const doc = acts.filter((a) => a.group === "document" && a.kind !== "primary");
    expect(doc[0]).toMatchObject({
      id: "new",
      label: "New Article",
      testid: "governance-new-record",
      enabled: true,
    });
    expect(acts.filter((a) => a.kind === "primary").map((a) => a.id)).toEqual(["save"]);
  });

  it("New is absent without onnew (in a form, or no section) and disabled while saving", () => {
    expect(governanceActions(base, { shell, saving: false }).some((a) => a.id === "new")).toBe(
      false
    );
    const saving = governanceActions(
      { ...base, onnew: noop, newLabel: "X" },
      { shell, saving: true }
    );
    expect(saving.find((a) => a.id === "new")?.enabled).toBe(false);
  });
});
