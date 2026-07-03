/**
 * Unit tests for discovery.ts — blueprint↔view pairing helpers (ADR-008).
 *
 * All functions are pure; no WASM interaction. Tests cover the UUID-chain
 * join via `rootTypeRefs` and edge cases.
 */

import { describe, expect, it } from "vitest";
import type { BlueprintSummary, DocumentViewSummary, ExactTypeRef } from "../src/lib/srs-client.js";
import { documentViewsForBlueprint, findBlueprint } from "../src/lib/discovery.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function bp(namespace: string, name: string, overrides: Partial<BlueprintSummary> = {}): BlueprintSummary {
  return {
    id: `${namespace}/${name}`,
    namespace,
    name,
    version: 1,
    description: "",
    rootTypeCount: 1,
    ...overrides,
  };
}

const GUIDE_TYPE_ID = "8f138dd6-11d2-42a5-99ec-3d6e23bed54f";
const OTHER_TYPE_ID = "aaaaaaaa-0000-0000-0000-000000000000";

function dv(
  id: string,
  rootTypeRefs: ExactTypeRef[] | undefined,
  overrides: Partial<DocumentViewSummary> = {}
): DocumentViewSummary {
  return {
    id,
    namespace: "com.mudemocracy",
    name: id,
    version: 1,
    description: "",
    rootTypeRefs,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// documentViewsForBlueprint
// ---------------------------------------------------------------------------

describe("documentViewsForBlueprint", () => {
  it("returns views whose rootTypeRefs include the given rootTypeId", () => {
    const views: DocumentViewSummary[] = [
      dv("view-a", [{ typeId: GUIDE_TYPE_ID, typeVersion: 1 }]),
      dv("view-b", [{ typeId: GUIDE_TYPE_ID, typeVersion: 1 }]),
      dv("view-c", [{ typeId: OTHER_TYPE_ID, typeVersion: 1 }]),
      dv("view-d", undefined),
    ];

    const result = documentViewsForBlueprint(GUIDE_TYPE_ID, views);

    expect(result).toHaveLength(2);
    expect(result.map((v) => v.id)).toEqual(["view-a", "view-b"]);
  });

  it("returns an empty array when no views match", () => {
    const views: DocumentViewSummary[] = [
      dv("view-a", [{ typeId: OTHER_TYPE_ID, typeVersion: 1 }]),
      dv("view-b", undefined),
    ];

    expect(documentViewsForBlueprint(GUIDE_TYPE_ID, views)).toEqual([]);
  });

  it("returns an empty array when the views list is empty", () => {
    expect(documentViewsForBlueprint(GUIDE_TYPE_ID, [])).toEqual([]);
  });

  it("excludes views with no rootTypeRefs field (undefined)", () => {
    const views: DocumentViewSummary[] = [
      dv("view-no-refs", undefined),
      dv("view-match", [{ typeId: GUIDE_TYPE_ID, typeVersion: 1 }]),
    ];

    const result = documentViewsForBlueprint(GUIDE_TYPE_ID, views);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("view-match");
  });

  it("excludes views with an empty rootTypeRefs array", () => {
    const views: DocumentViewSummary[] = [
      dv("view-empty-refs", []),
      dv("view-match", [{ typeId: GUIDE_TYPE_ID, typeVersion: 1 }]),
    ];

    const result = documentViewsForBlueprint(GUIDE_TYPE_ID, views);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("view-match");
  });

  it("excludes views with null rootTypeRefs (defensively coerced)", () => {
    const views: DocumentViewSummary[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dv("view-null-refs", null as any),
      dv("view-match", [{ typeId: GUIDE_TYPE_ID, typeVersion: 1 }]),
    ];

    const result = documentViewsForBlueprint(GUIDE_TYPE_ID, views);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("view-match");
  });

  it("matches when rootTypeRefs contains the target type among multiple entries", () => {
    const views: DocumentViewSummary[] = [
      dv("view-multi", [
        { typeId: OTHER_TYPE_ID, typeVersion: 1 },
        { typeId: GUIDE_TYPE_ID, typeVersion: 1 },
      ]),
    ];

    expect(documentViewsForBlueprint(GUIDE_TYPE_ID, views)).toHaveLength(1);
  });

  it("does not match when rootTypeRefs contains only a different typeId", () => {
    const views: DocumentViewSummary[] = [
      dv("view-mismatch", [{ typeId: OTHER_TYPE_ID, typeVersion: 1 }]),
    ];

    expect(documentViewsForBlueprint(GUIDE_TYPE_ID, views)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findBlueprint
// ---------------------------------------------------------------------------

describe("findBlueprint", () => {
  it("finds a blueprint by namespace and name", () => {
    const blueprints: BlueprintSummary[] = [
      bp("com.test", "guide"),
      bp("com.test", "decision-log"),
      bp("com.other", "guide"),
    ];

    const result = findBlueprint(blueprints, "com.test", "guide");

    expect(result).not.toBeNull();
    expect(result?.namespace).toBe("com.test");
    expect(result?.name).toBe("guide");
  });

  it("returns null when no blueprint matches", () => {
    const blueprints: BlueprintSummary[] = [bp("com.test", "guide")];

    expect(findBlueprint(blueprints, "com.test", "decision-log")).toBeNull();
  });

  it("returns null for an empty blueprint list", () => {
    expect(findBlueprint([], "com.test", "guide")).toBeNull();
  });

  it("is case-sensitive: does not match a namespace with different casing", () => {
    const blueprints: BlueprintSummary[] = [bp("com.test", "guide")];

    expect(findBlueprint(blueprints, "COM.TEST", "guide")).toBeNull();
  });

  it("is case-sensitive: does not match a name with different casing", () => {
    const blueprints: BlueprintSummary[] = [bp("com.test", "guide")];

    expect(findBlueprint(blueprints, "com.test", "Guide")).toBeNull();
  });

  it("returns the first match when duplicates exist", () => {
    const blueprints: BlueprintSummary[] = [
      bp("com.test", "guide", { id: "bp-first", version: 1 }),
      bp("com.test", "guide", { id: "bp-second", version: 2 }),
    ];

    const result = findBlueprint(blueprints, "com.test", "guide");

    expect(result?.id).toBe("bp-first");
  });
});
