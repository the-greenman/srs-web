/**
 * Unit tests for buildFieldMetaMap in field-meta.ts (srs-web#55).
 * Pure function — no Svelte context required.
 */

import { describe, expect, it } from "vitest";
import { buildFieldMetaMap } from "../src/lib/governance/field-meta.js";
import type { TypeFormDef } from "../src/lib/governance/types.js";

function makeSchema(
  typeName: string,
  fields: Array<{ fieldId: string; name: string; label: string }>,
): TypeFormDef {
  return {
    typeId: `type-${typeName}`,
    typeVersion: 1,
    typeNamespace: "governance",
    typeName,
    label: typeName,
    fields: fields.map((f) => ({
      fieldId: f.fieldId,
      name: f.name,
      label: f.label,
      valueType: "string" as const,
      required: false,
    })),
  };
}

describe("buildFieldMetaMap", () => {
  it("returns empty map for empty schemas", () => {
    const map = buildFieldMetaMap({});
    expect(map.size).toBe(0);
  });

  it("includes all fields from a single schema", () => {
    const schema = makeSchema("article", [
      { fieldId: "uuid-title", name: "title", label: "Title" },
      { fieldId: "uuid-body", name: "article_text", label: "Article Text" },
    ]);
    const map = buildFieldMetaMap({ articles: schema });
    expect(map.size).toBe(2);
    expect(map.get("uuid-title")?.name).toBe("title");
    expect(map.get("uuid-body")?.name).toBe("article_text");
  });

  it("merges fields from multiple schemas", () => {
    const articles = makeSchema("article", [
      { fieldId: "uuid-title", name: "title", label: "Title" },
      { fieldId: "uuid-body", name: "article_text", label: "Article Text" },
    ]);
    const decisions = makeSchema("decision", [
      { fieldId: "uuid-title", name: "title", label: "Title" },
      { fieldId: "uuid-stmt", name: "decision_statement", label: "Decision Statement" },
    ]);
    const map = buildFieldMetaMap({ articles, decisions });
    // uuid-title appears in both schemas (shared field) — 3 unique fieldIds total
    expect(map.size).toBe(3);
    expect(map.get("uuid-title")?.label).toBe("Title");
    expect(map.get("uuid-stmt")?.name).toBe("decision_statement");
  });

  it("last-write-wins for shared fieldIds with identical metadata (shared fields)", () => {
    const a = makeSchema("a", [{ fieldId: "shared", name: "title", label: "Title" }]);
    const b = makeSchema("b", [{ fieldId: "shared", name: "title", label: "Title" }]);
    const map = buildFieldMetaMap({ a, b });
    expect(map.size).toBe(1);
    expect(map.get("shared")?.name).toBe("title");
  });
});
