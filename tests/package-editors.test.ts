import { describe, expect, it } from "vitest";
import { availablePackageEditors } from "../src/lib/generic/package-editors.js";

describe("availablePackageEditors", () => {
  it("offers editors only when their engine-discovered package contract is present", () => {
    expect(availablePackageEditors([], [])).toEqual([]);
    expect(availablePackageEditors([
      { id: "governance", namespace: "com.mudemocracy.governance", name: "Governance", version: "1", fieldCount: 0, typeCount: 0 },
    ], [])).toEqual([{ id: "governance", label: "Governance" }]);
    expect(availablePackageEditors([
      { id: "guides", namespace: "com.mudemocracy", name: "Guides", version: "1", fieldCount: 0, typeCount: 1 },
    ], [
      { id: "guide", namespace: "com.mudemocracy", name: "guide", version: 1 },
    ])).toEqual([{ id: "guides", label: "Guides" }]);
  });
});
