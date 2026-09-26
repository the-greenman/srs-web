import { describe, expect, it } from "vitest";
import { availablePackageEditors } from "../src/lib/generic/package-editors.js";
import { DECISION_LOG_TYPE_ID, DECISION_TYPE_ID } from "../src/lib/governance/type-registry.js";

describe("availablePackageEditors", () => {
  it("offers no editors when neither contract's types are present", () => {
    expect(availablePackageEditors([], [])).toEqual([]);
  });

  it("offers Governance when the repo installs the decision type, regardless of package namespace", () => {
    // Namespaces are labels, not identity — a repo can call its package anything and
    // still qualify as long as it installs the type the governance shell depends on.
    expect(
      availablePackageEditors(
        [{ id: "pkg", namespace: "com.example.anything", name: "anything", version: "1", fieldCount: 0, typeCount: 1 }],
        [{ id: DECISION_TYPE_ID, namespace: "com.example.anything", name: "decision", version: 1 }],
      ),
    ).toEqual([{ id: "governance", label: "Governance" }]);
  });

  it("offers Governance when the repo installs the decision_log header type", () => {
    expect(
      availablePackageEditors(
        [],
        [{ id: DECISION_LOG_TYPE_ID, namespace: "com.example.anything", name: "decision_log", version: 1 }],
      ),
    ).toEqual([{ id: "governance", label: "Governance" }]);
  });

  it("does not offer Governance for an unrelated type, even under a governance-shaped namespace", () => {
    expect(
      availablePackageEditors(
        [{ id: "pkg", namespace: "com.mudemocracy.governance", name: "governance", version: "1", fieldCount: 0, typeCount: 1 }],
        [{ id: "11111111-1111-1111-1111-111111111111", namespace: "com.mudemocracy.governance", name: "unrelated", version: 1 }],
      ),
    ).toEqual([]);
  });

  it("offers Guides when the com.mudemocracy guide package and type are both present", () => {
    expect(availablePackageEditors([
      { id: "guides", namespace: "com.mudemocracy", name: "Guides", version: "1", fieldCount: 0, typeCount: 1 },
    ], [
      { id: "guide", namespace: "com.mudemocracy", name: "guide", version: 1 },
    ])).toEqual([{ id: "guides", label: "Guides" }]);
  });
});
