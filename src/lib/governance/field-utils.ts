/**
 * field-utils.ts — schema-derived field lookup helpers for governance records.
 *
 * Field name lookups use the `fieldMeta` map built from WASM typeSchema()
 * (ADR-001 — no hardcoded field UUID maps in TS).
 *
 * B4 governance viewer: https://github.com/the-greenman/srs-web/issues/3
 */

import type { SrsRecord } from "../srs-client.js";
import type { FieldFormDef } from "./types.js";

/**
 * Look up a named field value from a record using the schema-derived fieldMeta map.
 * Returns `undefined` if the field name is not in fieldMeta or not present on the record.
 */
export function getFieldValue(
  record: SrsRecord,
  fieldName: string,
  fieldMeta: Map<string, FieldFormDef>
): unknown {
  for (const [fieldId, def] of fieldMeta) {
    if (def.name === fieldName) {
      return record.fieldValues.find((fv) => fv.fieldId === fieldId)?.value;
    }
  }
  return undefined;
}

/**
 * Convenience wrapper that returns a string or undefined.
 */
export function getStringField(
  record: SrsRecord,
  fieldName: string,
  fieldMeta: Map<string, FieldFormDef>
): string | undefined {
  const v = getFieldValue(record, fieldName, fieldMeta);
  return typeof v === "string" ? v : undefined;
}
