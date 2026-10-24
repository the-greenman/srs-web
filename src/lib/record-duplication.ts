import { createRecordSuccessor, type SrsRecord, type SrsRelation, type SrsRepository } from "./srs-client";

/** The small, portable part of copying a record: the caller chooses which graph edges are meaningful. */
export interface DuplicateRelation {
  relationType: string;
  sourceId: string;
  targetId: string;
  meta?: unknown;
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
  // so successor input cannot carry it. Preserve it in a follow-up engine write.
  if (source.meta !== undefined)
    repo.update_record(result.record.instanceId, JSON.stringify({
      fieldValues: clone(source.fieldValues),
      meta: clone(source.meta),
    }));

  const copiedRelations: SrsRelation[] = [];
  for (const edge of options.relations ?? []) {
    const sourceInstanceId = edge.sourceId === source.instanceId ? result.record.instanceId : edge.sourceId;
    const targetInstanceId = edge.targetId === source.instanceId ? result.record.instanceId : edge.targetId;
    // Ignore malformed, non-incident edges rather than silently copying unrelated graph state.
    if (sourceInstanceId === edge.sourceId && targetInstanceId === edge.targetId) continue;
    const raw = repo.create_relation(JSON.stringify({
      relationType: edge.relationType,
      sourceInstanceId,
      targetInstanceId,
      ...(edge.meta !== undefined ? { meta: clone(edge.meta) } : {}),
    }));
    copiedRelations.push({
      relationId: raw.relationId,
      relationType: raw.relationType,
      sourceInstanceId: raw.sourceInstanceId,
      targetInstanceId: raw.targetInstanceId,
      assertedBy: raw.assertedBy,
      confidence: raw.confidence,
      status: raw.status,
      createdAt: raw.createdAt,
    });
  }
  return { ...result, copiedRelations };
}
