/**
 * form-schema.ts — static form field definitions for governance record types.
 *
 * Field IDs, type IDs, and namespaces are all UUID5 / canonical values from
 * the gallery.srsj package. Do not change these identifiers.
 *
 * ADR-001: zero SRS semantics in TypeScript. This module is purely structural
 * metadata used to render form fields. All validation happens in WASM.
 *
 * B9 edit forms: https://github.com/the-greenman/srs-web/issues/5
 */

export interface FieldFormDef {
  fieldId: string;
  label: string;
  valueType: "string" | "text" | "select";
  required: boolean;
  options?: string[];
}

export interface TypeFormDef {
  typeId: string;
  typeVersion: number;
  typeNamespace: string;
  typeName: string;
  label: string;
  fields: FieldFormDef[];
}

/** Shared status options across all governance types. */
const STATUS_OPTIONS = [
  "draft",
  "proposed",
  "active",
  "deferred",
  "superseded",
  "closed",
  "rejected",
  "archived",
];

/** Keyed by SectionKey ('articles' | 'decisions' | 'roles'). */
export const GOVERNANCE_FORMS: Record<string, TypeFormDef> = {
  articles: {
    typeId: "a1142ac3-5385-5c0e-8630-1dd3432cdf7f",
    typeVersion: 1,
    typeNamespace: "governance",
    typeName: "article",
    label: "Article",
    fields: [
      {
        fieldId: "60be1468-01bc-5d12-9eea-628f02801893",
        label: "Article Number",
        valueType: "string",
        required: false,
      },
      {
        fieldId: "d7e82557-9045-5e92-a494-d99112bbec4a",
        label: "Title",
        valueType: "string",
        required: true,
      },
      {
        fieldId: "8aa3eba2-204b-5ebd-ba7a-be0f066027d6",
        label: "Article Text",
        valueType: "text",
        required: true,
      },
      {
        fieldId: "3340532b-d845-5e54-92b3-819ed05365c5",
        label: "Rationale",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "1f01bc6b-39c8-58d7-b1a3-79142623fece",
        label: "Amendment Rule",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "0df40543-f72a-5471-a7f1-c85c1f1f93e4",
        label: "Protected Status",
        valueType: "string",
        required: false,
      },
      {
        fieldId: "aee7afe9-6650-5fa4-a61a-495c3b88994b",
        label: "Status",
        valueType: "select",
        required: true,
        options: STATUS_OPTIONS,
      },
      {
        fieldId: "c04b7f84-9a55-5353-8c9f-2b62f6a1e34e",
        label: "Revisit When",
        valueType: "text",
        required: false,
      },
    ],
  },

  decisions: {
    typeId: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
    typeVersion: 1,
    typeNamespace: "governance",
    typeName: "decision",
    label: "Decision",
    fields: [
      {
        fieldId: "d7e82557-9045-5e92-a494-d99112bbec4a",
        label: "Title",
        valueType: "string",
        required: true,
      },
      {
        fieldId: "73cd845a-3623-5bc6-8ade-42a7cd64740c",
        label: "Decision Question",
        valueType: "string",
        required: false,
      },
      {
        fieldId: "9889052c-9313-5e2f-a2ac-15baa3c6983e",
        label: "Context",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "1a1c0a5d-a1df-5d03-95f2-32af73bb71da",
        label: "Friction",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "636ce948-2110-57b4-a3ed-04354ec17843",
        label: "Alternatives Considered",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "a952604c-d150-5315-bfc1-7229ddc1d636",
        label: "Key Requirements",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "de1296e0-e083-58d9-97a0-cb2b91fec02e",
        label: "Decision Statement",
        valueType: "text",
        required: true,
      },
      {
        fieldId: "3340532b-d845-5e54-92b3-819ed05365c5",
        label: "Rationale",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "c04b7f84-9a55-5353-8c9f-2b62f6a1e34e",
        label: "Revisit When",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "4181f210-f4be-5587-950e-890eda2a5590",
        label: "Next Steps",
        valueType: "text",
        required: false,
      },
      {
        fieldId: "4b34847c-26d1-56be-bc10-844aeb704df7",
        label: "Owner",
        valueType: "string",
        required: false,
      },
      {
        fieldId: "aee7afe9-6650-5fa4-a61a-495c3b88994b",
        label: "Status",
        valueType: "select",
        required: true,
        options: STATUS_OPTIONS,
      },
    ],
  },

  roles: {
    typeId: "e53dce11-6b83-5714-a8fe-f730edb500fa",
    typeVersion: 1,
    typeNamespace: "governance",
    typeName: "role",
    label: "Role",
    fields: [
      {
        fieldId: "d7e82557-9045-5e92-a494-d99112bbec4a",
        label: "Title",
        valueType: "string",
        required: true,
      },
      {
        fieldId: "a6c19b95-4f8f-5b07-93f8-3426c545277e",
        label: "Role Holder",
        valueType: "string",
        required: false,
      },
      {
        fieldId: "d25da548-79d6-555b-8878-f40b685b3955",
        label: "Authority",
        valueType: "text",
        required: true,
      },
      {
        fieldId: "3c39ee1f-6fe0-5da7-a0b6-928aa3a63211",
        label: "Boundary",
        valueType: "text",
        required: true,
      },
      {
        fieldId: "9a32dc01-f348-5e05-9f54-bb6d21239f04",
        label: "Source of Authority",
        valueType: "string",
        required: false,
      },
      {
        fieldId: "aee7afe9-6650-5fa4-a61a-495c3b88994b",
        label: "Status",
        valueType: "select",
        required: true,
        options: STATUS_OPTIONS,
      },
      {
        fieldId: "c04b7f84-9a55-5353-8c9f-2b62f6a1e34e",
        label: "Revisit When",
        valueType: "text",
        required: false,
      },
    ],
  },
};
