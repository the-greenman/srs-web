/**
 * Unit tests for relation-type-utils.ts — pure srsj relation-type parser.
 *
 * Covers `parseRelationTypesFromSrsj`, which extracts installed relation type
 * definitions from a raw srsj export object (srs-web#160 interim fix; see
 * ADR-001 residual debt and srs-rust#411 for the planned WASM binding).
 */

import { describe, expect, it } from "vitest";
import { parseRelationTypesFromSrsj } from "../src/lib/governance/relation-type-utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal srsj structure with a package entry and named relation type entries. */
function buildSrsj(
  relationTypeDefs: Array<{ key: string; label?: string; filename: string }>
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "package/package.json": {
      relationTypes: relationTypeDefs.map((rt) => `relation-types/${rt.filename}`),
    },
  };
  for (const rt of relationTypeDefs) {
    data[`package/relation-types/${rt.filename}`] = {
      key: rt.key,
      ...(rt.label !== undefined ? { label: rt.label } : {}),
    };
  }
  return { data };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseRelationTypesFromSrsj", () => {
  it("returns all 4 gallery relation types with correct value and label", () => {
    const raw = buildSrsj([
      { key: "delegates", label: "Delegates", filename: "delegates.json" },
      { key: "derived-from", label: "Derived From", filename: "derived-from.json" },
      { key: "evidences", label: "Evidences", filename: "evidences.json" },
      { key: "precedes", label: "Precedes", filename: "precedes.json" },
    ]);
    const result = parseRelationTypesFromSrsj(raw);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.value)).toEqual([
      "delegates",
      "derived-from",
      "evidences",
      "precedes",
    ]);
    expect(result.map((r) => r.label)).toEqual([
      "Delegates",
      "Derived From",
      "Evidences",
      "Precedes",
    ]);
  });

  it("falls back to key as label when label field is absent", () => {
    const raw = buildSrsj([
      { key: "precedes", filename: "precedes.json" }, // no label
    ]);
    const result = parseRelationTypesFromSrsj(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ value: "precedes", label: "precedes" });
  });

  it("returns empty array when data has no package.json entry", () => {
    const result = parseRelationTypesFromSrsj({ data: {} });
    expect(result).toEqual([]);
  });

  it("returns empty array when package has no relationTypes field", () => {
    const result = parseRelationTypesFromSrsj({
      data: { "package/package.json": {} },
    });
    expect(result).toEqual([]);
  });

  it("returns empty array when package has empty relationTypes array", () => {
    const result = parseRelationTypesFromSrsj({
      data: { "package/package.json": { relationTypes: [] } },
    });
    expect(result).toEqual([]);
  });

  it("skips entries whose data object is missing (path not in data)", () => {
    const raw = {
      data: {
        "package/package.json": {
          relationTypes: [
            "relation-types/precedes.json",
            "relation-types/missing.json",
          ],
        },
        "package/relation-types/precedes.json": { key: "precedes", label: "Precedes" },
        // "package/relation-types/missing.json" is absent
      },
    };
    const result = parseRelationTypesFromSrsj(raw);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("precedes");
  });

  it("skips entries whose data object lacks a key field", () => {
    const raw = {
      data: {
        "package/package.json": {
          relationTypes: ["relation-types/bad.json"],
        },
        "package/relation-types/bad.json": { label: "No key here" }, // no `key`
      },
    };
    const result = parseRelationTypesFromSrsj(raw);
    expect(result).toEqual([]);
  });

  it("returns empty array when raw is empty object", () => {
    const result = parseRelationTypesFromSrsj({});
    expect(result).toEqual([]);
  });

  it("does NOT include hardcoded types supersedes or depends-on from gallery", () => {
    const raw = buildSrsj([
      { key: "delegates", label: "Delegates", filename: "delegates.json" },
      { key: "derived-from", label: "Derived From", filename: "derived-from.json" },
      { key: "evidences", label: "Evidences", filename: "evidences.json" },
      { key: "precedes", label: "Precedes", filename: "precedes.json" },
    ]);
    const result = parseRelationTypesFromSrsj(raw);
    const values = result.map((r) => r.value);
    expect(values).not.toContain("supersedes");
    expect(values).not.toContain("depends-on");
  });
});
