import { describe, expect, it } from "vitest";
import { definitionToFields } from "../src/lib/editor/blueprint-fields.js";
import type { SchemaDefinition } from "../src/lib/srs-client.js";

// srs-web#479 — a markdown-format field (contentMediaType: "text/markdown",
// emitted by srs-rust's type_schema_service.rs) must map to valueType
// "markdown", not "text", even though it also carries the shared
// x-srs-widget "textarea" hint used by plain multi-line fields.
describe("propertyToField markdown detection (srs-web#479)", () => {
  it("maps a markdown-format string field to valueType 'markdown'", () => {
    const def: SchemaDefinition = {
      type: "object",
      properties: {
        body: {
          type: "string",
          title: "Body",
          contentMediaType: "text/markdown",
          "x-srs-widget": "textarea",
          "x-srs-order": 0,
        },
      },
    };
    const [field] = definitionToFields(def);
    expect(field.valueType).toBe("markdown");
  });

  it("still maps a plain multi-line string field to valueType 'text'", () => {
    const def: SchemaDefinition = {
      type: "object",
      properties: {
        notes: {
          type: "string",
          title: "Notes",
          "x-srs-widget": "textarea",
          "x-srs-order": 0,
        },
      },
    };
    const [field] = definitionToFields(def);
    expect(field.valueType).toBe("text");
  });
});
