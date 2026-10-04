import { beforeEach, describe, expect, it, vi } from "vitest";
import { EDITORS, availableEditors } from "../src/lib/editors/registry.js";

const check = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/srs-client.js", () => ({ checkPackageRequirements: check }));
const repo = {} as never;
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

  beforeEach(() => {
    check.mockImplementation((_r, reqs) => reqs.map(() => ({ satisfied: true })));
  });

  it("offers nothing without an entry type, and keys on the type UUID alone", () => {
    expect(availableEditors(repo, [])).toEqual([]);
    const types = EDITORS.map((e) => ({
      id: e.entryTypeId,
      namespace: "any",
      name: "x",
      version: 1,
    }));
    expect(availableEditors(repo, types).map((o) => o.editor.id)).toEqual(EDITORS.map((e) => e.id));
    expect(
      availableEditors(repo, [{ id: "guide", namespace: "com.mudemocracy", name: "guide", version: 1 }])
    ).toEqual([]);
  });

  it("marks an editor unmet when the core says its requirement is not satisfied", () => {
    const essay = EDITORS.find((e) => e.id === "essay")!;
    check.mockReturnValue([{ satisfied: false, reason: "version-too-low", candidateVersions: ["1.0.0"] }]);
    const [offered] = availableEditors(repo, [
      { id: essay.entryTypeId, namespace: "n", name: "x", version: 1 },
    ]);
    expect(offered.unmet).toEqual({ requirement: essay.requires[0], have: "1.0.0" });
    expect(check).toHaveBeenCalledWith(repo, essay.requires);
  });

  it("an editor with no requirements is never unmet", () => {
    const guides = EDITORS.find((e) => e.id === "guides")!;
    check.mockReturnValue([]);
    const [offered] = availableEditors(repo, [
      { id: guides.entryTypeId, namespace: "n", name: "x", version: 1 },
    ]);
    expect(offered.unmet).toBeNull();
  });
});
