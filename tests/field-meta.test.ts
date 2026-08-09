/**
 * Unit tests for buildFieldMetaMap in field-meta.ts (srs-web#55).
 * Pure function — no Svelte context required.
 * Post-RFC-039 the map is keyed by field NAME (the carrier key).
 */

import { describe, expect, it } from "vitest";
import { buildFieldMetaMap } from "../src/lib/governance/field-meta.js";
import type { TypeFormDef } from "../src/lib/governance/types.js";

function makeSchema(
  typeName: string,
  fields: Array<{ name: string; label: string }>,
): TypeFormDef {
  return {
    typeId: `type-${typeName}`,
    typeVersion: 1,
    typeNamespace: "governance",
    typeName,
    label: typeName,
    fields: fields.map((f) => ({
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

  it("includes all fields from a single schema, keyed by name", () => {
    const schema = makeSchema("article", [
      { name: "title", label: "Title" },
      { name: "article_text", label: "Article Text" },
    ]);
    const map = buildFieldMetaMap({ articles: schema });
    expect(map.size).toBe(2);
    expect(map.get("title")?.label).toBe("Title");
    expect(map.get("article_text")?.label).toBe("Article Text");
  });

  it("merges fields from multiple schemas", () => {
    const articles = makeSchema("article", [
      { name: "title", label: "Title" },
      { name: "article_text", label: "Article Text" },
    ]);
    const decisions = makeSchema("decision", [
      { name: "title", label: "Title" },
      { name: "decision_statement", label: "Decision Statement" },
    ]);
    const map = buildFieldMetaMap({ articles, decisions });
    // "title" appears in both schemas (shared field) — 3 unique names total
    expect(map.size).toBe(3);
    expect(map.get("title")?.label).toBe("Title");
    expect(map.get("decision_statement")?.label).toBe("Decision Statement");
  });

  it("last-write-wins for shared names with identical metadata (shared fields)", () => {
    const a = makeSchema("a", [{ name: "title", label: "Title" }]);
    const b = makeSchema("b", [{ name: "title", label: "Title" }]);
    const map = buildFieldMetaMap({ a, b });
    expect(map.size).toBe(1);
    expect(map.get("title")?.label).toBe("Title");
  });
});
