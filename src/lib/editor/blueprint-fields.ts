/**
 * blueprint-fields.ts — generic conversion from blueprint/type JSON Schema
 * output into `FieldFormDef[]` / `CompositeFormDef[]` for `SectionForm` /
 * `RecordForm`. Moved out of `src/lib/guides/blueprint-utils.ts` (srs-web#322)
 * so both the guides editor and the generic blueprint document editor share
 * one implementation — no SRS semantics, purely structural metadata conversion.
 *
 * ADR-001: zero SRS semantics in TypeScript. All validation stays in WASM.
 */

import type { FieldFormDef } from "$lib/governance/types.js";
import type { BlueprintSchema, SchemaDefinition, SchemaProperty } from "$lib/srs-client.js";

/**
 * Extract the definition UUID from a JSON Schema `$ref` string.
 * e.g. `#/definitions/4408a98e-...` → `4408a98e-...`
 */
export function refToTypeId(ref: string): string {
  return ref.replace(/^#\/definitions\//, "");
}

/**
 * A composite-range list field (RFC-039) derived from a type definition:
 * `record.fieldValues[name]` is an array of sub-field-name-keyed objects.
 * Sub-field metadata comes from the projected schema's `items.properties`.
 */
export interface CompositeFormDef {
  /** Carrier key into `fieldValues` (e.g. "tables", "items"). */
  name: string;
  label: string;
  order: number;
  fields: FieldFormDef[];
}

/**
 * A composite-range field (RFC-039) projects as an array of objects — detected
 * by `items.properties` — and is edited by the composite editor, not a flat input.
 */
function isComposite(prop: SchemaProperty): boolean {
  return prop.items?.properties != null;
}

/** Map a single scalar schema property to a FieldFormDef. */
function propertyToField(name: string, prop: SchemaProperty, required: boolean): FieldFormDef {
  let valueType: FieldFormDef["valueType"];
  if (prop.enum) {
    valueType = "select";
  } else if (prop["x-srs-widget"] === "textarea") {
    valueType = "text";
  } else if (prop.format === "uri" || prop.items?.format === "uri") {
    // A list-cardinality url field projects as an array of uri-format strings.
    valueType = "url";
  } else {
    valueType = "string";
  }
  return {
    fieldId: prop["x-srs-field-id"],
    label: prop.title || name,
    valueType,
    required,
    options: prop.enum,
    name,
    aiGuidance: prop["x-srs-ai-guidance"]?.purpose || undefined,
    description: prop["x-srs-description"] || undefined,
    instructions: prop["x-srs-instructions"] || undefined,
  };
}

/** Convert a schema definition's flat (non-composite) properties into FieldFormDef[], sorted by `x-srs-order`. */
export function definitionToFields(def: SchemaDefinition): FieldFormDef[] {
  return Object.entries(def.properties)
    .filter(([, prop]) => !isComposite(prop))
    .sort(([, a], [, b]) => (a["x-srs-order"] ?? 0) - (b["x-srs-order"] ?? 0))
    .map(([name, prop]) => propertyToField(name, prop, def.required?.includes(name) ?? false));
}

/** Extract composite-range list fields (arrays of objects) from a definition. */
export function definitionToComposites(def: SchemaDefinition): CompositeFormDef[] {
  return Object.entries(def.properties)
    .filter(([, prop]) => isComposite(prop))
    .sort(([, a], [, b]) => (a["x-srs-order"] ?? 0) - (b["x-srs-order"] ?? 0))
    .map(([name, prop]) => {
      const itemProps = prop.items?.properties ?? {};
      const itemRequired = prop.items?.required ?? [];
      const fields = Object.entries(itemProps)
        .sort(([, a], [, b]) => (a["x-srs-order"] ?? 0) - (b["x-srs-order"] ?? 0))
        .map(([fname, fprop]) => propertyToField(fname, fprop, itemRequired.includes(fname)));
      return {
        name,
        label: prop.title || name,
        order: prop["x-srs-order"] ?? 0,
        fields,
      };
    });
}

/** Return the root type ID declared by `properties.root.$ref` in a blueprint schema, or null. */
export function rootTypeId(schema: BlueprintSchema): string | null {
  const ref = schema.properties.root?.$ref;
  return ref ? refToTypeId(ref) : null;
}
