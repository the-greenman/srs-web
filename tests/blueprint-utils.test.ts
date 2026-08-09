/**
 * Unit tests for blueprint-utils.ts (RFC-039 carrier).
 *
 * Covers:
 * - definitionToFields: scalar mapping, ordering, required, optional x-srs-field-id
 * - definitionToComposites: composite-range list fields detected via items.properties
 * - field help text mapping (x-srs-description / x-srs-instructions)
 */

import { describe, expect, it } from "vitest";
import type { SchemaDefinition, SchemaProperty } from "../src/lib/srs-client.js";
import {
  definitionToComposites,
  definitionToFields,
  sectionTypes,
} from "../src/lib/guides/blueprint-utils.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function scalarProp(overrides: Partial<SchemaProperty> = {}): SchemaProperty {
  return {
    type: "string",
    title: "My Field",
    "x-srs-order": 0,
    ...overrides,
  } as SchemaProperty;
}

function compositeProp(
  itemProps: Record<string, SchemaProperty>,
  itemRequired: string[] = [],
  overrides: Partial<SchemaProperty> = {}
): SchemaProperty {
  return {
    type: "array",
    title: "Tables",
    "x-srs-order": 0,
    items: {
      type: "object",
      properties: itemProps,
      required: itemRequired,
      "x-srs-range-type-id": "c0d400fa-0d59-4414-963e-7f2f80fe2a9b",
      "x-srs-range-type-version": 1,
    },
    ...overrides,
  } as SchemaProperty;
}

function simpleDef(props: Record<string, SchemaProperty>, required: string[] = []): SchemaDefinition {
  return {
    type: "object",
    properties: props,
    required,
  } as unknown as SchemaDefinition;
}

// ---------------------------------------------------------------------------
// definitionToFields
// ---------------------------------------------------------------------------

describe("definitionToFields", () => {
  it("does not require x-srs-field-id (optional post-RFC-039)", () => {
    const def = simpleDef({ my_field: scalarProp() });

    const fields = definitionToFields(def);

    expect(fields).toHaveLength(1);
    expect(fields[0].fieldId).toBeUndefined();
    expect(fields[0].name).toBe("my_field");
  });

  it("passes x-srs-field-id through when present", () => {
    const fieldId = "aaaaaaaa-0000-4000-8000-000000000001";
    const def = simpleDef({
      my_field: scalarProp({ "x-srs-field-id": fieldId, title: "My Field" }),
    });

    const fields = definitionToFields(def);

    expect(fields[0].fieldId).toBe(fieldId);
    expect(fields[0].name).toBe("my_field");
    expect(fields[0].label).toBe("My Field");
  });

  it("maps a select field when enum is present", () => {
    const def = simpleDef({
      status: scalarProp({ enum: ["draft", "active", "superseded"] }),
    });

    const fields = definitionToFields(def);

    expect(fields[0].valueType).toBe("select");
    expect(fields[0].options).toEqual(["draft", "active", "superseded"]);
  });

  it("maps a text field when x-srs-widget is textarea", () => {
    const def = simpleDef({
      body: scalarProp({ "x-srs-widget": "textarea" }),
    });

    const fields = definitionToFields(def);

    expect(fields[0].valueType).toBe("text");
  });

  it("maps a url field when format is uri", () => {
    const def = simpleDef({
      external_links: scalarProp({ format: "uri" }),
    });

    const fields = definitionToFields(def);

    expect(fields[0].valueType).toBe("url");
  });

  it("sorts fields by x-srs-order", () => {
    const def = simpleDef({
      second: scalarProp({ "x-srs-order": 2, title: "Second" }),
      first: scalarProp({ "x-srs-order": 1, title: "First" }),
    });

    const fields = definitionToFields(def);

    expect(fields.map((f) => f.name)).toEqual(["first", "second"]);
  });

  it("marks field as required when listed in def.required", () => {
    const def = simpleDef({ my_field: scalarProp() }, ["my_field"]);

    const fields = definitionToFields(def);

    expect(fields[0].required).toBe(true);
  });

  it("skips composite properties (arrays of objects)", () => {
    const def = simpleDef({
      scalar: scalarProp(),
      tables: compositeProp({ rows: scalarProp({ title: "Rows" }) }, ["rows"], { "x-srs-order": 1 }),
    });

    const fields = definitionToFields(def);

    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("scalar");
  });

  it("keeps scalar list fields (array without items.properties) as flat fields", () => {
    const def = simpleDef({
      links: { type: "array", title: "Links", items: { type: "string" } } as SchemaProperty,
    });

    const fields = definitionToFields(def);

    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("links");
  });
});

