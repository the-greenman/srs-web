/**
 * document-model.ts — blueprint-driven document model: which blueprint governs
 * a composition, what its editable page looks like (root + ordered blocks), and
 * which component types can be inserted into it.
 *
 * Shared by `BlueprintDocumentEditor` (the generic shell's Documents surface)
 * and `GuidesShell` (srs-web#322) — one implementation of "what is this
 * document made of", never reimplemented per client.
 *
 * ADR-001: zero SRS semantics in TypeScript. All traversal/matching delegates
 * to WASM-returned structures (blueprintSchema, resolveContainerView,
 * orderByPrecedes); this module only shapes the result for the editor UI.
 */

import { documentViewsForBlueprint } from "$lib/discovery.js";
import { rootTypeId } from "$lib/editor/blueprint-fields.js";
import {
  type BlueprintSummary,
  type DocumentView,
  type DocumentViewSummary,
  type ResolvedMember,
  type SrsRepository,
  blueprintSchema,
  listBlueprints,
  listContainers,
  listTypes,
  orderByPrecedes,
  resolveContainerView,
} from "$lib/srs-client.js";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Return the blueprint whose root type matches one of `composition`'s
 * `rootTypeRefs` — the inverse of `documentViewsForBlueprint` in `discovery.ts`
 * (which goes blueprint → views). Reuses that same UUID-chain-join predicate
 * (ADR-008) instead of reimplementing the match, just iterated the other way.
 * Returns `null` when no installed blueprint governs this composition.
 */
export function blueprintForComposition(
  repo: SrsRepository,
  composition: DocumentView | DocumentViewSummary
): BlueprintSummary | null {
  if (!composition.rootTypeRefs || composition.rootTypeRefs.length === 0) return null;
  const { summaries } = listBlueprints(repo);
  for (const bp of summaries) {
    try {
      const { schema } = blueprintSchema(repo, bp.id);
      const bpRootId = rootTypeId(schema);
      if (bpRootId && documentViewsForBlueprint(bpRootId, [composition]).length > 0) {
        return bp;
      }
    } catch {
      // Malformed/unresolvable blueprint — skip it, it does not govern this composition.
    }
  }
  return null;
}

/** A single editable component (a Tier-2 record) in a loaded document. */
export interface DocumentBlock {
  instanceId: string;
  typeId: string;
  typeVersion: number;
  label: string;
}

/** A document resolved from a composition: its identity/root record, container, and ordered components. */
export interface LoadedDocument {
  root: ResolvedMember | null;
  containerId: string;
  blocks: DocumentBlock[];
}

/** Find a container-subset section's fixed `containerId`, if any section declares one (not the zero-UUID placeholder). */
function fixedContainerId(composition: DocumentView | DocumentViewSummary): string | null {
  const sections = "sections" in composition ? composition.sections : undefined;
  for (const section of sections ?? []) {
    const source = section.source as { type?: string; containerId?: string } | undefined;
    if (
      source?.type === "container-subset" &&
      source.containerId &&
      source.containerId !== ZERO_UUID
    ) {
      return source.containerId;
    }
  }
  return null;
}

/** Resolve the singleton container whose root record's type matches one of the composition's `rootTypeRefs`. */
function containerForRootType(
  repo: SrsRepository,
  composition: DocumentView | DocumentViewSummary
): string | null {
  const rootTypeIds = new Set((composition.rootTypeRefs ?? []).map((r) => r.typeId));
  if (rootTypeIds.size === 0) return null;
  for (const summary of listContainers(repo)) {
    try {
      const view = resolveContainerView(repo, summary.containerId);
      if (view.root && rootTypeIds.has(view.root.record.typeId)) return summary.containerId;
    } catch {
      // Container failed to resolve (dangling root, etc.) — not a candidate.
    }
  }
  return null;
}

/**
 * Resolve a composition into an editable document: the container it scopes,
 * its anchor/root record, and its non-root members in `precedes` display order.
 *
 * Container resolution tries, in order: a section's fixed container-subset
 * `containerId`, then a container whose root record matches the composition's
 * `rootTypeRefs` (the singleton-page case, e.g. a homepage composition).
 * Returns `null` when neither resolves.
 *
 * Members may form several disjoint `precedes` chains (a homepage's main chain
 * plus feature/item sub-chains and orphans) — `orderByPrecedes`'s own ordering
 * is kept as-is for display; this function does not merge or reorder chains.
 */
export function loadDocument(
  repo: SrsRepository,
  composition: DocumentView | DocumentViewSummary
): LoadedDocument | null {
  const containerId = fixedContainerId(composition) ?? containerForRootType(repo, composition);
  if (!containerId) return null;

  const view = resolveContainerView(repo, containerId);
  const rootId = view.root?.instanceId;
  const nonRoot = view.members.filter((m) => m.tier > 0 && m.instanceId !== rootId);
  const orderedIds = orderByPrecedes(
    repo,
    nonRoot.map((m) => m.instanceId)
  );
  const byId = new Map(nonRoot.map((m) => [m.instanceId, m]));

  const blocks: DocumentBlock[] = orderedIds
    .map((id) => byId.get(id))
    .filter((m): m is ResolvedMember => m !== undefined)
    .map((m) => ({
      instanceId: m.instanceId,
      typeId: m.record.typeId,
      typeVersion: m.record.typeVersion,
      label: m.displayLabel || m.record.typeName || "Untitled",
    }));

  return { root: view.root ?? null, containerId, blocks };
}

/** An insertable component type, resolved from a blueprint's relation-group schemas. */
export interface ComponentTypeDescriptor {
  typeId: string;
  typeVersion: number;
  label: string;
}

/**
 * Union of every type listed in any ordered relation-group property of the
 * blueprint's schema (`contains`, `precedes`, or any other declared relation
 * type) — the RFC-041 `oneOf` expansion already lists every concrete subtype,
 * so this is a flat union with no inheritance walking. Labelled from
 * `listTypes()` (description, falling back to name) rather than the schema,
 * which carries no human label for a bare `$ref`.
 */
export function componentTypes(
  repo: SrsRepository,
  blueprint: BlueprintSummary
): ComponentTypeDescriptor[] {
  const { schema } = blueprintSchema(repo, blueprint.id);
  const types = listTypes(repo);
  const versionByTypeId = new Map(types.map((t) => [t.id, t.version]));
  const labelByTypeId = new Map(types.map((t) => [t.id, t.description || t.name]));

  const seen = new Map<string, ComponentTypeDescriptor>();
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (key === "root" || !prop) continue;
    const oneOf = "items" in prop ? (prop.items?.oneOf ?? []) : [];
    for (const ref of oneOf) {
      const typeId = ref.$ref.replace(/^#\/definitions\//, "");
      if (seen.has(typeId)) continue;
      seen.set(typeId, {
        typeId,
        typeVersion: versionByTypeId.get(typeId) ?? 1,
        label: labelByTypeId.get(typeId) ?? `Type (${typeId.slice(0, 8)})`,
      });
    }
  }
  return [...seen.values()];
}
