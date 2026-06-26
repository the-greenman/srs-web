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
  valueType: "string" | "text" | "select";
  required: boolean;
  options?: string[];
  /** Schema property name (e.g. "columns", "rows"). Set for group sub-fields. */
  name?: string;
}

export interface TypeFormDef {
  typeId: string;
  typeVersion: number;
  typeNamespace: string;
  typeName: string;
  label: string;
  fields: FieldFormDef[];
}
