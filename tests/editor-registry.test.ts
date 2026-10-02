import { describe, expect, it } from "vitest";
import { EDITORS, availableEditors } from "../src/lib/editors/registry.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("editor registry", () => {
  it("has unique ids and UUID identities for every definition", () => {
    expect(new Set(EDITORS.map((e) => e.id)).size).toBe(EDITORS.length);
    for (const e of EDITORS) {
      expect(e.entryTypeId).toMatch(UUID);
      expect(e.component).toBeTruthy();
      for (const r of e.requires) expect(r.packageId).toMatch(UUID);
    }
  });

  it("offers nothing without an entry type, and keys on the type UUID alone", () => {
    expect(availableEditors([])).toEqual([]);
    const types = EDITORS.map((e) => ({
      id: e.entryTypeId,
      namespace: "any",
      name: "x",
      version: 1,
    }));
    expect(availableEditors(types).map((e) => e.id)).toEqual(EDITORS.map((e) => e.id));
    expect(
      availableEditors([{ id: "guide", namespace: "com.mudemocracy", name: "guide", version: 1 }])
    ).toEqual([]);
  });
});