// ---------------------------------------------------------------------------
// definitionToComposites
// ---------------------------------------------------------------------------

describe("definitionToComposites", () => {
  it("uses the property name as the carrier key", () => {
    const def = simpleDef({
      tables: compositeProp({}),
    });

    const composites = definitionToComposites(def);

    expect(composites).toHaveLength(1);
    expect(composites[0].name).toBe("tables");
    expect(composites[0].label).toBe("Tables");
  });

  it("builds ordered sub-fields from items.properties with items.required", () => {
    const def = simpleDef({
      items: compositeProp(
        {
          "item-term": scalarProp({ title: "Term", "x-srs-order": 0 }),
          "item-body": scalarProp({ title: "Body", "x-srs-order": 1 }),
        },
        ["item-body"],
        { title: "Items" }
      ),
    });

    const [composite] = definitionToComposites(def);

    expect(composite.fields.map((f) => f.name)).toEqual(["item-term", "item-body"]);
    expect(composite.fields[0].required).toBe(false);
    expect(composite.fields[1].required).toBe(true);
  });

  it("ignores scalar and scalar-list properties", () => {
    const def = simpleDef({
      heading: scalarProp(),
      links: { type: "array", items: { type: "string" } } as SchemaProperty,
    });

    expect(definitionToComposites(def)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sectionTypes — version resolution
// ---------------------------------------------------------------------------

describe("sectionTypes version resolution", () => {
  const typeId = "d8d09d3b-8253-4d8d-b187-42f35c8446a7";
  const schema = {
    properties: {
      contains: { items: { oneOf: [{ $ref: `#/definitions/${typeId}` }] } },
    },
    definitions: {
      [typeId]: simpleDef({ heading: scalarProp() }, ["heading"]),
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal fixture
  } as any;

  it("resolves typeVersion from the provided map", () => {
    const [st] = sectionTypes(schema, new Map([[typeId, 2]]));
    expect(st.typeVersion).toBe(2);
  });

  it("falls back to 1 when no map entry exists", () => {
    const [st] = sectionTypes(schema);
    expect(st.typeVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Field help text — x-srs-description / x-srs-instructions (srs-web#176)
// ---------------------------------------------------------------------------

describe("field help text mapping", () => {
  it("maps x-srs-description and x-srs-instructions onto a scalar FieldFormDef", () => {
    const def = simpleDef({
      rationale: scalarProp({
        "x-srs-description": "Why this option over the alternatives.",
        "x-srs-instructions": "Say what made this the right choice, in 2–4 sentences.",
      }),
    });

    const [field] = definitionToFields(def);

    expect(field.description).toBe("Why this option over the alternatives.");
    expect(field.instructions).toBe("Say what made this the right choice, in 2–4 sentences.");
  });

  it("leaves description/instructions undefined when the keys are absent", () => {
    const def = simpleDef({
      plain: scalarProp(),
    });

    const [field] = definitionToFields(def);

    expect(field.description).toBeUndefined();
    expect(field.instructions).toBeUndefined();
  });

  it("maps the keys onto composite sub-fields (shared propertyToField)", () => {
    const def = simpleDef({
      items: compositeProp(
        {
          term: scalarProp({
            title: "Term",
            "x-srs-order": 0,
            "x-srs-description": "The term being defined.",
            "x-srs-instructions": "Keep it to a short noun phrase.",
          }),
        },
        ["term"]
      ),
    });

    const [composite] = definitionToComposites(def);

    expect(composite.fields[0].description).toBe("The term being defined.");
    expect(composite.fields[0].instructions).toBe("Keep it to a short noun phrase.");
  });
});
