/**
 * TEMPORARY STOPGAP. Owner decision of 2026-10-28 on srs-web#607 (option b): record duplication
 * lives here in `$lib` only until the core service `record duplicate` (srs-rust#1505, core + CLI +
 * WASM) ships. Per capability-layering, duplication semantics belong in the core; when the
 * binding lands, callers (srs-web and the muDemocracy site editor) move onto it and this file is
 * deleted. Do not grow it.
 */
import {
  type SrsRecord,
  type SrsRelation,
  type SrsRepository,
  createRecordSuccessor,
  createRelation,
} from "./srs-client";

/** The small, portable part of copying a record: the caller chooses which graph edges are meaningful. */
export interface DuplicateRelation {
  relationType: string;
  sourceId: string;
  targetId: string;
  meta?: Record<string, unknown>;
}

export interface DuplicateRecordOptions {
  /** Relations incident on the source that are safe to recreate for the duplicate. */
  relations?: DuplicateRelation[];
  /** The successor relation is provenance, normally `derived-from`. */
  relationType?: string;
}

export interface DuplicateRecordResult {
  record: SrsRecord;
  relation: SrsRelation;
  copiedRelations: SrsRelation[];
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Make an independent record derived from `source` without applying a fork's replacement
 * semantics. Values and record metadata are copied deeply; only relations supplied by the caller
 * are recreated. This deliberately knows nothing about document placement or structural edges.
 */
export function duplicateRecord(
  repo: SrsRepository,
  source: SrsRecord,
  options: DuplicateRecordOptions = {}
): DuplicateRecordResult {
  const result = createRecordSuccessor(repo, source.instanceId, {
    relationType: options.relationType ?? "derived-from",
    fieldValues: clone(source.fieldValues),
    ...(source.fieldMeta ? { fieldMeta: clone(source.fieldMeta) } : {}),
    typeVersion: source.typeVersion,
  });

  // `meta` is instance metadata rather than field metadata (for example editor not-a-claim marks),
  // so successor input cannot carry it. Preserve it in a follow-up engine write (update_record
  // merges envelope extras such as `meta`, srs-rust#1031).
  if (source.meta !== undefined)
    repo.update_record(
      result.record.instanceId,
      JSON.stringify({ fieldValues: clone(source.fieldValues), meta: clone(source.meta) })
    );

  const copiedRelations: SrsRelation[] = [];
  for (const edge of options.relations ?? []) {
    const sourceInstanceId =
      edge.sourceId === source.instanceId ? result.record.instanceId : edge.sourceId;
    const targetInstanceId =
      edge.targetId === source.instanceId ? result.record.instanceId : edge.targetId;
    // Ignore malformed, non-incident edges rather than silently copying unrelated graph state.
    if (sourceInstanceId === edge.sourceId && targetInstanceId === edge.targetId) continue;
    copiedRelations.push(
      createRelation(repo, {
        relationType: edge.relationType,
        sourceInstanceId,
        targetInstanceId,
        ...(edge.meta !== undefined ? { meta: clone(edge.meta) } : {}),
      })
    );
  }
  return { ...result, copiedRelations };
}
