/** Small shared reads over the engine's type list (pass-through; no SRS semantics). */
import { listRecords, listTypes } from "$lib/srs-client.js";
import type { SrsRecord, SrsRepository, TypeSummary } from "$lib/srs-client.js";

/** Records whose resolved type id is `typeId` (identity is the type UUID, never namespace/name). */
export function recordsOfType(
  repo: SrsRepository,
  types: TypeSummary[],
  typeId: string
): SrsRecord[] {
  const t = types.find((x) => x.id === typeId);
  if (!t) return [];
  return listRecords(repo, { typeNamespace: t.namespace, typeName: t.name }).filter(
    (r) => r.typeId === typeId
  );
}

/**
 * The newest installed version of a type; throws when it is not installed. Versions sit side by side
 * (srs-rust#1473), so new records bind to the latest one.
 */
export function typeVersion(repo: SrsRepository, typeId: string): number {
  const versions = listTypes(repo)
    .filter((x) => x.id === typeId)
    .map((x) => x.version);
  if (!versions.length) throw new Error(`Type ${typeId} is not installed`);
  return Math.max(...versions);
}
