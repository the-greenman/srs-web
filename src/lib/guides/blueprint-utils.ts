/**
 * blueprint-utils.ts — helpers for working with blueprint JSON Schema output.
 *
 * Converts `SchemaDefinition` objects (from `blueprintSchema()`) into
 * `FieldFormDef[]` that can be fed to `RecordForm` — the same generic form
 * component used by the governance editor.
 *
 * ADR-001: zero SRS semantics in TypeScript. This module is purely structural
 * metadata conversion; all validation stays in WASM.
 *
 * C8 blueprint-schema-driven guides renderer: srs-web#26
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
 * Convert a blueprint SchemaDefinition into a sorted FieldFormDef array
 * suitable for RecordForm. Properties are sorted by `x-srs-order`.
 */
function isGroup(prop: SchemaProperty): boolean {
  return prop["x-srs-group-id"] != null;
}

/** Map a single scalar schema property to a FieldFormDef. */
function propertyToField(name: string, prop: SchemaProperty, required: boolean): FieldFormDef {
  let valueType: FieldFormDef["valueType"];
  if (prop.enum) {
    valueType = "select";
  } else if (prop["x-srs-widget"] === "textarea") {
    valueType = "text";
  } else {
    valueType = "string";
  }
  return {
    fieldId: prop["x-srs-field-id"] ?? name,
    label: prop.title || name,
    valueType,
    required,
    options: prop.enum,
    name,
  };
}

export function definitionToFields(def: SchemaDefinition): FieldFormDef[] {
  return Object.entries(def.properties)
    .filter(([, prop]) => !isGroup(prop))
    .sort(([, a], [, b]) => (a["x-srs-order"] ?? 0) - (b["x-srs-order"] ?? 0))
    .map(([name, prop]) => propertyToField(name, prop, def.required?.includes(name) ?? false));
}

/**
 * A resolved field-group descriptor (ext:field-groups) derived from a section
 * definition. Repeatable groups carry one or more entries; each entry is a set
 * of values for `fields`. `compositeRenderer` (e.g. "table") selects a widget.
 */
export interface GroupFormDef {
  groupId: string;
  label: string;
  order: number;
  repeatable: boolean;
  compositeRenderer?: string;
  fields: FieldFormDef[];
}

/** Extract field groups (array/object group properties) from a definition. */
export function definitionToGroups(def: SchemaDefinition): GroupFormDef[] {
  return Object.entries(def.properties)
    .filter(([, prop]) => isGroup(prop))
    .sort(([, a], [, b]) => (a["x-srs-order"] ?? 0) - (b["x-srs-order"] ?? 0))
    .map(([name, prop]) => {
      const itemProps = prop.items?.properties ?? {};
      const itemRequired = prop.items?.required ?? [];
      const fields = Object.entries(itemProps)
        .sort(([, a], [, b]) => (a["x-srs-order"] ?? 0) - (b["x-srs-order"] ?? 0))
        .map(([fname, fprop]) => propertyToField(fname, fprop, itemRequired.includes(fname)));
      return {
        groupId: prop["x-srs-group-id"] ?? name,
        label: prop.title || name,
        order: prop["x-srs-order"] ?? 0,
        repeatable: prop["x-srs-repeatable"] ?? false,
        compositeRenderer: prop["x-srs-composite-renderer"],
        fields,
      };
    });
}

/**
 * A resolved section type descriptor derived from the blueprint schema.
 */
export interface SectionTypeDescriptor {
  typeId: string;
  typeVersion: number;
  label: string;
  fields: FieldFormDef[];
  groups: GroupFormDef[];
}

/**
 * Extract the list of addable section type descriptors from a blueprint schema.
 * Uses `contains.items.oneOf` entries to identify section types, then builds
 * FieldFormDef arrays from the corresponding definitions.
 *
 * Returned types are in the order they appear in the schema.
 */
export function sectionTypes(schema: BlueprintSchema): SectionTypeDescriptor[] {
  const oneOf = schema.properties.contains?.items?.oneOf ?? [];
  return oneOf.map((ref) => {
    const typeId = refToTypeId(ref.$ref);
    const def = schema.definitions[typeId];
    return {
      typeId,
      typeVersion: 1,
      label: labelForTypeId(typeId),
      fields: def ? definitionToFields(def) : [],
      groups: def ? definitionToGroups(def) : [],
    };
  });
}

/**
 * Build a FieldFormDef array for the guide root type.
 * Uses `properties.root.$ref` to locate the root definition.
 */
export function rootFields(schema: BlueprintSchema): FieldFormDef[] {
  const ref = schema.properties.root?.$ref;
  if (!ref) return [];
  const typeId = refToTypeId(ref);
  const def = schema.definitions[typeId];
  return def ? definitionToFields(def) : [];
}

/**
 * Return the root (guide) type ID from the blueprint schema.
 */
export function rootTypeId(schema: BlueprintSchema): string | null {
  const ref = schema.properties.root?.$ref;
  return ref ? refToTypeId(ref) : null;
}

/** Friendly label derived from a UUID — looks up known muDemocracy type IDs. */
function labelForTypeId(typeId: string): string {
  const KNOWN: Record<string, string> = {
    "4408a98e-d23e-4bc6-aef5-d8678571e2f6": "Text section",
    "76cdc3fb-8460-4efc-90f5-3c4a15b86cad": "List section",
    "d8d09d3b-8253-4d8d-b187-42f35c8446a7": "Table section",
    "474e299c-5809-4f92-a40d-b3ae1be3ad17": "Commentary section",
  };
  return KNOWN[typeId] ?? `Section (${typeId.slice(0, 8)})`;
}
