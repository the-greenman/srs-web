/**
 * field-meta.ts — Svelte context for schema-derived field metadata.
 *
 * Provides a Map<fieldId, FieldFormDef> built from sectionSchemas at load time.
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
 * Pass a getter that returns the already-computed Map (e.g. a $derived) so
 * the context getter does not rebuild the map on every reactive access.
 */
export function setFieldMetaContext(getMeta: () => Map<string, FieldFormDef>): void {
  setContext<FieldMetaContext>(FIELD_META_KEY, {
    get meta() {
      return getMeta();
    },
  });
}

/**
 * Call once during component init to obtain the reactive field-meta context.
 * Then access `.meta` inside $derived to track reactive map changes:
 *
 *   const _fieldMetaCtx = getFieldMetaContext();
 *   const fieldMeta = $derived(_fieldMetaCtx.meta);
 *
 * Do NOT call getFieldMeta() inside $derived — getContext is init-only in Svelte 5.
 */
export function getFieldMetaContext(): FieldMetaContext {
  return getContext<FieldMetaContext>(FIELD_META_KEY);
}

/**
 * @deprecated Use getFieldMetaContext() + $derived(_fieldMetaCtx.meta) instead.
 * Has no callers after #83; may be removed in a follow-up cleanup.
 */
export function getFieldMeta(): Map<string, FieldFormDef> {
  return getContext<FieldMetaContext>(FIELD_META_KEY).meta;
}
