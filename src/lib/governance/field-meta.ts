/**
 * field-meta.ts — Svelte context for schema-derived field metadata.
 *
 * Provides a Map<fieldId, FieldFormDef> built from sectionSchemas at load time.
 * Replaces the static GOVERNANCE_FIELDS map in governance/package.ts (srs-web#55).
 * ADR-001: all field metadata is sourced from WASM typeSchema(), not hardcoded here.
 */

import { getContext, setContext } from "svelte";
import type { FieldFormDef, TypeFormDef } from "./types.js";

export const FIELD_META_KEY = Symbol("fieldMeta");

export interface FieldMetaContext {
  readonly meta: Map<string, FieldFormDef>;
}

/**
 * Build a fieldId → FieldFormDef map from all section schemas.
 * Shared fields (same fieldId across types, e.g. title/status) overwrite on
 * each iteration — safe because shared fields have identical metadata in all
 * governance type schemas.
 */
export function buildFieldMetaMap(schemas: Record<string, TypeFormDef>): Map<string, FieldFormDef> {
  const map = new Map<string, FieldFormDef>();
  for (const schema of Object.values(schemas)) {
    for (const field of schema.fields) {
      map.set(field.fieldId, field);
    }
  }
  return map;
}

/**
 * Call once during App.svelte synchronous init, AFTER $state declarations.
 * The getter ensures child components read the current sectionSchemas on
 * every $derived access — Svelte tracks the dependency through the getter.
 */
export function setFieldMetaContext(getSchemas: () => Record<string, TypeFormDef>): void {
  setContext<FieldMetaContext>(FIELD_META_KEY, {
    get meta() {
      return buildFieldMetaMap(getSchemas());
    },
  });
}

/** Call from any rendering component that descends from App.svelte. */
export function getFieldMeta(): Map<string, FieldFormDef> {
  return getContext<FieldMetaContext>(FIELD_META_KEY).meta;
}
