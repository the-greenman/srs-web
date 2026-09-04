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

// Empty governance document seed, shipped inside srs-bindings-web.tar.gz
// (srs-rust#381) and refreshed by scripts/ensure-bindings.mjs alongside the WASM,
// so the seed can never drift from the engine that scaffolds it.
import GOVERNANCE_SEED_SRSJ from "./srs_bindings/governance-seed.srsj?raw";

// ---------------------------------------------------------------------------
// WASM module types (mirrored from srs-bindings/src/lib.rs + srs-core types)
// ---------------------------------------------------------------------------

/** Opaque WASM handle — methods are defined in srs-bindings. */
export interface SrsRepository {
  validate(): RepositoryValidationReport;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; unwrapped from RecordSummary[] ({ instanceId, displayLabel, record }) in listRecords() via normalizeRecordSummary()
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
  export_archive(): Uint8Array;
  /** Export the session as an exploded file tree (ADR-038): a JS object of
   * `{ path: Uint8Array }`. Untouched files are byte-identical to what was loaded. */
  export_tree(): Record<string, Uint8Array>;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; relations are untyped at this boundary
  list_relations(filter_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`
  create_relation(input_json: string): any;
  delete_relation(relation_id: string): void;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in setLifecycleState()
  set_lifecycle_state(instance_id: string, state: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in transitionRecord()
  transition_record(instance_id: string, input_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in getAllowedLifecycleTransitions()
  get_allowed_lifecycle_transitions(instance_id: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in blueprintSchema()
  blueprint_schema(blueprint_id: string): any;
  // RFC-041/rfc-decision-92d2da05: DocumentView renamed to Composition on the
  // WASM surface (srs-rust#910). Presentation-layer rename only — the app's
  // own DocumentView/documentViewsForContainer naming is unaffected, only the
  // underlying binding call changes.
  render_composition(
    view_id: string,
    format: string,
    container_id?: string | null,
    instance_id_filter?: string | null
    // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in renderDocumentView()
  ): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in listContainers()
  list_containers(filter_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in getContainer()
  get_container(container_id: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in addContainerMember()
  add_container_member(container_id: string, instance_id: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in removeContainerMember()
  remove_container_member(container_id: string, instance_id: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in containersForInstance()
  containers_for_instance(instance_id: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in typeSchema()
  type_schema(type_id: string, type_version?: number): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in listTypes()
  list_types(filter_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in listBlueprints()
  list_blueprints(): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in documentViewsForContainer()
  compositions_for_container(container_id: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in listDocumentViews()
  list_compositions(filter_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in createRecordSuccessor()
  create_record_successor(predecessor_id: string, input_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; null for missing/unknown field (srs-web#179)
  get_field_value_by_name(instance_id: string, field_name: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in find()
  find(query_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in listTerms()
  list_terms(): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in resolveContainerView()
  resolve_container_view(container_id: string, view_id?: string | null): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in repositoryNavigation()
  repository_navigation(): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in scaffoldGovernanceDocument()
  scaffold_new_repository(input_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in availableMigrations()
  available_migrations(): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; normalised in applyMigration()
  apply_migration(id: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in orderByPrecedes()
  order_by_precedes(input_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in listAttachments()
  list_attachments(filter_json: string): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in addAttachment()
  add_attachment(input_json: string, file_bytes: Uint8Array): any;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in linkAttachment()
  link_attachment(input_json: string): any;
  get_attachment_bytes(document_id: string): Uint8Array;
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in getRecordAttachments()
  get_record_attachments(input_json: string): any;
}

export interface SrsRepositoryConstructor {
  load(srsj: string): SrsRepository;
  load_archive(bytes: Uint8Array): SrsRepository;
  /** Load a repository from an exploded file tree (ADR-038). `files` maps
   * repo-relative forward-slash paths to their `Uint8Array` contents. */
  load_tree(files: Record<string, Uint8Array>): SrsRepository;
}

/**
 * Subset of the validation report returned by `SrsRepository.validate()`.
 * Matches the WASM binding's actual shape exactly (srs_bindings.d.ts) — there
 * is no flat `instanceCount`/`errorCount`; the instance count is
 * `summary.checked` and the error count is `summary.errors`.
 */
export interface RepositoryValidationReport {
  diagnostics: Diagnostic[];
  summary: { checked: number; errors: number; warnings: number };
}

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  instanceId?: string;
}

/**
 * RFC-039 carrier: `fieldValues` is an object keyed by `Field.name` verbatim.
 * Each value is a scalar, an array (cardinality list), a map object, or a
 * nested fieldValues object for inline composites (a list composite is an
 * array of such objects).
 */
export type FieldValues = Record<string, unknown>;

/** Per-field provenance metadata, keyed by field name identically to `fieldValues` (RFC-039). */
export interface FieldMetaEntry {
  source?: string;
  editedAt?: string;
  sourceRefs?: unknown[];
}

export type FieldMeta = Record<string, FieldMetaEntry>;

/** Minimal record shape (Tier 2). Full type definitions derive from payload schemas. */
export interface SrsRecord {
  instanceId: string;
  typeId: string;
  typeVersion: number;
  typeNamespace?: string;
  typeName?: string;
  fieldValues: FieldValues;
  fieldMeta?: FieldMeta;
  lifecycle?: LifecycleState;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  /**
   * Core-resolved display label from `record_display_label` (srs-rust#293).
   * Populated by `listRecords()` and `getRecord()` — both WASM bindings return
   * `RecordSummary { instanceId, displayLabel, record }` (srs-rust#293/#294, srs-web#182).
   * Clients must use `displayLabel` for list labels and not re-derive titles from fieldValues.
   */
  displayLabel?: string;
}

// Open-ended string: the valid state vocabulary is enforced by the Rust core, not TypeScript.
// TODO: expose lifecycle state vocabulary via a WASM binding (ADR-001 residual — srs-web#167)
export type LifecycleState = string;

/**
 * RFC-022 relational-state obligation, as exposed on the allowed-transitions
 * projection: the target state may only be occupied when a relation of one of
 * `relationType` exists in `direction` (default "incoming"). Presentation routes
 * "this transition needs a successor" UX from this structure — never from state
 * name string-matching (ADR-001 / #167).
 */
export type RequiresRelation = {
  relationType: string | string[];
  direction?: "incoming" | "outgoing";
};

/** One entry in the allowed transitions list returned by `get_allowed_lifecycle_transitions`. */
export type AllowedTransitionEntry = {
  name: string;
  to: string;
  /** Whether the target state is a final (immutable) state. Mirrors the WASM payload field;
   * reserved for future UI use (e.g. styling final-state transitions distinctly). */
  toIsFinal: boolean;
  /** Present when the target state declares an RFC-022 relation obligation. */
  requiresRelation?: RequiresRelation;
};

/** Result shape from `get_allowed_lifecycle_transitions` (srs-rust record_store.rs). */
export type AllowedLifecycleTransitionsResult = {
  currentState: string;
  isImmutable: boolean;
  transitions: AllowedTransitionEntry[];
};

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
  fieldValues: FieldValues;
  fieldMeta?: FieldMeta;
  tags?: string[];
}

export interface UpdateRecordInput {
  fieldValues: FieldValues;
  fieldMeta?: FieldMeta;
  tags?: string[];
  typeVersion?: number;
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

export interface CreateRecordSuccessorInput {
  relationType: "supersedes" | "refines";
  fieldValues: FieldValues;
  fieldMeta?: FieldMeta;
  lifecycleState?: string;
  typeVersion?: number;
}

export interface CreateRecordSuccessorResult {
  record: SrsRecord;
  relation: SrsRelation;
}

/** RFC-022 fulfillment: how a transition into a `requiresRelation` state satisfies its obligation. */
export interface TransitionFulfillment {
  /** Spawn a successor of the record's type (at the lifecycle's initial state), relate it, then flip. */
  newRecord?: { fieldValues: FieldValues; fieldMeta?: FieldMeta; typeVersion?: number };
  /** Relate an already-drafted record, then flip. */
  existingInstanceId?: string;
  /** Selector when the state declares an any-of relationType array; defaults to the first declared. */
  relationType?: string;
}

/** Full input surface of the `transition_record` WASM binding (mirrors the CLI stdin contract). */
export interface TransitionRecordInput {
  to?: string;
  byTransition?: string;
  fulfillment?: TransitionFulfillment;
}

/** Result of `transition_record` — successor/relation present when the transition was fulfilled. */
export interface TransitionRecordResult {
  record: SrsRecord;
  warnings: string[];
  successor?: SrsRecord;
  relation?: SrsRelation;
}

/** Status of a single migration for the current repository. Exactly one field is true. */
export interface MigrationStatus {
  needed: boolean;
  alreadyApplied: boolean;
  notApplicable: boolean;
}

/** Summary of a migration from `available_migrations()`. */
export interface MigrationSummary {
  id: string;
  title: string;
  description: string;
  status: MigrationStatus;
}

/** Result of `apply_migration(id)`. */
export interface MigrationApplyResult {
  id: string;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Attachment types (srs-rust#290, srs-rust#291, srs-web#99)
// ---------------------------------------------------------------------------

export interface AttachmentEntry {
  path: string;
  documentId?: string;
  title?: string;
  contentChecksum?: string;
  sidecarChecksum?: string;
  /** Absent until srs-rust#645 lands (srs-web#234 deferred). */
  sizeBytes?: number;
}

export interface AttachmentListResult {
  sourceDocumentsPath: string;
  entries: AttachmentEntry[];
}

export interface AddAttachmentInput {
  fileName: string;
  subdir?: string;
  title?: string;
  contentType?: string;
}

export interface AddAttachmentResult {
  documentId: string;
  contentPath: string;
  sidecarPath: string;
  sourceDocumentsPath: string;
  contentChecksum: string;
  sidecarChecksum: string;
}

export interface LinkAttachmentInput {
  instanceId: string;
  documentId: string;
}

export interface LinkAttachmentResult {
  instanceId: string;
  documentId: string;
  sourceRefsCount: number;
}

export interface ResolvedAttachment {
  documentId: string;
  contentPath?: string;
  sidecarPath?: string;
  contentChecksum?: string;
  sidecarChecksum?: string;
  title?: string;
}

export interface GetRecordAttachmentsInput {
  instanceId: string;
}

export interface GetRecordAttachmentsResult {
  instanceId: string;
  sourceDocumentsPath: string;
  attachments: ResolvedAttachment[];
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

/**
 * Load a repository from a `.srs` binary archive (ZIP bytes).
 * Throws if the WASM module has not been initialised or if the bytes are invalid.
 */
export function loadRepoFromArchive(bytes: Uint8Array): SrsRepository {
  return requireWasm().load_archive(bytes);
}

/**
 * Export a repository as a `.srs` binary archive (ZIP bytes).
 */
export function exportArchive(repo: SrsRepository): Uint8Array {
  return repo.export_archive();
}

/**
 * Load a repository from an exploded file tree (ADR-038) — `files` maps
 * repo-relative forward-slash paths to their `Uint8Array` contents, e.g. every
 * blob of a fetched git tree. Throws if the WASM module has not been initialised.
 */
export function loadRepoFromTree(files: Record<string, Uint8Array>): SrsRepository {
  return requireWasm().load_tree(files);
}

/**
 * Export a repository as an exploded file tree (ADR-038): a `{ path: Uint8Array }`
 * map. Files untouched since load are byte-identical to what was loaded — the
 * clean-git-diff guarantee callers rely on for minimal tree-mode commits.
 */
export function exportTree(repo: SrsRepository): Record<string, Uint8Array> {
  return repo.export_tree();
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
  // RFC-039 carrier: fieldValues is a name-keyed object, passed through verbatim
  // so a read-back record can be re-serialised exactly on write round trips.
  const fieldMeta = raw.fieldMeta ?? raw.field_meta;
  return {
    instanceId: raw.instanceId ?? raw.instance_id,
    typeId: raw.typeId ?? raw.type_id,
    typeVersion: raw.typeVersion ?? raw.type_version,
    typeNamespace: raw.typeNamespace ?? raw.type_namespace,
    typeName: raw.typeName ?? raw.type_name,
    fieldValues: raw.fieldValues ?? raw.field_values ?? {},
    ...(fieldMeta != null && { fieldMeta }),
    lifecycle: raw.lifecycleState ?? raw.lifecycle_state ?? raw.lifecycle,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
    ...(Array.isArray(raw.tags) && { tags: raw.tags }),
  };
}

/**
 * Unwrap a `RecordSummary` from the WASM `list_records` binding (srs-rust#293).
 * The binding returns `{ instanceId, displayLabel, record }` — not a bare `Record`.
 * Normalises `displayLabel` from both camelCase and snake_case variants.
 * If the wrapper shape is absent (bare Record — contract break), logs a warning and
 * falls back to `normalizeRecord(raw)` so the app does not crash.
 */
// biome-ignore lint/suspicious/noExplicitAny: raw WASM RecordSummary has unknown shape
function normalizeRecordSummary(raw: any): SrsRecord {
  if (raw.record !== undefined) {
    const inner = normalizeRecord(raw.record);
    // RecordSummary uses #[serde(rename_all = "camelCase")] so the WASM always emits
    // `displayLabel`. The `?? raw.display_label` guard matches the dual-lookup convention
    // used throughout this file for forward-defensive handling of serde config changes.
    inner.displayLabel = raw.displayLabel ?? raw.display_label;
    return inner;
  }
  // WASM contract violation: list_records always returns RecordSummary since srs-rust#293.
  // Log the unexpected shape and fall back defensively rather than crashing.
  console.warn("list_records: unexpected bare Record shape; WASM contract may have changed", raw);
  return normalizeRecord(raw);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List records in the repository, optionally filtered.
 * Pass an empty filter (`{}`) to list all records.
 * Each returned `SrsRecord` carries `displayLabel` — the core-resolved display label
 * from `record_display_label` (same resolution `srs tree` uses). Consumers must render
 * `displayLabel` directly and must not re-derive titles from `fieldValues`.
 */
export function listRecords(repo: SrsRepository, filter: RecordListFilter = {}): SrsRecord[] {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; unwrapped from RecordSummary below
  const raw: any[] = repo.list_records(JSON.stringify(filter));
  return raw.map(normalizeRecordSummary);
}

/**
 * Count all records in the repository (no filter).
 */
export function countRecords(repo: SrsRepository): number {
  return listRecords(repo).length;
}

/**
 * Get a single record by instance ID. Returns null if not found.
 *
 * The WASM binding returns a `RecordSummary` (`{ instanceId, displayLabel, record }`,
 * srs-rust#294); normalizeRecordSummary unwraps it — falling back to the bare-Record
 * shape for older bindings — so the result carries `displayLabel` (srs-web#182).
 */
export function getRecord(repo: SrsRepository, instanceId: string): SrsRecord | null {
  const raw = repo.get_record(instanceId);
  if (raw === null || raw === undefined) return null;
  return normalizeRecordSummary(raw);
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
  // list_relations returns RelationSummary (sourceId / targetId), while the
  // Relation entity uses sourceInstanceId / targetInstanceId — accept both.
  return raw.map((r) => ({
    relationId: r.relationId ?? r.relation_id,
    relationType: r.relationType ?? r.relation_type,
    sourceInstanceId: r.sourceInstanceId ?? r.source_instance_id ?? r.sourceId ?? r.source_id,
    targetInstanceId: r.targetInstanceId ?? r.target_instance_id ?? r.targetId ?? r.target_id,
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

export function orderByPrecedes(repo: SrsRepository, instanceIds: string[]): string[] {
  // order_by_precedes throws a JS error on failure (no error-string return path per .d.ts)
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary
  const raw: any = repo.order_by_precedes(JSON.stringify({ instanceIds }));
  return raw.orderedIds as string[];
}

/**
 * Create a successor record that supersedes or refines `predecessorId`.
 * Atomically creates both the new record and the relation linking successor → predecessor.
 * The predecessor's typeId and typeVersion are inherited unless `typeVersion` is specified.
 */
export function createRecordSuccessor(
  repo: SrsRepository,
  predecessorId: string,
  input: CreateRecordSuccessorInput
): CreateRecordSuccessorResult {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; normalised below
  const raw: any = repo.create_record_successor(predecessorId, JSON.stringify(input));
  return {
    record: normalizeRecord(raw.record),
    relation: normalizeRelationRaw(raw.relation),
  };
}

/**
 * Transition `instanceId` to `state`. Valid states are defined by the record type's
 * `ext:lifecycle` package definition. Transition rules and immutability constraints are
 * enforced by the Rust core — this function does not validate state names client-side.
 * ADR-001: lifecycle transition validation is the WASM engine's responsibility, not TypeScript's.
 *
 * As of srs-rust#367 the WASM binding returns `{ record, warnings }` instead of a bare Record.
 * `raw.record ?? raw` handles both the new shape and any cached WASM bundle still emitting
 * the old bare-Record shape (same defensive pattern as `normalizeRecordSummary`).
 */
export function setLifecycleState(
  repo: SrsRepository,
  instanceId: string,
  state: LifecycleState
): SrsRecord {
  const raw = repo.set_lifecycle_state(instanceId, state);
  // raw is { record: Record, warnings: string[] } per srs-rust#367.
  return normalizeRecord(raw.record ?? raw);
}

// biome-ignore lint/suspicious/noExplicitAny: WASM boundary; normalised field-by-field
function normalizeRelationRaw(raw: any): SrsRelation {
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
 * Transition `instanceId` with the full RFC-022 input surface, including `fulfillment`
 * for transitions into `requiresRelation` states (atomic successor + relation + flip —
 * the engine commits the flip last, so no orphan supersession can be observed).
 *
 * ADR-001: all obligation/transition validation is the WASM engine's responsibility;
 * this is a pure pass-through with shape normalisation.
 */
export function transitionRecord(
  repo: SrsRepository,
  instanceId: string,
  input: TransitionRecordInput
): TransitionRecordResult {
  if (typeof repo.transition_record !== "function") {
    // Older WASM bundle predating RFC-022 (srs-rust#492) — fail with a actionable message
    // rather than a TypeError deep in the call.
    throw new Error(
      "transition_record binding unavailable — the loaded srs-bindings WASM bundle predates RFC-022; rebuild/refresh the bundle from srs-rust"
    );
  }
  const raw = repo.transition_record(instanceId, JSON.stringify(input));
  return {
    record: normalizeRecord(raw.record),
    warnings: raw.warnings ?? [],
    successor: raw.successor ? normalizeRecord(raw.successor) : undefined,
    relation: raw.relation ? normalizeRelationRaw(raw.relation) : undefined,
  };
}

/**
 * Query which lifecycle transitions are available for `instanceId` and whether the record is in
 * an immutable (final) state. Returns `null` when the record's type has no lifecycle defined
 * (`LifecycleNotDefined`). Re-throws all other WASM errors so callers can handle them
 * conservatively (fail-closed: treat the record as immutable rather than allowing edits when
 * the lifecycle state is unknown).
 *
 * ADR-001: no transition-rule logic in TypeScript — this is a pure WASM pass-through.
 */
export function getAllowedLifecycleTransitions(
  repo: SrsRepository,
  instanceId: string
): AllowedLifecycleTransitionsResult | null {
  try {
    return repo.get_allowed_lifecycle_transitions(instanceId) as AllowedLifecycleTransitionsResult;
  } catch (e: unknown) {
    // Pinned to Rust error variant `record_store::LifecycleNotDefined` — update if renamed.
    if (e instanceof Error && e.message.includes("LifecycleNotDefined")) {
      return null;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Blueprint schema types (C2 / C8)
// ---------------------------------------------------------------------------

export interface SchemaProperty {
  title?: string;
  type?: string;
  /** Populated by WASM typeSchema() for url valueType fields (srs-rust type_schema_service.rs). Value "uri" → valueType "url" in blueprint-utils.ts. */
  format?: string;
  enum?: string[];
  /** May be absent (RFC-039 projections do not guarantee it) — never require it. */
  "x-srs-field-id"?: string;
  "x-srs-order"?: number;
  "x-srs-widget"?: string;
  // AI guidance emitted when aiGuidance is an object in the package field definition:
  "x-srs-ai-guidance"?: { purpose?: string; [key: string]: unknown };
  // Human help text for editors (srs-rust ADR-026): the field's own description
  // and fuller "how to complete this field" instructions.
  "x-srs-description"?: string;
  "x-srs-instructions"?: string;
  /** Composite-range fields (RFC-039) project as arrays of objects: `items.properties`
   * carries the sub-field schema and `x-srs-range-type-*` names the range Type. */
  items?: {
    type?: string;
    /** Present on list-cardinality scalar fields (e.g. "uri" for url lists). */
    format?: string;
    properties?: Record<string, SchemaProperty>;
    required?: string[];
    "x-srs-range-type-id"?: string;
    "x-srs-range-type-version"?: number;
  };
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
// Blueprint schema wrapper
// ---------------------------------------------------------------------------

/**
 * Project a blueprint into a JSON Schema describing the multi-record document
 * it declares. Returns the schema object and any non-fatal diagnostics.
 */
export function blueprintSchema(repo: SrsRepository, blueprintId: string): BlueprintSchemaResult {
  return repo.blueprint_schema(blueprintId) as BlueprintSchemaResult;
}

// ---------------------------------------------------------------------------
// Document view types + wrapper (C3 / C10)
// ---------------------------------------------------------------------------

/** Mirrors `ProjectedRelationTarget` in srs-rust `render_service.rs`. */
export interface ProjectedRelationTarget {
  instanceId: string;
  displayLabel: string;
}

/** Mirrors `ProjectedRelationRow` in srs-rust `render_service.rs`. */
export interface ProjectedRelationRow {
  label: string;
  targets: ProjectedRelationTarget[];
}

/**
 * A projected record row in a `DocumentViewProjection` section.
 * Mirrors `ProjectedRecord` in srs-rust `render_service.rs`.
 * `relations` is present when the document view defines a `relationsPresentation`.
 */
export interface ProjectedRecord {
  instanceId: string;
  typeId: string;
  typeNamespace: string;
  typeName: string;
  recordHeading?: string;
  preamble?: string;
  fields: Record<string, unknown>;
  orderedFieldKeys: string[];
  relations?: ProjectedRelationRow[];
}

/**
 * A section within a `DocumentViewProjection`.
 * Mirrors `ProjectedSection` in srs-rust `render_service.rs`.
 */
export interface ProjectedSection {
  sectionId: string;
  title?: string;
  order: number;
  records: ProjectedRecord[];
}

/**
 * The JSON projection output of `renderDocumentView("json")`.
 * Mirrors `DocumentViewProjection` in srs-rust `render_service.rs`.
 * `projection` in `DocumentViewResult` is this type when `format === "json"`.
 */
export interface DocumentViewProjection {
  $schema: string;
  // RFC-041/rfc-decision-92d2da05: the WASM projection's own key is
  // `compositionId`, not `documentViewId` (srs-rust#910) — nothing in this
  // app reads this field today, but the type must match what render_composition
  // actually returns.
  compositionId: string;
  containerId: string | null;
  generatedAt: string;
  containerTitle: string;
  preamble?: string;
  sections: ProjectedSection[];
}

export interface DocumentViewResult {
  rendered: string;
  diagnostics: string[];
  projection: DocumentViewProjection | null;
}

/**
 * Render a document view. Supported `format` values: `"json"`, `"markdown"`, `"html"`.
 * - `"json"`: `projection` is a DocumentViewProjection object; `rendered` is its JSON string.
 * - `"html"`: `rendered` is an HTML fragment (`<div class="srs-document">…</div>`); `projection` is null.
 * - `"markdown"`: `rendered` is a Markdown string; `projection` is null.
 * `containerId` scopes ContainerSubset sections (e.g. selecting which guide to render).
 * `instanceIdFilter` scopes ContainerSubset sections to a single record, producing a
 * per-record export document (srs-rust#373) — used for single-decision export.
 */
export function renderDocumentView(
  repo: SrsRepository,
  viewId: string,
  format: string,
  containerId?: string | null,
  instanceIdFilter?: string | null
): DocumentViewResult {
  return repo.render_composition(
    viewId,
    format,
    containerId,
    instanceIdFilter
  ) as DocumentViewResult;
}

// ---------------------------------------------------------------------------
// Container types + wrappers (C9 / C10)
// ---------------------------------------------------------------------------

export interface ContainerSummary {
  containerId: string;
  title: string;
  containerType?: string;
}

export interface Container {
  containerId: string;
  title: string;
  containerType?: string;
  rootInstanceIds?: string[];
  memberInstanceIds?: string[];
}

export interface ContainerListFilter {
  containerType?: string;
  memberInstanceId?: string;
  rootInstanceId?: string;
}

// ---------------------------------------------------------------------------
// Repository navigation types (srs-rust#268, RFC-013)
// ---------------------------------------------------------------------------

/**
 * A single node in the repository navigation tree.
 * Returned by `repositoryNavigation()` as either the identity node or a section.
 * `sectionContainerId` is present only on section nodes (absent on identity).
 * Mirrors `NavigationNode` in srs-rust `repository_navigation_service.rs`.
 */
export interface NavigationNode {
  instanceId: string;
  typeId: string;
  typeVersion: number;
  typeNamespace: string;
  typeName: string;
  displayLabel: string;
  sectionContainerId?: string;
}

/**
 * Full repository navigation result from `repositoryNavigation()`.
 * `sections` are ordered by `precedes` relations — same order as `srs repo navigation`.
 * `diagnostics` is non-empty when `manifest.container` is absent (pre-RFC-013 repo).
 * Mirrors `RepositoryNavigation` in srs-rust `repository_navigation_service.rs`.
 */
export interface RepositoryNavigation {
  rootContainerId: string;
  identity: NavigationNode;
  sections: NavigationNode[];
  diagnostics: string[];
}

/** List container summaries, optionally filtered by type / member / root instance. */
export function listContainers(
  repo: SrsRepository,
  filter: ContainerListFilter = {}
): ContainerSummary[] {
  return repo.list_containers(JSON.stringify(filter)) as ContainerSummary[];
}

/** Get a single container, including its root and member instance IDs. */
export function getContainer(repo: SrsRepository, containerId: string): Container {
  return repo.get_container(containerId) as Container;
}

/** Add an instance to a container's membership. Returns the updated member-id list. */
export function addContainerMember(
  repo: SrsRepository,
  containerId: string,
  instanceId: string
): string[] {
  return repo.add_container_member(containerId, instanceId) as string[];
}

/** Remove an instance from a container's membership. Returns the updated member-id list. */
export function removeContainerMember(
  repo: SrsRepository,
  containerId: string,
  instanceId: string
): string[] {
  return repo.remove_container_member(containerId, instanceId) as string[];
}

// ---------------------------------------------------------------------------
// New bindings: containersForInstance, typeSchema, listBlueprints,
// documentViewsForContainer (srs-rust#181 / srs-web#52)
// ---------------------------------------------------------------------------

// --- containersForInstance -------------------------------------------------

/**
 * List the containers an instance belongs to (reverse lookup).
 * Returns every container whose `memberInstanceIds` includes `instanceId`.
 * Returns an empty array (not an error) when the instance is not a container member.
 */
export function containersForInstance(repo: SrsRepository, instanceId: string): ContainerSummary[] {
  return repo.containers_for_instance(instanceId) as ContainerSummary[];
}

// --- typeSchema ------------------------------------------------------------

/**
 * Result of projecting a Type into a draft-07 JSON Schema.
 * `schema` is a JSON Schema object describing `fieldValues` for a single record of the type.
 * `diagnostics` carries non-fatal projection warnings (dangling fieldId, missing allowedValues, etc.).
 */
export interface TypeSchemaResult {
  schema: Record<string, unknown>;
  diagnostics: string[];
}

/**
 * Project a Type into a draft-07 JSON Schema describing a single record's `fieldValues`.
 * Pass `typeVersion` to pin a specific version; omit it (or pass `undefined`) to resolve
 * the latest version in the package.
 * Throws if the Type cannot be resolved.
 */
export function typeSchema(
  repo: SrsRepository,
  typeId: string,
  typeVersion?: number
): TypeSchemaResult {
  return repo.type_schema(typeId, typeVersion) as TypeSchemaResult;
}

// --- listTypes -------------------------------------------------------------

/** Lightweight type summary from `list_types` (latest version per type lineage). */
export interface TypeSummary {
  id: string;
  namespace: string;
  name: string;
  version: number;
  description?: string;
  sourcePackage?: string;
}

/**
 * List type definitions from the compiled package. Used to resolve the current
 * version of a type UUID (e.g. blueprint `$ref`s carry no version).
 */
export function listTypes(
  repo: SrsRepository,
  filter: Record<string, unknown> = {}
): TypeSummary[] {
  return repo.list_types(JSON.stringify(filter)) as TypeSummary[];
}

// --- listBlueprints --------------------------------------------------------

/**
 * Lightweight blueprint summary returned by `listBlueprints`.
 * `rootTypeCount` is the number of `rootTypes` ExactTypeRef entries declared in the blueprint.
 * `sourcePackage` is the package boundary selector string when the blueprint comes from a
 * sub-package boundary (absent for the primary package).
 */
export interface BlueprintSummary {
  id: string;
  namespace: string;
  name: string;
  version: number;
  description: string;
  rootTypeCount: number;
  sourcePackage?: string;
}

/** Result envelope from `list_blueprints`. */
export interface BlueprintListResult {
  summaries: BlueprintSummary[];
  /** WARN-level provenance diagnostics (missing blueprint files, duplicate IDs). */
  diagnostics: string[];
}

/**
 * List blueprint summaries across all package boundaries.
 * Returns `{ summaries: [], diagnostics: [] }` when no blueprints are registered.
 */
export function listBlueprints(repo: SrsRepository): BlueprintListResult {
  return repo.list_blueprints() as BlueprintListResult;
}

// --- documentViewsForContainer ---------------------------------------------

/**
 * Version-exact type anchor used in `DocumentView.rootTypeRefs` (RFC-009).
 */
export interface ExactTypeRef {
  typeId: string;
  typeVersion: number;
}

/** A single section within a DocumentView. */
export interface DocumentSection {
  sectionId: string;
  title?: string;
  description?: string;
  order: number;
  source: Record<string, unknown>;
  emptyBehavior?: string;
}

/**
 * Full DocumentView object (including `sections`), as returned by
 * `document_views_for_container`. Carries the section definitions the
 * web client needs to render the view for a container.
 */
export interface DocumentView {
  id: string;
  namespace: string;
  name: string;
  version: number;
  description: string;
  containerType?: string;
  rootTypeRefs?: ExactTypeRef[];
  sections: DocumentSection[];
  format?: string;
  preamble?: string;
  createdAt: string;
}

/**
 * List the DocumentViews that apply to a container, resolved via RFC-009 `rootTypeRefs`
 * matching: the container's first root instance's `typeId`/`typeVersion` is matched
 * against each DocumentView's `rootTypeRefs`.
 *
 * Returns full DocumentView objects (including `sections`) — not lightweight summaries —
 * because the caller needs the section definitions to render the view.
 * Returns an empty array (not an error) when no view binds the container's root type.
 */
export function documentViewsForContainer(
  repo: SrsRepository,
  containerId: string
): DocumentView[] {
  return repo.compositions_for_container(containerId) as DocumentView[];
}

// --- listDocumentViews -------------------------------------------------------

/**
 * Lightweight document-view summary returned by `listDocumentViews`.
 * Used for discovery (blueprint↔view pairing). For rendering, use
 * `documentViewsForContainer` which returns full `DocumentView` objects.
 *
 * `rootTypeRefs` is used for the authoritative UUID-chain join (ADR-008):
 *   a view belongs to a blueprint when `rootTypeRefs` contains the blueprint's root type UUID.
 * `containerType` is a hint field only (RFC-009) and is no longer used for discovery.
 */
export interface DocumentViewSummary {
  id: string;
  namespace: string;
  name: string;
  version: number;
  description: string;
  containerType?: string;
  rootTypeRefs?: ExactTypeRef[];
  sourcePackage?: string;
}

export interface DocumentViewListFilter {
  namespace?: string;
  name?: string;
}

/**
 * List document-view summaries across all package boundaries.
 * Returns an empty array when no document views are registered.
 * The WASM binding returns a bare array (not an envelope).
 *
 * `DocumentViewSummary` fields are camelCase because the Rust struct carries
 * `#[serde(rename_all = "camelCase")]` — no manual normalisation is needed.
 */
export function listDocumentViews(
  repo: SrsRepository,
  filter: DocumentViewListFilter = {}
): DocumentViewSummary[] {
  return repo.list_compositions(JSON.stringify(filter)) as DocumentViewSummary[];
}

// ---------------------------------------------------------------------------
// ContainerView types + wrapper (srs-rust#254, srs-web#96)
// ---------------------------------------------------------------------------

export interface ColumnSpec {
  fieldId: string;
  fieldName: string;
  displayLabel: string;
  order: number;
  required: boolean;
}

export interface ResolvedMember {
  instanceId: string;
  tier: number;
  displayLabel: string;
  record: SrsRecord;
}

export interface ContainerView {
  containerId: string;
  documentViewId?: string;
  root?: ResolvedMember;
  members: ResolvedMember[];
  columns: ColumnSpec[];
  excludeLifecycleStates: string[];
  diagnostics: string[];
}

// biome-ignore lint/suspicious/noExplicitAny: raw WASM ResolvedMember has unknown field case
function normalizeMember(m: any): ResolvedMember {
  const record = normalizeRecord(m.record);
  record.displayLabel = (m.displayLabel ?? m.display_label) || undefined;
  return {
    instanceId: m.instanceId ?? m.instance_id,
    tier: m.tier,
    displayLabel: m.displayLabel ?? m.display_label ?? "",
    record,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: raw WASM ColumnSpec has unknown field case
function normalizeColumnSpec(c: any): ColumnSpec {
  return {
    fieldId: c.fieldId ?? c.field_id,
    fieldName: c.fieldName ?? c.field_name,
    displayLabel: c.displayLabel ?? c.display_label ?? "",
    order: c.order,
    required: c.required ?? false,
  };
}

/**
 * Resolve the structured view of a container, including its ordered members and column spec.
 * ADR-001: pure WASM pass-through — all membership and display-label resolution stays in the core.
 * `record.displayLabel` is populated from the member-level WASM-resolved `displayLabel` (srs-web#114).
 *
 * Note: `members` arrive in stored (UUID-alphabetical) order, not precedes order.
 * The root record (tier 0) is `members[0]`; section members have tier > 0.
 * To get ordered sections: `view.members.filter(m => m.tier > 0).map(m => m.record)`, then apply `orderByPrecedes(repo, ids)`.
 */
export function resolveContainerView(
  repo: SrsRepository,
  containerId: string,
  viewId?: string | null
): ContainerView {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; normalised below
  const raw: any = repo.resolve_container_view(containerId, viewId ?? null);
  return {
    containerId: raw.containerId ?? raw.container_id,
    // Wire key is `compositionId` (ContainerView.composition_id, srs-rust
    // crates/srs-repository/src/container_view_service.rs, serde camelCase) —
    // confirmed at the source; resolve_container_view never emitted documentViewId.
    documentViewId: raw.compositionId ?? raw.composition_id,
    root: raw.root ? normalizeMember(raw.root) : undefined,
    members: (raw.members ?? []).map(normalizeMember),
    columns: (raw.columns ?? []).map(normalizeColumnSpec),
    excludeLifecycleStates: raw.excludeLifecycleStates ?? raw.exclude_lifecycle_states ?? [],
    diagnostics: raw.diagnostics ?? [],
  };
}

// ---------------------------------------------------------------------------
// Discovery: find + DiscoveryQuery/DiscoveryResult/DiscoveryHit (srs-rust#218)
// ---------------------------------------------------------------------------

/** Input to the WASM `find` binding (maps to srs-repository DiscoveryQuery). */
export interface DiscoveryQuery {
  typeId?: string;
  typeNamespace?: string;
  typeName?: string;
  containerId?: string;
  tag?: string[];
  lifecycleState?: string;
  excludeLifecycleStates?: string[];
  tier?: number;
  contentMatch?: string;
}

/** A single hit returned by `find`. */
export interface DiscoveryHit {
  instanceId: string;
  label: string;
  typeNamespace: string;
  typeName: string;
  lifecycleState?: string;
  score?: number;
  snippet?: string;
  matchedFields: string[];
}

/** Full result from the `find` binding. */
export interface DiscoveryResult {
  hits: DiscoveryHit[];
  total: number;
  diagnostics: string[];
}

// biome-ignore lint/suspicious/noExplicitAny: raw WASM DiscoveryHit has unknown field case
function normalizeDiscoveryHit(raw: any): DiscoveryHit {
  return {
    instanceId: raw.instanceId ?? raw.instance_id,
    label: raw.label,
    typeNamespace: raw.typeNamespace ?? raw.type_namespace,
    typeName: raw.typeName ?? raw.type_name,
    lifecycleState: raw.lifecycleState ?? raw.lifecycle_state,
    score: raw.score,
    snippet: raw.snippet,
    matchedFields: raw.matchedFields ?? raw.matched_fields ?? [],
  };
}

/**
 * Full-text search across all records in the repository.
 * Pass `contentMatch` for free-text; combine with `typeNamespace`/`typeName` to scope results.
 * Returns hits sorted deterministically by instanceId (not ranked).
 * ADR-001: callers must not pass governance-specific field names — use `contentMatch` only.
 */
export function find(repo: SrsRepository, query: DiscoveryQuery): DiscoveryResult {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; normalised below
  const raw: any = repo.find(JSON.stringify(query));
  return {
    hits: (raw.hits ?? []).map(normalizeDiscoveryHit),
    total: raw.total ?? 0,
    diagnostics: raw.diagnostics ?? [],
  };
}

// ---------------------------------------------------------------------------
// Vocabulary: listTerms + Term (srs-rust#303, RFC-006)
// ---------------------------------------------------------------------------

/** RFC-006 vocabulary Term returned by `list_terms`. */
export interface Term {
  id: string;
  label?: string;
  description?: string;
  aliases?: string[];
  roles?: string[];
}

/**
 * List RFC-006 vocabulary Terms from the repository.
 * Terms are single-word identifier fields — no snake_case/camelCase ambiguity.
 * Returns an empty array when no terms are registered.
 */
export function listTerms(repo: SrsRepository): Term[] {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary
  const raw: any[] = repo.list_terms();
  return raw.map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
    aliases: Array.isArray(r.aliases) ? r.aliases : undefined,
    roles: Array.isArray(r.roles) ? r.roles : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Repository navigation wrapper (srs-rust#268, RFC-013)
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: raw WASM NavigationNode has unknown field case
function normalizeNavigationNode(raw: any): NavigationNode {
  return {
    instanceId: raw.instanceId ?? raw.instance_id,
    typeId: raw.typeId ?? raw.type_id,
    typeVersion: raw.typeVersion ?? raw.type_version ?? 0,
    typeNamespace: raw.typeNamespace ?? raw.type_namespace,
    typeName: raw.typeName ?? raw.type_name,
    displayLabel: raw.displayLabel ?? raw.display_label ?? "",
    sectionContainerId: raw.sectionContainerId ?? raw.section_container_id,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: raw WASM RepositoryNavigation has unknown field case
function normalizeRepositoryNavigation(raw: any): RepositoryNavigation {
  return {
    rootContainerId: raw.rootContainerId ?? raw.root_container_id ?? "",
    identity: normalizeNavigationNode(raw.identity ?? {}),
    sections: (raw.sections ?? []).map(normalizeNavigationNode),
    diagnostics: raw.diagnostics ?? [],
  };
}

/**
 * Return the repository identity record and precedes-ordered section nodes.
 * Sources from `repository_navigation_service` (srs-rust#268), which reads the
 * RFC-013 root container from `manifest.container`.
 *
 * When `diagnostics` is non-empty, `manifest.container` is absent (pre-RFC-013 repo)
 * and `sections` is empty. Callers should fall back to `listContainers()` in that case.
 *
 * ADR-001: pure WASM pass-through — section ordering is computed in the Rust service.
 */
export function repositoryNavigation(repo: SrsRepository): RepositoryNavigation {
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; normalised below
  const raw: any = repo.repository_navigation();
  return normalizeRepositoryNavigation(raw);
}

// ---------------------------------------------------------------------------
// Create governance document (srs-web#141)
// ---------------------------------------------------------------------------

/** Result of scaffolding a new governance document — `CreateGovernanceRepositoryResult`
 * from `governance_scaffold_service` plus the live repo handle. */
export interface CreateGovernanceDocumentResult {
  repo: SrsRepository;
  repositoryId: string;
  identityRecordId: string;
  decisionLogContainerId: string;
  decisionLogRootId: string;
  rootContainerId: string;
}

/**
 * Scaffold governance records into a loaded seed repo.
 * Exported separately from `createGovernanceDocument` so unit tests can drive it
 * with a mock `SrsRepository` (the WASM loader is unavailable under vitest).
 *
 * ADR-001: TS supplies only `{ title, namespace? }`; identity stamping, record and
 * container creation all happen in the WASM `scaffold_new_repository` binding.
 * When `namespace` is omitted the core derives `com.example.<slug>` from the title.
 */
export function scaffoldGovernanceDocument(
  repo: SrsRepository,
  title: string,
  namespace?: string
): CreateGovernanceDocumentResult {
  const trimmed = title.trim();
  if (trimmed === "") throw new Error("A document name is required");
  // biome-ignore lint/suspicious/noExplicitAny: WASM boundary; normalised below
  const raw: any = repo.scaffold_new_repository(
    JSON.stringify({ title: trimmed, ...(namespace ? { namespace } : {}) })
  );
  return {
    repo,
    repositoryId: raw.repositoryId ?? raw.repository_id,
    identityRecordId: raw.identityRecordId ?? raw.identity_record_id,
    decisionLogContainerId: raw.decisionLogContainerId ?? raw.decision_log_container_id,
    decisionLogRootId: raw.decisionLogRootId ?? raw.decision_log_root_id,
    rootContainerId: raw.rootContainerId ?? raw.root_container_id,
  };
}

/**
 * Create a new governance document from the bundled RFC-014-migrated seed:
 * load the seed, then scaffold identity + Decision Log + root container in one
 * WASM call. Returns the loaded repo ready for the editor; callers persist it
 * via `exportSrsj()`.
 */
export function createGovernanceDocument(
  title: string,
  namespace?: string
): CreateGovernanceDocumentResult {
  const trimmed = title.trim();
  if (trimmed === "") throw new Error("A document name is required");
  return scaffoldGovernanceDocument(loadRepo(GOVERNANCE_SEED_SRSJ), trimmed, namespace);
}

/**
 * List all known migrations with their applicability status for this repository.
 * Normalises the WASM payload: the engine returns `status` as a string enum
 * ("needed" | "alreadyApplied" | "notApplicable") but TypeScript callers
 * consume it as `MigrationStatus { needed, alreadyApplied, notApplicable }`.
 */
export function availableMigrations(repo: SrsRepository): MigrationSummary[] {
  // biome-ignore lint/suspicious/noExplicitAny: WASM shape differs from TS type; normalised below
  const raw: any[] = repo.available_migrations() as any[];
  return raw.map((m) => {
    const statusStr: string = typeof m.status === "string" ? m.status : "";
    const status: MigrationStatus =
      typeof m.status === "object" && m.status !== null
        ? m.status
        : {
            needed: statusStr === "needed",
            alreadyApplied: statusStr === "alreadyApplied",
            notApplicable: statusStr === "notApplicable",
          };
    return { id: m.id, title: m.title, description: m.description, status };
  });
}

/**
 * Apply a migration by ID and return its result payload.
 * Throws if the ID is unknown or the migration fails.
 */
export function applyMigration(repo: SrsRepository, id: string): MigrationApplyResult {
  return repo.apply_migration(id) as MigrationApplyResult;
}

// ---------------------------------------------------------------------------
// Attachment wrappers (srs-rust#290, srs-rust#291, srs-web#99)
// ---------------------------------------------------------------------------

/**
 * List all attachments in the repository, optionally filtered.
 * Returns the source-documents path and an entry per attachment file.
 * ADR-001: pure WASM pass-through; all path resolution stays in the Rust core.
 */
export function listAttachments(
  repo: SrsRepository,
  filter: Record<string, unknown> = {}
): AttachmentListResult {
  return repo.list_attachments(JSON.stringify(filter)) as AttachmentListResult;
}

/**
 * Add a new attachment from raw bytes.
 * Bytes live only in MemoryStore; persist via `exportArchive()` (`.srs` ZIP).
 * ADR-001: no filename parsing, MIME inference, or content validation in TypeScript.
 */
export function addAttachment(
  repo: SrsRepository,
  input: AddAttachmentInput,
  fileBytes: Uint8Array
): AddAttachmentResult {
  return repo.add_attachment(JSON.stringify(input), fileBytes) as AddAttachmentResult;
}

/**
 * Link an existing attachment document to a record instance.
 * ADR-001: referential integrity is enforced by the Rust core.
 */
export function linkAttachment(
  repo: SrsRepository,
  input: LinkAttachmentInput
): LinkAttachmentResult {
  return repo.link_attachment(JSON.stringify(input)) as LinkAttachmentResult;
}

/**
 * Download the raw bytes for an attachment by document ID.
 * Returns a `Uint8Array` suitable for constructing a `Blob` for browser download.
 */
export function getAttachmentBytes(repo: SrsRepository, documentId: string): Uint8Array {
  return repo.get_attachment_bytes(documentId);
}

/**
 * Resolve all attachments linked to a record instance.
 * Returns `null` when the instance does not exist in the repository
 * (mirrors the `Option<GetRecordAttachmentsResult>` return from the Rust service).
 * ADR-001: pure WASM pass-through.
 */
export function getRecordAttachments(
  repo: SrsRepository,
  input: GetRecordAttachmentsInput
): GetRecordAttachmentsResult | null {
  const raw = repo.get_record_attachments(JSON.stringify(input));
  if (raw === null || raw === undefined) return null;
  return raw as GetRecordAttachmentsResult;
}
