/**
 * Unit tests for findFieldId in field-utils.ts (srs-web#86).
 */

import { describe, expect, it } from "vitest";
import { findFieldId } from "../src/lib/governance/field-utils.js";
import type { FieldFormDef } from "../src/lib/governance/types.js";

function makeMap(entries: Array<{ fieldId: string; name: string }>): Map<string, FieldFormDef> {
  const map = new Map<string, FieldFormDef>();
  for (const { fieldId, name } of entries) {
    map.set(fieldId, {
      fieldId,
      name,
      label: name,
      valueType: "string",
      required: false,
    });
  }
  return map;
}

describe("findFieldId", () => {
  it("returns the fieldId for a field whose name matches", () => {
    const map = makeMap([
      { fieldId: "aee7afe9-6650-5fa4-a61a-495c3b88994b", name: "status" },
      { fieldId: "d7e82557-9045-5e92-a494-d99112bbec4a", name: "title" },
    ]);
    expect(findFieldId("status", map)).toBe("aee7afe9-6650-5fa4-a61a-495c3b88994b");
  });

  it("returns undefined when the field name is not in the map", () => {
    const map = makeMap([
      { fieldId: "d7e82557-9045-5e92-a494-d99112bbec4a", name: "title" },
    ]);
    expect(findFieldId("status", map)).toBeUndefined();
  });

  it("returns undefined for an empty map", () => {
    expect(findFieldId("status", new Map())).toBeUndefined();
  });
});
