/**
 * discovery.ts — blueprint↔view pairing helpers.
 *
 * ADR-008: discovery uses the RFC-009 UUID-chain join:
 *   a document view belongs to a blueprint when view.rootTypeRefs contains
 *   an ExactTypeRef whose typeId matches the blueprint's root type UUID.
 *
 * These helpers are pure functions over WASM-returned summary metadata
 * (BlueprintSummary / DocumentViewSummary). No SRS semantics — ADR-001 compliant.
 */

import type { BlueprintSummary, DocumentViewSummary } from "./srs-client.js";

/**
 * Return the document-view summaries whose `rootTypeRefs` include the given
 * root type UUID (ADR-008 UUID-chain join, supersedes ADR-004 string-convention join).
 *
 * Callers obtain `rootTypeId` from `blueprintSchema()` via the `rootTypeId()` helper
 * in `blueprint-utils.ts`.
 *
 * Returns an empty array when no views are paired with the blueprint.
 */
export function documentViewsForBlueprint(
  rootTypeId: string,
  views: DocumentViewSummary[]
): DocumentViewSummary[] {
  return views.filter((v) => v.rootTypeRefs?.some((r) => r.typeId === rootTypeId) ?? false);
}

/**
 * Find a blueprint by namespace and name.
 * Returns `null` when no matching blueprint is registered.
 */
export function findBlueprint(
  blueprints: BlueprintSummary[],
  namespace: string,
  name: string
): BlueprintSummary | null {
  return blueprints.find((b) => b.namespace === namespace && b.name === name) ?? null;
}
