/**
 * field-helpers.ts — convenience utilities shared by profile view components.
 * Lookup helpers for extracting named governance fields from a record.
 * Display layer only — no SRS semantics (ADR-001).
 *
 * B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
 */

import type { FieldValue, SrsRecord } from "$lib/srs-client.js";
import { fieldIdByName } from "../governance/package.js";

/** Return the FieldValue entry for a field by its snake_case name. */
export function getFieldValueByName(record: SrsRecord, name: string): FieldValue | undefined {
  const fieldId = fieldIdByName(name);
  if (!fieldId) return undefined;
  return record.fieldValues.find((fv) => fv.fieldId === fieldId);
}

/** Return the raw value for a field by its snake_case name. */
export function getFieldByName(record: SrsRecord, name: string): unknown {
  return getFieldValueByName(record, name)?.value;
}

/** Return true if the field value is non-empty (not null/undefined/empty string/empty array). */
export function isPresent(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}
