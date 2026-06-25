/**
 * discovery.ts — blueprint↔view pairing helpers.
 *
 * ADR-004: discovery uses a string-convention join:
 *   a document view belongs to a blueprint when
 *   `view.namespace === blueprint.namespace && view.containerType === blueprint.name`.
 *
 * These helpers are pure functions over WASM-returned summary metadata
 * (BlueprintSummary / DocumentViewSummary). No SRS semantics — ADR-001 compliant.
 */

import type { BlueprintSummary, DocumentViewSummary } from "./srs-client.js";

/**
 * Return the document-view summaries whose `namespace` and `containerType`
 * match the given blueprint's `namespace` and `name` (ADR-004 string-convention join).
 *
 * Returns an empty array when no views are paired with the blueprint.
 */
export function documentViewsForBlueprint(
  blueprint: BlueprintSummary,
  views: DocumentViewSummary[]
): DocumentViewSummary[] {
  return views.filter(
    (v) => v.namespace === blueprint.namespace && v.containerType === blueprint.name
  );
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
