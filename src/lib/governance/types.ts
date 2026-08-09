/**
 * types.ts — TypeFormDef and FieldFormDef interfaces for governance form rendering.
 *
 * These interfaces are structural metadata used to render form fields.
 * All validation happens in WASM (ADR-001).
 *
 * Moved from form-schema.ts as part of srs-web#53 (blueprint-driven form generator).
 */

export interface FieldFormDef {
  /** Field UUID from `x-srs-field-id` when the projection carries it (optional post-RFC-039). */
  fieldId?: string;
  label: string;
  /** Widget kind derived from the projected schema (enum→select, textarea→text, uri→url).
   * Presentation-only — distinct from the SRS Field's `fieldType` object. */
  valueType: "string" | "text" | "select" | "url";
  required: boolean;
  options?: string[];
  /** Schema property name — the RFC-039 carrier key into `fieldValues`. Always set. */
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
