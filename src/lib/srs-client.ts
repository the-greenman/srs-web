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
  // biome-ignore lint/suspicious/noExplicitAny: srs_bindings is generated at build time
  const mod = await import(/* @vite-ignore */ "./srs_bindings/srs_bindings.js") as any;
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
