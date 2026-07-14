/**
 * Unit tests for blueprint-utils.ts.
 *
 * Covers:
 * - definitionToFields: x-srs-field-id assertion (missing → throw, present → FieldFormDef)
 * - definitionToGroups: x-srs-field-id assertion on group item properties
 * - happy-path field ordering and attribute mapping
 */

import { describe, expect, it } from "vitest";
import type { SchemaDefinition, SchemaProperty } from "../src/lib/srs-client.js";
import { definitionToFields, definitionToGroups } from "../src/lib/guides/blueprint-utils.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function scalarProp(overrides: Partial<SchemaProperty> = {}): SchemaProperty {
  return {
    type: "string",
    title: "My Field",
    "x-srs-field-id": "aaaaaaaa-0000-4000-8000-000000000001",
    "x-srs-order": 0,
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
// definitionToFields — x-srs-field-id assertion
// ---------------------------------------------------------------------------

describe("definitionToFields", () => {
  it("throws when x-srs-field-id is absent on a property", () => {
    const def = simpleDef({
      my_field: scalarProp({ "x-srs-field-id": undefined }),
    });

    expect(() => definitionToFields(def)).toThrowError(
      /x-srs-field-id missing on schema property "my_field"/
    );
  });

  it("throws with a descriptive message including the property name", () => {
    const def = simpleDef({
      decision_statement: scalarProp({ "x-srs-field-id": undefined }),
    });

    expect(() => definitionToFields(def)).toThrowError("decision_statement");
  });

  it("succeeds and returns correct FieldFormDef when x-srs-field-id is present", () => {
    const fieldId = "aaaaaaaa-0000-4000-8000-000000000001";
    const def = simpleDef({
      my_field: scalarProp({ "x-srs-field-id": fieldId, title: "My Field" }),
    });

    const fields = definitionToFields(def);

    expect(fields).toHaveLength(1);
    expect(fields[0].fieldId).toBe(fieldId);
    expect(fields[0].name).toBe("my_field");
    expect(fields[0].label).toBe("My Field");
  });

  it("maps a select field when enum is present", () => {
    const def = simpleDef({
      status: scalarProp({
        "x-srs-field-id": "bbbbbbbb-0000-4000-8000-000000000002",
        enum: ["draft", "active", "superseded"],
      }),
    });

    const fields = definitionToFields(def);

    expect(fields[0].valueType).toBe("select");
    expect(fields[0].options).toEqual(["draft", "active", "superseded"]);
  });

  it("maps a text field when x-srs-widget is textarea", () => {
    const def = simpleDef({
      body: scalarProp({
        "x-srs-field-id": "cccccccc-0000-4000-8000-000000000003",
        "x-srs-widget": "textarea",
      }),
    });

    const fields = definitionToFields(def);

    expect(fields[0].valueType).toBe("text");
  });

  it("sorts fields by x-srs-order", () => {
    const def = simpleDef({
      second: scalarProp({
        "x-srs-field-id": "dddddddd-0000-4000-8000-000000000004",
        "x-srs-order": 2,
        title: "Second",
      }),
      first: scalarProp({
        "x-srs-field-id": "eeeeeeee-0000-4000-8000-000000000005",
        "x-srs-order": 1,
        title: "First",
      }),
    });

    const fields = definitionToFields(def);

    expect(fields.map((f) => f.name)).toEqual(["first", "second"]);
  });

  it("marks field as required when listed in def.required", () => {
    const fieldId = "ffffffff-0000-4000-8000-000000000006";
    const def = simpleDef({ my_field: scalarProp({ "x-srs-field-id": fieldId }) }, ["my_field"]);

    const fields = definitionToFields(def);

    expect(fields[0].required).toBe(true);
  });

  it("skips group properties (those with x-srs-group-id)", () => {
    const def = simpleDef({
      scalar: scalarProp({ "x-srs-field-id": "aaaaaaaa-0000-4000-8000-000000000001" }),
      items_group: {
        type: "array",
        title: "Items",
        "x-srs-group-id": "items",
        "x-srs-order": 1,
        "x-srs-repeatable": true,
        items: { type: "object", properties: {}, required: [] },
      } as unknown as SchemaProperty,
    });

    const fields = definitionToFields(def);

    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("scalar");
  });
});

// ---------------------------------------------------------------------------
// definitionToGroups — x-srs-field-id assertion on item properties
// ---------------------------------------------------------------------------

describe("definitionToGroups", () => {
  it("uses x-srs-group-id (not the property name) as groupId", () => {
    const def = simpleDef({
      items_group: {
        type: "array",
        title: "Items",
        "x-srs-group-id": "my-group-uuid",
        "x-srs-order": 0,
        "x-srs-repeatable": true,
        items: { type: "object", properties: {}, required: [] },
      } as unknown as SchemaProperty,
    });

    const groups = definitionToGroups(def);

    expect(groups[0].groupId).toBe("my-group-uuid");
  });

  it("throws when an item property is missing x-srs-field-id", () => {
    const def = simpleDef({
      items_group: {
        type: "array",
        title: "Items",
        "x-srs-group-id": "items",
        "x-srs-order": 0,
        "x-srs-repeatable": true,
        items: {
          type: "object",
          properties: {
            term: scalarProp({ "x-srs-field-id": undefined }),
          },
          required: [],
        },
      } as unknown as SchemaProperty,
    });

    expect(() => definitionToGroups(def)).toThrowError(/x-srs-field-id missing on schema property "term"/);
  });

  it("succeeds when all item properties have x-srs-field-id", () => {
    const termId = "11111111-0000-4000-8000-000000000001";
    const bodyId = "22222222-0000-4000-8000-000000000002";
    const def = simpleDef({
      items_group: {
        type: "array",
        title: "Items",
        "x-srs-group-id": "items",
        "x-srs-order": 0,
        "x-srs-repeatable": true,
        items: {
          type: "object",
          properties: {
            term: scalarProp({ "x-srs-field-id": termId, title: "Term", "x-srs-order": 0 }),
            body: scalarProp({ "x-srs-field-id": bodyId, title: "Body", "x-srs-order": 1 }),
          },
          required: ["term"],
        },
      } as unknown as SchemaProperty,
    });

    const groups = definitionToGroups(def);

    expect(groups).toHaveLength(1);
    expect(groups[0].groupId).toBe("items");
    expect(groups[0].fields).toHaveLength(2);
    expect(groups[0].fields[0].fieldId).toBe(termId);
    expect(groups[0].fields[1].fieldId).toBe(bodyId);
  });
});

// ---------------------------------------------------------------------------
// Field help text — x-srs-description / x-srs-instructions (srs-web#176)
// ---------------------------------------------------------------------------

describe("field help text mapping", () => {
  it("maps x-srs-description and x-srs-instructions onto a scalar FieldFormDef", () => {
    const def = simpleDef({
      rationale: scalarProp({
        "x-srs-field-id": "aaaaaaaa-0000-4000-8000-000000000001",
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
      plain: scalarProp({ "x-srs-field-id": "aaaaaaaa-0000-4000-8000-000000000001" }),
    });

    const [field] = definitionToFields(def);

    expect(field.description).toBeUndefined();
    expect(field.instructions).toBeUndefined();
  });

  it("maps the keys onto group sub-fields (shared propertyToField)", () => {
    const termId = "11111111-0000-4000-8000-000000000001";
    const def = simpleDef({
      items_group: {
        type: "array",
        title: "Items",
        "x-srs-group-id": "items",
        "x-srs-order": 0,
        "x-srs-repeatable": true,
        items: {
          type: "object",
          properties: {
            term: scalarProp({
              "x-srs-field-id": termId,
              title: "Term",
              "x-srs-order": 0,
              "x-srs-description": "The term being defined.",
              "x-srs-instructions": "Keep it to a short noun phrase.",
            }),
          },
          required: ["term"],
        },
      } as unknown as SchemaProperty,
    });

    const [group] = definitionToGroups(def);

    expect(group.fields[0].description).toBe("The term being defined.");
    expect(group.fields[0].instructions).toBe("Keep it to a short noun phrase.");
  });
});
