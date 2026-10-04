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

/** The installed version of a type; throws when it is not installed. */
export function typeVersion(repo: SrsRepository, typeId: string): number {
  const t = listTypes(repo).find((x) => x.id === typeId);
  if (!t) throw new Error(`Type ${typeId} is not installed`);
  return t.version;
}
