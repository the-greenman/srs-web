/**
 * srs-client.ts — thin wrapper around the srs-bindings WASM module.
 *
 * ADR-001: zero SRS semantics in TypeScript. All semantic operations delegate
 * to the WASM `SrsRepository` class from `srs-bindings`. This module is purely
 * a loading/lifecycle helper and a typed facade over the WASM boundary.
 *
 * The WASM package is built with:
 *   wasm-pack build crates/srs-bindings --target web --out-dir ../../srs-web/src/lib/srs_bindings
 */

// ---------------------------------------------------------------------------
// WASM module types (mirrored from srs-bindings/src/lib.rs + srs-core types)
// ---------------------------------------------------------------------------

/** Opaque WASM handle — methods are defined in srs-bindings. */
export interface SrsRepository {
  validate(): RepositoryValidationReport;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised to SrsRecord[] in listRecords()
  list_records(filter_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised to SrsRecord | null in getRecord()
  get_record(id: string): any;
  list_notes(): ListNotesResult;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in createRecord()
  create_record(type_id: string, type_version: number, input_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in updateRecord()
  update_record(instance_id: string, input_json: string): any;
  delete_record(instance_id: string): void;
  export_srsj(): string;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; relations are untyped at this boundary
  list_relations(filter_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`
  create_relation(input_json: string): any;
  delete_relation(relation_id: string): void;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in setLifecycleState()
  set_lifecycle_state(instance_id: string, state: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in blueprintSchema()
  blueprint_schema(blueprint_id: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in renderDocumentView()
  render_document_view(view_id: string, format: string, container_id?: string | null): any;
}

export interface SrsRepositoryConstructor {
  load(srsj: string): SrsRepository;
}

/** Subset of the validation report returned by `SrsRepository.validate()`. */
export interface RepositoryValidationReport {
  instanceCount: number;
  errorCount: number;
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  instanceId?: string;
}

/** Minimal record shape (Tier 2). Full type definitions derive from payload schemas. */
export interface SrsRecord {
  instanceId: string;
  typeId: string;
  typeVersion: number;
  typeNamespace?: string;
  typeName?: string;
  fieldValues: FieldValue[];
  lifecycle?: LifecycleState;
  createdAt?: string;
  updatedAt?: string;
}

export interface FieldValue {
  fieldId: string;
  value: unknown;
}

export type LifecycleState = "draft" | "active" | "archived";

export interface ListNotesResult {
  notes: NoteRecord[];
}

export interface NoteRecord {
  instanceId: string;
  sections: NoteSection[];
  createdAt?: string;
  updatedAt?: string;
}

export interface NoteSection {
  heading?: string;
  body: string;
}

export interface RecordListFilter {
  typeNamespace?: string;
  typeName?: string;
  containerId?: string;
}

export interface CreateRecordInput {
  fieldValues: FieldValue[];
  groupValues?: GroupFieldValue[];
  tags?: string[];
}

export interface UpdateRecordInput {
  fieldValues: FieldValue[];
  groupValues?: GroupFieldValue[] | null;
  tags?: string[];
}

export interface GroupFieldValue {
  groupId: string;
  values: FieldValue[];
}

export interface SrsRelation {
  relationId: string;
  relationType: string;
  sourceInstanceId: string;
  targetInstanceId: string;
  assertedBy?: string;
  confidence?: number;
  status?: string;
  createdAt?: string;
}

export interface RelationListFilter {
  source?: string;
  target?: string;
  relationType?: string;
  containerId?: string;
}

export interface CreateRelationInput {
  relationId?: string;
  relationType: string;
  sourceInstanceId: string;
  targetInstanceId: string;
  assertedBy?: string;
  confidence?: number;
  status?: string;
}

// ---------------------------------------------------------------------------
// WASM loader
// ---------------------------------------------------------------------------

let wasmModule: SrsRepositoryConstructor | null = null;

/**
 * Load the srs-bindings WASM module. Call once at app startup.
 * The WASM package must be present at `src/lib/srs_bindings/` (built from
 * `srs-rust/crates/srs-bindings` via wasm-pack).
 */
export async function initWasm(): Promise<void> {
  if (wasmModule !== null) return;

  // Dynamic import so Vite + vite-plugin-wasm can handle the WASM initialisation.
  // The path is resolved at runtime by Vite; the WASM package is built from
  // srs-rust/crates/srs-bindings and placed at src/lib/srs_bindings/.
  // @ts-ignore — srs_bindings is generated by wasm-pack; absent from source repo / CI
  // biome-ignore lint/suspicious/noExplicitAny: generated WASM artifact, no typedefs in CI
  const mod = (await import(/* @vite-ignore */ "./srs_bindings/srs_bindings.js")) as any;
  await mod.default();
  wasmModule = mod.SrsRepository as SrsRepositoryConstructor;
}

function requireWasm(): SrsRepositoryConstructor {
  if (wasmModule === null) {
    throw new Error("srs-bindings WASM not initialised — call initWasm() first");
  }
  return wasmModule;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a repository from a `.srsj` JSON string.
 * Throws if the WASM module has not been initialised or if the string is invalid.
 */
export function loadRepo(srsj: string): SrsRepository {
  return requireWasm().load(srsj);
}

// ---------------------------------------------------------------------------
// WASM output normalisation
// ---------------------------------------------------------------------------

/**
 * serde_wasm_bindgen does not always honour #[serde(rename_all = "camelCase")].
 * Normalise both snake_case and camelCase field names so all TypeScript code
 * can assume camelCase regardless of the serialiser behaviour.
 */
// biome-ignore lint/suspicious/noExplicitAny: raw WASM output has unknown shape
function normalizeRecord(raw: any): SrsRecord {
  // biome-ignore lint/suspicious/noExplicitAny: raw fv has unknown shape
  const rawFvs: any[] = raw.fieldValues ?? raw.field_values ?? [];
  return {
    instanceId: raw.instanceId ?? raw.instance_id,
    typeId: raw.typeId ?? raw.type_id,
    typeVersion: raw.typeVersion ?? raw.type_version,
    typeNamespace: raw.typeNamespace ?? raw.type_namespace,
    typeName: raw.typeName ?? raw.type_name,
    fieldValues: rawFvs.map((fv) => ({
      fieldId: fv.fieldId ?? fv.field_id,
      value: fv.value,
    })),
    lifecycle: raw.lifecycle,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List records in the repository, optionally filtered.
 * Pass an empty filter (`{}`) to list all records.
 */
export function listRecords(repo: SrsRepository, filter: RecordListFilter = {}): SrsRecord[] {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; normalised below
  const raw: any[] = repo.list_records(JSON.stringify(filter));
  return raw.map(normalizeRecord);
}

/**
 * Count all records in the repository (no filter).
 */
export function countRecords(repo: SrsRepository): number {
  return listRecords(repo).length;
}

/**
 * Get a single record by instance ID. Returns null if not found.
 */
export function getRecord(repo: SrsRepository, instanceId: string): SrsRecord | null {
  const raw = repo.get_record(instanceId);
  if (raw === null || raw === undefined) return null;
  return normalizeRecord(raw);
}

/**
 * Create a new record of the given type.
 */
export function createRecord(
  repo: SrsRepository,
  typeId: string,
  typeVersion: number,
  input: CreateRecordInput
): SrsRecord {
  const raw = repo.create_record(typeId, typeVersion, JSON.stringify(input));
  return normalizeRecord(raw);
}

/**
 * Update an existing record's field values.
 */
export function updateRecord(
  repo: SrsRepository,
  instanceId: string,
  input: UpdateRecordInput
): SrsRecord {
  const raw = repo.update_record(instanceId, JSON.stringify(input));
  return normalizeRecord(raw);
}

/**
 * Delete a record by instance ID.
 */
export function deleteRecord(repo: SrsRepository, instanceId: string): void {
  repo.delete_record(instanceId);
}

/**
 * Export the repository as a `.srsj` JSON string for download.
 */
export function exportSrsj(repo: SrsRepository): string {
  return repo.export_srsj();
}

/**
 * List relations in the repository, optionally filtered.
 */
export function listRelations(repo: SrsRepository, filter: RelationListFilter = {}): SrsRelation[] {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary
  const raw: any[] = repo.list_relations(JSON.stringify(filter));
  return raw.map((r) => ({
    relationId: r.relationId ?? r.relation_id,
    relationType: r.relationType ?? r.relation_type,
    sourceInstanceId: r.sourceInstanceId ?? r.source_instance_id,
    targetInstanceId: r.targetInstanceId ?? r.target_instance_id,
    assertedBy: r.assertedBy ?? r.asserted_by,
    confidence: r.confidence,
    status: r.status,
    createdAt: r.createdAt ?? r.created_at,
  }));
}

/**
 * Create a relation between two instances.
 */
export function createRelation(repo: SrsRepository, input: CreateRelationInput): SrsRelation {
  const raw = repo.create_relation(JSON.stringify(input));
  return {
    relationId: raw.relationId ?? raw.relation_id,
    relationType: raw.relationType ?? raw.relation_type,
    sourceInstanceId: raw.sourceInstanceId ?? raw.source_instance_id,
    targetInstanceId: raw.targetInstanceId ?? raw.target_instance_id,
    assertedBy: raw.assertedBy ?? raw.asserted_by,
    confidence: raw.confidence,
    status: raw.status,
    createdAt: raw.createdAt ?? raw.created_at,
  };
}

/**
 * Delete a relation by ID.
 */
export function deleteRelation(repo: SrsRepository, relationId: string): void {
  repo.delete_relation(relationId);
}

/**
 * Transition a record to a new lifecycle state.
 */
export function setLifecycleState(
  repo: SrsRepository,
  instanceId: string,
  state: LifecycleState
): SrsRecord {
  const raw = repo.set_lifecycle_state(instanceId, state);
  return normalizeRecord(raw);
}

// ---------------------------------------------------------------------------
// Blueprint schema types (C2 / C8)
// ---------------------------------------------------------------------------

export interface SchemaProperty {
  title: string;
  type?: string;
  enum?: string[];
  "x-srs-field-id": string;
  "x-srs-order": number;
  "x-srs-widget"?: string;
}

export interface SchemaDefinition {
  type: string;
  properties: Record<string, SchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface BlueprintSchema {
  properties: {
    root?: { $ref: string };
    contains?: {
      type?: string;
      items?: { oneOf: Array<{ $ref: string }> };
    };
  };
  definitions: Record<string, SchemaDefinition>;
}

export interface BlueprintSchemaResult {
  schema: BlueprintSchema;
  diagnostics: string[];
}

// ---------------------------------------------------------------------------
// Document view types (C3 / C8)
// ---------------------------------------------------------------------------

export interface DocumentViewResult {
  rendered: string;
  diagnostics: string[];
  projection: unknown | null;
}

// ---------------------------------------------------------------------------
// Blueprint schema + document view wrappers
// ---------------------------------------------------------------------------

/**
 * Project a blueprint into a JSON Schema describing the multi-record document
 * it declares. Returns the schema object and any non-fatal diagnostics.
 */
export function blueprintSchema(
  repo: SrsRepository,
  blueprintId: string
): BlueprintSchemaResult {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; typed above
  return repo.blueprint_schema(blueprintId) as BlueprintSchemaResult;
}

/**
 * Render a document view. `format` is "json" or "markdown".
 * When `format === "json"`, `projection` in the result is a DocumentViewProjection.
 */
export function renderDocumentView(
  repo: SrsRepository,
  viewId: string,
  format: string,
  containerId?: string | null
): DocumentViewResult {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; typed above
  return repo.render_document_view(viewId, format, containerId) as DocumentViewResult;
}
