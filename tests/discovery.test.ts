/**
 * Unit tests for discovery.ts — blueprint↔view pairing helpers (ADR-004).
 *
 * All functions are pure; no WASM interaction. Tests cover the string-convention
 * join (`namespace` + `containerType === blueprint.name`) and edge cases.
 */

import { describe, expect, it } from "vitest";
import type { BlueprintSummary, DocumentViewSummary } from "../src/lib/srs-client.js";
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

function dv(
  namespace: string,
  containerType: string | undefined,
  id: string,
  overrides: Partial<DocumentViewSummary> = {}
): DocumentViewSummary {
  return {
    id,
    namespace,
    name: id,
    version: 1,
    description: "",
    containerType,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// documentViewsForBlueprint
// ---------------------------------------------------------------------------

describe("documentViewsForBlueprint", () => {
  it("returns views whose namespace and containerType match the blueprint", () => {
    const blueprint = bp("com.test", "guide");
    const views: DocumentViewSummary[] = [
      dv("com.test", "guide", "view-a"),
      dv("com.test", "guide", "view-b"),
      dv("com.test", "other", "view-c"),
      dv("com.other", "guide", "view-d"),
    ];

    const result = documentViewsForBlueprint(blueprint, views);

    expect(result).toHaveLength(2);
    expect(result.map((v) => v.id)).toEqual(["view-a", "view-b"]);
  });

  it("returns an empty array when no views match", () => {
    const blueprint = bp("com.test", "decision-log");
    const views: DocumentViewSummary[] = [
      dv("com.test", "guide", "view-a"),
      dv("com.other", "decision-log", "view-b"),
    ];

    expect(documentViewsForBlueprint(blueprint, views)).toEqual([]);
  });

  it("returns an empty array when the views list is empty", () => {
    const blueprint = bp("com.test", "guide");
    expect(documentViewsForBlueprint(blueprint, [])).toEqual([]);
  });

  it("excludes views whose containerType is undefined", () => {
    const blueprint = bp("com.test", "guide");
    const views: DocumentViewSummary[] = [
      dv("com.test", undefined, "view-no-container-type"),
      dv("com.test", "guide", "view-match"),
    ];

    const result = documentViewsForBlueprint(blueprint, views);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("view-match");
  });

  it("does not match when only namespace matches but containerType differs", () => {
    const blueprint = bp("com.test", "guide");
    const views: DocumentViewSummary[] = [dv("com.test", "GUIDE", "view-case")];

    expect(documentViewsForBlueprint(blueprint, views)).toEqual([]);
  });

  it("does not match when only containerType matches but namespace differs", () => {
    const blueprint = bp("com.test", "guide");
    const views: DocumentViewSummary[] = [dv("com.other", "guide", "view-ns-mismatch")];

    expect(documentViewsForBlueprint(blueprint, views)).toEqual([]);
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
