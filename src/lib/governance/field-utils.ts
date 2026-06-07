/**
 * field-utils.ts — stable field ID → name map for the governance package.
 *
 * Field IDs are UUID5s from the gallery fixture package; they are stable and
 * must not be changed. Add new entries when the package gains new fields.
 *
 * B4 governance viewer: https://github.com/the-greenman/srs-web/issues/3
 */

import type { SrsRecord } from "../srs-client.js";

/** Maps stable governance field UUIDs to their snake_case names. */
export const FIELD_NAMES: Record<string, string> = {
  // Shared across all types
  "d7e82557-9045-5e92-a494-d99112bbec4a": "title",
  "aee7afe9-6650-5fa4-a61a-495c3b88994b": "status",

  // Article fields
  "60be1468-01bc-5d12-9eea-628f02801893": "article_number",
  "8aa3eba2-204b-5ebd-ba7a-be0f066027d6": "article_text",
  "1f01bc6b-39c8-58d7-b1a3-79142623fece": "amendment_rule",
  "0df40543-f72a-5471-a7f1-c85c1f1f93e4": "protected_status",

  // Decision fields
  "de1296e0-e083-58d9-97a0-cb2b91fec02e": "decision_statement",
  "9889052c-9313-5e2f-a2ac-15baa3c6983e": "context",
  "3340532b-d845-5e54-92b3-819ed05365c5": "rationale",
  "636ce948-2110-57b4-a3ed-04354ec17843": "alternatives_considered",
  "c04b7f84-9a55-5353-8c9f-2b62f6a1e34e": "revisit_when",
  "4b34847c-26d1-56be-bc10-844aeb704df7": "owner",
  "1a1c0a5d-a1df-5d03-95f2-32af73bb71da": "friction",
  "73cd845a-3623-5bc6-8ade-42a7cd64740c": "decision_question",
  "a952604c-d150-5315-bfc1-7229ddc1d636": "key_requirements",
  "4181f210-f4be-5587-950e-890eda2a5590": "next_steps",

  // Role fields
  "a6c19b95-4f8f-5b07-93f8-3426c545277e": "role_holder",
  "d25da548-79d6-555b-8878-f40b685b3955": "authority",
  "3c39ee1f-6fe0-5da7-a0b6-928aa3a63211": "boundary",
  "9a32dc01-f348-5e05-9f54-bb6d21239f04": "source_of_authority",
};

/**
 * Look up a named field value from a record.
 * Returns `undefined` if the field is not present.
 */
export function getFieldValue(record: SrsRecord, fieldName: string): unknown {
  const entry = record.fieldValues.find((fv) => FIELD_NAMES[fv.fieldId] === fieldName);
  return entry?.value;
}

/**
 * Convenience wrapper that returns a string or undefined.
 */
export function getStringField(record: SrsRecord, fieldName: string): string | undefined {
  const v = getFieldValue(record, fieldName);
  return typeof v === "string" ? v : undefined;
}
