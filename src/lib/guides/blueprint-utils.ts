/**
 * blueprint-utils.ts — guide-specific helpers for working with blueprint JSON Schema output.
 *
 * The generic field/composite conversion (definitionToFields/definitionToComposites) and
 * rootTypeId moved to `src/lib/editor/blueprint-fields.ts` (srs-web#322) — shared by the
 * guides editor and the generic blueprint document editor. This module keeps only the
 * guide blueprint's own conventions: section-type discovery and root-record fields.
 *
 * ADR-001: zero SRS semantics in TypeScript. This module is purely structural metadata
 * conversion; all validation stays in WASM.
 *
 * C8 blueprint-schema-driven guides renderer: srs-web#26
 */

import {
  type CompositeFormDef,
  definitionToComposites,
  definitionToFields,
  refToTypeId,
  rootTypeId as sharedRootTypeId,
} from "$lib/editor/blueprint-fields.js";
import { typeNameLabel } from "$lib/editor/document-model.js";
import type { FieldFormDef } from "$lib/governance/types.js";
import type { BlueprintSchema } from "$lib/srs-client.js";

export { refToTypeId, definitionToFields, definitionToComposites, type CompositeFormDef };

/**
 * A resolved section type descriptor derived from the blueprint schema.
 */
export interface SectionTypeDescriptor {
  typeId: string;
  typeVersion: number;
  label: string;
  fields: FieldFormDef[];
  composites: CompositeFormDef[];
}

/**
 * Extract the list of addable section type descriptors from a blueprint schema.
 * Uses `contains.items.oneOf` entries to identify section types, then builds
 * FieldFormDef arrays from the corresponding definitions.
 *
 * `versionByTypeId` resolves each type's current version (blueprint `$ref`s carry
 * no version) — build it from `listTypes()`; absent entries fall back to 1.
 * `labelByTypeId` resolves each type's human label from `listTypes()`
 * (srs-web#322 — replaces a hardcoded type-ID→label lookup table); absent
 * entries fall back to a truncated UUID.
 *
 * Returned types are in the order they appear in the schema.
 */
export function sectionTypes(
  schema: BlueprintSchema,
  versionByTypeId?: Map<string, number>,
  labelByTypeId?: Map<string, string>
): SectionTypeDescriptor[] {
  const contains = schema.properties.contains;
  const oneOf = (contains && "items" in contains ? contains.items?.oneOf : undefined) ?? [];
  return oneOf.map((ref: { $ref: string }) => {
    const typeId = refToTypeId(ref.$ref);
    const def = schema.definitions[typeId];
    return {
      typeId,
      typeVersion: versionByTypeId?.get(typeId) ?? 1,
      label: labelByTypeId?.get(typeId) ?? `Section (${typeId.slice(0, 8)})`,
      fields: def ? definitionToFields(def) : [],
      composites: def ? definitionToComposites(def) : [],
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
  return sharedRootTypeId(schema);
}

/**
 * Build a type-ID→label map from `listTypes()` for use as `sectionTypes`'s
 * `labelByTypeId`. Uses `name` — package `Type.description` is prose-length
 * ("A guide section consisting of body text…"), unsuitable as a button/heading
 * label, while `name` (e.g. "section.text") is short and stable — humanised
 * by the shared `typeNameLabel` ("Section text").
 */
export function labelsByTypeId(
  types: { id: string; namespace: string; name: string; description?: string }[]
): Map<string, string> {
  return new Map(types.map((t) => [t.id, typeNameLabel(t.name)]));
}
