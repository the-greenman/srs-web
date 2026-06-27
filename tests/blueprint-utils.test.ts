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
