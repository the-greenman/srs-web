/**
 * types.ts — TypeFormDef and FieldFormDef interfaces for governance form rendering.
 *
 * These interfaces are structural metadata used to render form fields.
 * All validation happens in WASM (ADR-001).
 *
 * Moved from form-schema.ts as part of srs-web#53 (blueprint-driven form generator).
 */

export interface FieldFormDef {
  fieldId: string;
  label: string;
  valueType: "string" | "text" | "select" | "url";
  required: boolean;
  options?: string[];
  /** Snake_case schema property name — always set by propertyToField in blueprint-utils. */
  name: string;
  /** AI guidance purpose text from the package field definition, if non-empty. */
  aiGuidance?: string;
  /** The field's own short description caption, shown as inline editor help. */
  description?: string;
  /** Fuller human "how to complete this field" guidance, revealed via an info toggle. */
  instructions?: string;
}

export interface TypeFormDef {
  typeId: string;
  typeVersion: number;
  typeNamespace: string;
  typeName: string;
  label: string;
  fields: FieldFormDef[];
}
