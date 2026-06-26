/**
 * field-helpers.ts — convenience utilities shared by profile view components.
 * Lookup helpers for extracting named governance fields from a record.
 * Display layer only — no SRS semantics (ADR-001).
 *
 * B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
 */

import type { FieldFormDef } from "$lib/governance/types.js";
import type { FieldValue, SrsRecord } from "$lib/srs-client.js";

/** Return the FieldValue entry for a field by its snake_case name. */
export function getFieldValueByName(
  record: SrsRecord,
  name: string,
  fieldMeta: Map<string, FieldFormDef>
): FieldValue | undefined {
  for (const [fieldId, def] of fieldMeta) {
    if (def.name === name) {
      return record.fieldValues.find((fv) => fv.fieldId === fieldId);
    }
  }
  return undefined;
}

/** Return the raw value for a field by its snake_case name. */
export function getFieldByName(
  record: SrsRecord,
  name: string,
  fieldMeta: Map<string, FieldFormDef>
): unknown {
  return getFieldValueByName(record, name, fieldMeta)?.value;
}

/** Return true if the field value is non-empty (not null/undefined/empty string/empty array). */
export function isPresent(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}
