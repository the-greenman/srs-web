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
 * to WASM-returned structures (blueprintSchema, blueprintStructure,
 * resolveContainerView, renderDocumentView's JSON projection); this module
 * only shapes the result for the editor UI.
 *
 * srs-web#322 step 3 (srs-rust#1127): the document's block tree — order AND
 * nesting — comes straight from the engine's JSON projection (`children` on
 * each `ProjectedRecord`), the same structure the HTML/Markdown preview
 * nests under a parent. The editor never re-derives nesting itself (no
 * `contains` traversal, no precedes-chain merging in TS) — that is exactly
 * the "editor order must equal preview order" guarantee: both surfaces read
 * the same engine output.
 */

import { documentViewsForBlueprint } from "$lib/discovery.js";
import { rootTypeId } from "$lib/editor/blueprint-fields.js";
import {
  type BlueprintSummary,
  type DocumentView,
  type DocumentViewSummary,
  type ProjectedRecord,
  type ResolvedMember,
  type SrsRepository,
  blueprintSchema,
  blueprintStructure,
  documentViewsForContainer,
  getTypeExtends,
  listBlueprints,
  listContainers,
  listTypes,
  renderDocumentView,
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

/** A single editable component (a Tier-2 record) in a loaded document, nested under its `contains` parent (if any). */
export interface DocumentBlock {
  instanceId: string;
  typeId: string;
  typeVersion: number;
  label: string;
  children: DocumentBlock[];
}

/** Map one projected record (and its `children`, recursively) into a `DocumentBlock`. */
function toBlock(record: ProjectedRecord): DocumentBlock {
  return {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeVersion: record.typeVersion,
    label: record.recordHeading || record.typeName || "Untitled",
    children: (record.children ?? []).map(toBlock),
  };
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

/**
 * A `listDocumentViews` summary carries no `sections`, so its container-subset
 * `containerId` is invisible. Recover the full Composition via the engine's
 * `compositions_for_container` (the only binding returning full objects).
 * Without this, sibling variants sharing a root type all resolve to the first
 * matching container.
 */
function fullComposition(repo: SrsRepository, summary: DocumentViewSummary): DocumentView | null {
  for (const container of listContainers(repo)) {
    const match = documentViewsForContainer(repo, container.containerId).find(
      (view) => view.id === summary.id
    );
    if (match) return match;
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
 * its anchor/root record, and its top-level blocks, nested and ordered
 * exactly as the engine's own JSON projection returns them (srs-rust#1127).
 *
 * Container resolution tries, in order: a section's fixed container-subset
 * `containerId`, then a container whose root record matches the composition's
 * `rootTypeRefs` (the singleton-page case, e.g. a homepage composition).
 * Returns `null` when neither resolves.
 */
export function loadDocument(
  repo: SrsRepository,
  composition: DocumentView | DocumentViewSummary
): LoadedDocument | null {
  const full = "sections" in composition ? composition : fullComposition(repo, composition);
  const containerId = (full && fixedContainerId(full)) ?? containerForRootType(repo, composition);
  if (!containerId) return null;

  const view = resolveContainerView(repo, containerId);
  const rootId = view.root?.instanceId;
  const { projection } = renderDocumentView(repo, composition.id, "json", containerId);
  // The projection's top-level section records include the container's own
  // root/anchor record (it is a direct member like any other) — exclude it
  // here since it is rendered separately as the page-root form, not a block.
  const blocks: DocumentBlock[] = (projection?.sections ?? []).flatMap((section) =>
    section.records.filter((r) => r.instanceId !== rootId).map(toBlock)
  );

  return { root: view.root ?? null, containerId, blocks };
}

/** An insertable component type, resolved from a blueprint's relation-group schemas. */
export interface ComponentTypeDescriptor {
  typeId: string;
  typeVersion: number;
  label: string;
  description?: string;
}

/** "homepage-hero" → "Homepage hero", "section.text" → "Section text". */
export function typeNameLabel(name: string): string {
  const words = name
    .split(/[.\-_]+/)
    .filter(Boolean)
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `typeId` plus every type that (transitively) `extendsTypeId`s it — the RFC-032 inheritance chain, walked forward. */
function typeAndSubtypes(
  repo: SrsRepository,
  types: { id: string }[],
  typeId: string
): Set<string> {
  const result = new Set([typeId]);
  let added = true;
  while (added) {
    added = false;
    for (const t of types) {
      if (result.has(t.id)) continue;
      const parent = getTypeExtends(repo, t.id);
      if (parent && result.has(parent)) {
        result.add(t.id);
        added = true;
      }
    }
  }
  return result;
}

/** True when `ancestorId` is `typeId` itself or one of its (transitive) `extendsTypeId` ancestors. */
function isAncestorOrSelf(repo: SrsRepository, ancestorId: string, typeId: string): boolean {
  let current: string | null = typeId;
  for (let depth = 0; current && depth < 16; depth++) {
    if (current === ancestorId) return true;
    current = getTypeExtends(repo, current);
  }
  return false;
}

/**
 * Union of every type listed in any ordered relation-group property of the
 * blueprint's schema (`contains`, `precedes`, or any other declared relation
 * type) — the RFC-041 `oneOf` expansion already lists every concrete subtype,
 * so this is a flat union with no inheritance walking. Labelled from
 * `listTypes()` (humanised type name; the description rides along as a hint) rather than the schema,
 * which carries no human label for a bare `$ref`.
 *
 * Excludes types that are only ever a `contains`-child of a non-root parent
 * (srs-web#322 step 4) — a feature card or decision item is offered by
 * `childTypes()` on its own group block, not in the top-level picker. A type
 * whose only declared parent IS the blueprint's root type (e.g. the guide
 * blueprint's root→sections `contains`) stays in the top-level list.
 */
export function componentTypes(
  repo: SrsRepository,
  blueprint: BlueprintSummary
): ComponentTypeDescriptor[] {
  const { schema } = blueprintSchema(repo, blueprint.id);
  const types = listTypes(repo);
  const versionByTypeId = new Map(types.map((t) => [t.id, t.version]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  const seen = new Map<string, ComponentTypeDescriptor>();
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (key === "root" || !prop) continue;
    const oneOf = "items" in prop ? (prop.items?.oneOf ?? []) : [];
    for (const ref of oneOf) {
      const typeId = ref.$ref.replace(/^#\/definitions\//, "");
      if (seen.has(typeId)) continue;
      const type = typeById.get(typeId);
      seen.set(typeId, {
        typeId,
        typeVersion: versionByTypeId.get(typeId) ?? 1,
        label: type ? typeNameLabel(type.name) : `Type (${typeId.slice(0, 8)})`,
        description: type?.description,
      });
    }
  }
  // A type another offered type extends is an abstract base (homepage-section):
  // SRS has no abstract marker, so hide bases that have an offered subtype.
  const bases = new Set<string>();
  for (const typeId of seen.keys()) {
    let parent = getTypeExtends(repo, typeId);
    for (let depth = 0; parent && depth < 16; depth++) {
      bases.add(parent);
      parent = getTypeExtends(repo, parent);
    }
  }

  const rootId = rootTypeId(schema);
  const nonRootChildIds = new Set<string>();
  for (const spec of blueprintStructure(repo, blueprint.id)) {
    if (spec.relationType !== "contains") continue;
    if (spec.sourceTypeId === rootId) continue;
    for (const t of typeAndSubtypes(repo, types, spec.targetTypeId)) nonRootChildIds.add(t);
  }

  return [...seen.values()].filter((t) => !bases.has(t.typeId) && !nonRootChildIds.has(t.typeId));
}

/**
 * The types a group block of type `parentTypeId` can contain (srs-web#322
 * step 4): every `contains` spec whose source is `parentTypeId` or one of
 * its ancestors, target expanded to its own subtypes. Powers a block's own
 * "+ Add <child>" picker, distinct from the page-level `componentTypes()`.
 */
export function childTypes(
  repo: SrsRepository,
  blueprint: BlueprintSummary,
  parentTypeId: string
): ComponentTypeDescriptor[] {
  const types = listTypes(repo);
  const versionByTypeId = new Map(types.map((t) => [t.id, t.version]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  const seen = new Map<string, ComponentTypeDescriptor>();
  for (const spec of blueprintStructure(repo, blueprint.id)) {
    if (spec.relationType !== "contains") continue;
    if (!isAncestorOrSelf(repo, spec.sourceTypeId, parentTypeId)) continue;
    for (const typeId of typeAndSubtypes(repo, types, spec.targetTypeId)) {
      if (seen.has(typeId)) continue;
      const type = typeById.get(typeId);
      seen.set(typeId, {
        typeId,
        typeVersion: versionByTypeId.get(typeId) ?? 1,
        label: type ? typeNameLabel(type.name) : `Type (${typeId.slice(0, 8)})`,
        description: type?.description,
      });
    }
  }
  return [...seen.values()];
}
