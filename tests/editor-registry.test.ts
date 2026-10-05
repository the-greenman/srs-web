import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EDITORS,
  availableEditors,
  creatableEditors,
  usableEditor,
} from "../src/lib/editors/registry.js";

const ESSAY_PACKAGE_ID = "5b14a4d4-ec08-4e5b-be75-c183aec90c40";
const check = vi.hoisted(() => vi.fn());
const bundled = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/srs-client.js", () => ({
  checkPackageRequirements: check,
  REQUIREMENT_MISSING: "missing",
  REQUIREMENT_VERSION_TOO_LOW: "version-too-low",
}));
vi.mock("../src/lib/packages/bundles.js", () => ({ bundledPackage: bundled }));
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
    // only essay is pinned (governance and guides wait on srs#390)
    bundled.mockImplementation((id) => (id === ESSAY_PACKAGE_ID ? "bundle-text" : undefined));
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
      availableEditors(repo, [
        { id: "guide", namespace: "com.mudemocracy", name: "guide", version: 1 },
      ])
    ).toEqual([]);
  });

  it("marks an editor unmet when the core says its requirement is not satisfied", () => {
    const essay = EDITORS.find((e) => e.id === "essay")!;
    check.mockReturnValue([
      { satisfied: false, reason: "version-too-low", candidateVersions: ["1.0.0"] },
    ]);
    const [offered] = availableEditors(repo, [
      { id: essay.entryTypeId, namespace: "n", name: "x", version: 1 },
    ]);
    expect(offered.unmet).toEqual({
      requirement: essay.requires[0],
      reason: "Needs essay package 1.3.0 (you have 1.0.0)",
      install: undefined,
      upgrade: [essay.requires[0]],
    });
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

  it("fails closed when the check throws: editors with requirements are unmet, others are not", () => {
    check.mockImplementation(() => {
      throw new Error("boom");
    });
    const offered = availableEditors(
      repo,
      EDITORS.map((e) => ({ id: e.entryTypeId, namespace: "n", name: "x", version: 1 }))
    );
    for (const o of offered) {
      expect(o.unmet?.reason ?? null).toBe(
        o.editor.requires.length ? "Could not check package requirements" : null
      );
    }
    expect(offered.some((o) => o.unmet)).toBe(true);
  });

  it("lists every installed version in the core's order, skipping unknown ones", () => {
    const essay = EDITORS.find((e) => e.id === "essay")!;
    check.mockReturnValue([{ satisfied: false, candidateVersions: ["1.1.0", null, "1.0.0"] }]);
    const [o] = availableEditors(repo, [
      { id: essay.entryTypeId, namespace: "n", name: "x", version: 1 },
    ]);
    expect(o.unmet?.reason).toBe("Needs essay package 1.3.0 (you have 1.1.0, 1.0.0)");
  });

  it("the shell gate refuses an unmet editor even when the mode names it", () => {
    const essay = EDITORS.find((e) => e.id === "essay")!;
    const guides = EDITORS.find((e) => e.id === "guides")!;
    const offered = [
      { editor: essay, unmet: { reason: "Needs essay package 1.3.0" } },
      { editor: guides, unmet: null },
    ];
    expect(usableEditor(offered, "essay")).toBeNull();
    expect(usableEditor(offered, "guides")).toBe(guides);
    expect(usableEditor(offered, "absent")).toBeNull();
    expect(usableEditor(offered, "generic")).toBeNull();
  });

  describe("install (R1, R2)", () => {
    const essay = EDITORS.find((e) => e.id === "essay")!;
    const present = [{ id: essay.entryTypeId, namespace: "n", name: "x", version: 1 }];

    it("a missing requirement with a bundle is installable", () => {
      check.mockReturnValue([{ satisfied: false, reason: "missing", candidateVersions: [] }]);
      const [o] = availableEditors(repo, present);
      expect(o.unmet?.install).toEqual(essay.requires);
    });

    it("a missing requirement with no bundle is blocked", () => {
      bundled.mockReturnValue(undefined);
      check.mockReturnValue([{ satisfied: false, reason: "missing" }]);
      const [o] = availableEditors(repo, present);
      expect(o.unmet?.install).toBeUndefined();
      expect(availableEditors(repo, [])).toEqual([]);
    });

    it.each(["version-too-low", "incompatible", "prerelease-excluded", "version-unknown"])(
      "%s is never installed over",
      (reason) => {
        check.mockReturnValue([{ satisfied: false, reason, candidateVersions: ["1.0.0"] }]);
        const [o] = availableEditors(repo, present);
        expect(o.unmet?.install).toBeUndefined();
        expect(o.unmet?.reason).toContain("Needs essay");
      }
    );

    it("a thrown check is fail-closed, never installable", () => {
      check.mockImplementation(() => {
        throw new Error("boom");
      });
      const [o] = availableEditors(repo, present);
      expect(o.unmet?.install).toBeUndefined();
    });

    it("a mix of missing and outdated is blocked, with no install", () => {
      const two = [essay.requires[0], { ...essay.requires[0], packageId: "other" }];
      const real = essay.requires;
      essay.requires = two;
      try {
        check.mockReturnValue([
          { satisfied: false, reason: "missing" },
          { satisfied: false, reason: "version-too-low" },
        ]);
        const [o] = availableEditors(repo, present);
        expect(o.unmet?.install).toBeUndefined();
      } finally {
        essay.requires = real;
      }
    });

    it("an absent entry type is offered only when installable", () => {
      check.mockReturnValue([{ satisfied: false, reason: "missing" }]);
      expect(availableEditors(repo, []).map((o) => o.editor.id)).toEqual(["essay"]);
      check.mockReturnValue([{ satisfied: false, reason: "incompatible" }]);
      expect(availableEditors(repo, [])).toEqual([]);
    });
  });

  describe("upgrade (#450)", () => {
    const essay = EDITORS.find((e) => e.id === "essay")!;
    const present = [{ id: essay.entryTypeId, namespace: "n", name: "x", version: 1 }];

    it("version-too-low with a bundle is upgradable, not installable", () => {
      check.mockReturnValue([
        { satisfied: false, reason: "version-too-low", candidateVersions: ["1.2.0"] },
      ]);
      const [o] = availableEditors(repo, present);
      expect(o.unmet?.upgrade).toEqual(essay.requires);
      expect(o.unmet?.install).toBeUndefined();
    });

    it("version-too-low with no bundle is blocked", () => {
      bundled.mockReturnValue(undefined);
      check.mockReturnValue([{ satisfied: false, reason: "version-too-low" }]);
      expect(availableEditors(repo, present)[0].unmet?.upgrade).toBeUndefined();
    });

    it.each(["incompatible", "prerelease-excluded", "version-unknown", "missing"])(
      "%s is never upgraded",
      (reason) => {
        check.mockReturnValue([{ satisfied: false, reason }]);
        expect(availableEditors(repo, present)[0].unmet?.upgrade).toBeUndefined();
      }
    );

    it("a mix of missing and outdated is blocked: neither install nor upgrade", () => {
      const real = essay.requires;
      essay.requires = [real[0], { ...real[0], packageId: "other" }];
      bundled.mockImplementation((id) => (id === "other" || id === ESSAY_PACKAGE_ID ? "bundle-text" : undefined));
      try {
        check.mockReturnValue([
          { satisfied: false, reason: "missing" },
          { satisfied: false, reason: "version-too-low" },
        ]);
        const o = availableEditors(repo, present).find((x) => x.editor.id === "essay")!;
        expect(o.unmet?.install).toBeUndefined();
        expect(o.unmet?.upgrade).toBeUndefined();
      } finally {
        essay.requires = real;
      }
    });

    it("an absent entry type is not offered for an upgrade", () => {
      check.mockReturnValue([{ satisfied: false, reason: "version-too-low" }]);
      expect(availableEditors(repo, [])).toEqual([]);
    });
  });

  it("creatableEditors lists seeded editors and fully bundled ones", () => {
    expect(creatableEditors().map((e) => e.id)).toEqual(["governance", "essay"]);
    bundled.mockReturnValue(undefined);
    expect(creatableEditors().map((e) => e.id)).toEqual(["governance"]);
  });
});
