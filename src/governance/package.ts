/**
 * package.ts — stable field definitions extracted from the gallery governance package.
 *
 * Field IDs are UUID5s from the gallery fixture package — they are stable and
 * must not be changed. This is the opinionated display layer: this module knows
 * the governance field schema for rendering purposes only. No SRS semantics here
 * (ADR-001).
 *
 * B5 record renderer: https://github.com/the-greenman/srs-web/issues/4
 */

export type FieldDef = {
  name: string;
  label: string;
  valueType: "string" | "text" | "number" | "boolean" | "date" | "url" | "select" | "multiselect";
  repeatable?: boolean;
};

/** Maps stable governance field UUIDs to their display definitions. */
export const GOVERNANCE_FIELDS: Record<string, FieldDef> = {
  // ---- Shared across all types ----
  "d7e82557-9045-5e92-a494-d99112bbec4a": { name: "title", label: "Title", valueType: "string" },
  "aee7afe9-6650-5fa4-a61a-495c3b88994b": { name: "status", label: "Status", valueType: "select" },

  // ---- Article fields ----
  "60be1468-01bc-5d12-9eea-628f02801893": {
    name: "article_number",
    label: "Article Number",
    valueType: "string",
  },
  "8aa3eba2-204b-5ebd-ba7a-be0f066027d6": {
    name: "article_text",
    label: "Article Text",
    valueType: "text",
  },
  "3340532b-d845-5e54-92b3-819ed05365c5": {
    name: "rationale",
    label: "Rationale",
    valueType: "text",
  },
  "1f01bc6b-39c8-58d7-b1a3-79142623fece": {
    name: "amendment_rule",
    label: "Amendment Rule",
    valueType: "text",
  },
  "0df40543-f72a-5471-a7f1-c85c1f1f93e4": {
    name: "protected_status",
    label: "Protected Status",
    valueType: "string",
  },

  // ---- Decision fields ----
  "de1296e0-e083-58d9-97a0-cb2b91fec02e": {
    name: "decision_statement",
    label: "Decision Statement",
    valueType: "text",
  },
  "73cd845a-3623-5bc6-8ade-42a7cd64740c": {
    name: "decision_question",
    label: "Decision Question",
    valueType: "string",
  },
  "9889052c-9313-5e2f-a2ac-15baa3c6983e": { name: "context", label: "Context", valueType: "text" },
  "1a1c0a5d-a1df-5d03-95f2-32af73bb71da": {
    name: "friction",
    label: "Friction",
    valueType: "text",
  },
  "636ce948-2110-57b4-a3ed-04354ec17843": {
    name: "alternatives_considered",
    label: "Alternatives Considered",
    valueType: "text",
  },
  "a952604c-d150-5315-bfc1-7229ddc1d636": {
    name: "key_requirements",
    label: "Key Requirements",
    valueType: "text",
  },
  "c04b7f84-9a55-5353-8c9f-2b62f6a1e34e": {
    name: "revisit_when",
    label: "Revisit When",
    valueType: "text",
  },
  "4b34847c-26d1-56be-bc10-844aeb704df7": { name: "owner", label: "Owner", valueType: "string" },
  "4181f210-f4be-5587-950e-890eda2a5590": {
    name: "next_steps",
    label: "Next Steps",
    valueType: "text",
  },

  // ---- Role fields ----
  "a6c19b95-4f8f-5b07-93f8-3426c545277e": {
    name: "role_holder",
    label: "Role Holder",
    valueType: "string",
  },
  "d25da548-79d6-555b-8878-f40b685b3955": {
    name: "authority",
    label: "Authority",
    valueType: "text",
  },
  "3c39ee1f-6fe0-5da7-a0b6-928aa3a63211": {
    name: "boundary",
    label: "Boundary",
    valueType: "text",
  },
  "9a32dc01-f348-5e05-9f54-bb6d21239f04": {
    name: "source_of_authority",
    label: "Source of Authority",
    valueType: "string",
  },

  // ---- Exercise fields (ext:protocol — not in gallery fixture but defined in governance spec) ----
  // These UUIDs are placeholders; replace when exercise type is added to the gallery package.
  // Included here so ExerciseView can reference them by name without failing.
};

/** Look up the full definition for a field ID. */
export function fieldDef(fieldId: string): FieldDef | undefined {
  return GOVERNANCE_FIELDS[fieldId];
}

/** Return a human display label for a field ID, falling back to a short ID prefix. */
export function fieldLabel(fieldId: string): string {
  return GOVERNANCE_FIELDS[fieldId]?.label ?? fieldId.slice(0, 8);
}

/** Return the field ID for a given snake_case name, or undefined if not found. */
export function fieldIdByName(name: string): string | undefined {
  return Object.entries(GOVERNANCE_FIELDS).find(([, def]) => def.name === name)?.[0];
}
