/**
 * field-helpers.ts — convenience utilities shared by profile view components.
 * Display layer only — no SRS semantics (ADR-001).
 *
 * B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
 */

/** Return true if the field value is non-empty (not null/undefined/empty string/empty array). */
export function isPresent(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}
