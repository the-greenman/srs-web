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
  list_records(filter_json: string): SrsRecord[];
  get_record(id: string): SrsRecord | null;
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
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error — srs_bindings package is generated at build time, not present during typecheck
  const mod = await import(/* @vite-ignore */ "./srs_bindings/srs_bindings.js");
  // biome-ignore lint/suspicious/noExplicitAny: wasm_bindgen init function
  await (mod as any).default();
  wasmModule = mod as unknown as SrsRepositoryConstructor;
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

/**
 * List records in the repository, optionally filtered.
 * Pass an empty filter (`{}`) to list all records.
 */
export function listRecords(repo: SrsRepository, filter: RecordListFilter = {}): SrsRecord[] {
  return repo.list_records(JSON.stringify(filter));
}

/**
 * Count all records in the repository (no filter).
 */
export function countRecords(repo: SrsRepository): number {
  return listRecords(repo).length;
}
