/**
 * lens-data — every engine read the lens panes need, as plain functions over the WASM client so the
 * three components stay presentational (fixture-renderable on /styleguide). No SRS semantics here:
 * labels, order, depth, columns and neighbours all come resolved from the core.
 */
import { definitionToComposites, definitionToFields } from "$lib/editor/blueprint-fields.js";
import type { CompositeFormDef } from "$lib/editor/blueprint-fields.js";
import type { FieldFormDef } from "$lib/governance/types.js";
import {
  type Actor,
  type DocumentView,
  type Neighbour,
  type ProjectedRecord,
  type SchemaDefinition,
  type SrsRecord,
  type SrsRepository,
  containersForInstance,
  documentViewsForContainer,
  find,
  getContainer,
  getContainerOutline,
  getRecord,
  listContainers,
  listDocumentViews,
  listRecords,
  listTypes,
  neighbours,
  renderDocumentView,
  repositoryNavigation,
  resolveContainerView,
  typeSchema,
} from "$lib/srs-client.js";
import { type ContextGroupDef, type Lens, humanise, relationLabel } from "./lens.js";

export const PAGE = 100;
export const NEIGHBOUR_PAGE = 20;

export interface Item {
  id: string;
  label: string;
  typeName?: string;
  typeId?: string;
  lifecycle?: string;
  createdBy?: Actor;
  depth: number;
  /** A nested anchored container this entry roots; expandable one level. */
  sectionContainerId?: string;
  /** Group heading (a section title, container title or select value). */
  group?: string;
  record?: SrsRecord;
}

export interface Column {
  name: string;
  label: string;
}

export interface CollectionData {
  items: Item[];
  columns: Column[];
  total: number;
}

const typeLabel = (name?: string) => name?.replaceAll(/[-_]/g, " ");
/** A composition's name as a title ("guide-body-view" → "Guide body view"); never its description. */
const compositionTitle = (v: { name: string }) => humanise(v.name);
/** A field's display label, or its humanised name when the schema title is only its description. */
const fieldLabel = (f: { name: string; label: string; description?: string }) =>
  f.label && f.label !== f.name && f.label !== f.description ? f.label : humanise(f.name);

function memberItems(repo: SrsRepository, containerId: string, group?: string): Item[] {
  const view = resolveContainerView(repo, containerId);
  const byId = new Map(view.members.map((m) => [m.instanceId, m]));
  return getContainerOutline(repo, containerId).body.map((e) => {
    const m = byId.get(e.instanceId);
    return {
      id: e.instanceId,
      label: m?.displayLabel || e.instanceId.slice(0, 8),
      typeName: typeLabel(m?.record?.typeName),
      typeId: m?.record?.typeId,
      lifecycle: m?.record?.lifecycle,
      createdBy: m?.record?.createdBy,
      depth: e.depth,
      sectionContainerId: m?.sectionContainerId,
      group,
      record: m?.record,
    };
  });
}

function recordItem(r: SrsRecord, group?: string): Item {
  return {
    id: r.instanceId,
    label: r.displayLabel || r.instanceId.slice(0, 8),
    typeName: typeLabel(r.typeName),
    typeId: r.typeId,
    lifecycle: r.lifecycle,
    createdBy: r.createdBy,
    depth: 0,
    group,
    record: r,
  };
}

/** The type's first four scalar (non-markdown, non-list) fields as table columns. */
function typeColumns(repo: SrsRepository, typeId: string, names?: string[]): Column[] {
  const def = typeSchema(repo, typeId).schema as unknown as SchemaDefinition;
  const fields = definitionToFields(def);
  if (names)
    return names.map((n) => {
      const f = fields.find((x) => x.name === n);
      return { name: n, label: f ? fieldLabel(f) : humanise(n) };
    });
  return fields
    .filter((f) => f.valueType !== "markdown" && f.valueType !== "text")
    .slice(0, 4)
    .map((f) => ({ name: f.name, label: fieldLabel(f) }));
}

export function loadCollection(repo: SrsRepository, lens: Lens, offset = 0): CollectionData {
  const c = lens.collection;
  switch (c.kind) {
    case "outline": {
      const ids = [c.containerId, ...(c.also ?? [])];
      const items = ids.flatMap((id) =>
        memberItems(repo, id, ids.length > 1 ? getContainer(repo, id).title : undefined)
      );
      const view = resolveContainerView(repo, c.containerId);
      const columns = lens.columns
        ? lens.columns.map((n) => ({
            name: n,
            label: view.columns.find((col) => col.fieldName === n)?.displayLabel ?? n,
          }))
        : view.columns.slice(0, 4).map((col) => ({ name: col.fieldName, label: col.displayLabel }));
      return { items, columns, total: items.length };
    }
    case "navigation": {
      const items = repositoryNavigation(repo).sections.map((s) => ({
        id: s.instanceId,
        label: s.displayLabel,
        typeName: typeLabel(s.typeName),
        depth: s.depth ?? 0,
        sectionContainerId: s.sectionContainerId,
        record: tryRecord(repo, s.instanceId),
      }));
      return { items, columns: [], total: items.length };
    }
    case "composition": {
      // ponytail: no WASM binding returns one Composition by id (compositions_for_container misses a
      // composition with no rootTypeRefs, e.g. the problem grid), so the JSON projection stands in:
      // its sections name the records; getRecord fills lifecycle and createdBy.
      const projection = renderDocumentView(repo, c.compositionId, "json").projection;
      const flatten = (rs: ProjectedRecord[]): ProjectedRecord[] =>
        rs.flatMap((r) => [r, ...flatten(r.children ?? [])]);
      const items = (projection?.sections ?? []).flatMap((s) =>
        flatten(s.records).map((pr) => {
          const r = getRecord(repo, pr.instanceId);
          return r
            ? recordItem(r, s.title ?? "")
            : {
                id: pr.instanceId,
                label: pr.recordHeading ?? pr.instanceId.slice(0, 8),
                depth: 0,
                group: s.title ?? "",
              };
        })
      );
      const first = items.find((i) => i.record);
      const columns = first?.record ? typeColumns(repo, first.record.typeId, lens.columns) : [];
      return { items, columns, total: items.length };
    }
    case "type": {
      const t = listTypes(repo).find((x) => x.id === c.typeId);
      if (!t) return { items: [], columns: [], total: 0 };
      const items = listRecords(repo, { typeNamespace: t.namespace, typeName: t.name }).map((r) =>
        recordItem(r)
      );
      return {
        items: items.slice(0, offset + PAGE),
        columns: typeColumns(repo, c.typeId, lens.columns),
        total: items.length,
      };
    }
    case "find": {
      const r = find(repo, {}, { limit: offset + PAGE, offset: 0 });
      return {
        // ponytail: one getRecord per hit so "Tell apart by" a field and board columns work; a find
        // projection with field values would save the round trips.
        items: r.hits.map((h) => ({
          id: h.instanceId,
          label: h.label,
          typeName: typeLabel(h.typeName),
          typeId: h.typeId,
          lifecycle: h.lifecycleState,
          depth: 0,
          record: tryRecord(repo, h.instanceId),
        })),
        columns: [],
        total: r.total,
      };
    }
    case "ids": {
      const items = c.ids.map((id) => {
        const r = tryRecord(repo, id);
        return r ? recordItem(r) : { id, label: id.slice(0, 8), depth: 0 };
      });
      const first = items.find((i) => i.record);
      const columns = first?.record ? typeColumns(repo, first.record.typeId, lens.columns) : [];
      return { items, columns, total: items.length };
    }
  }
}

/** A record, or undefined for a Tier 0 note (getRecord throws on one). */
export function tryRecord(repo: SrsRepository, id: string): SrsRecord | undefined {
  try {
    return getRecord(repo, id) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The closed select fields of the set's types (union by name, schema order), for "Tell apart by".
 * ponytail: `find` facets only count types, not select values, so every collection kind reads the
 * members' typeSchema; a select-value facet on `find` would make this one call.
 */
export function selectFields(
  repo: SrsRepository,
  items: Item[]
): { name: string; label: string }[] {
  const out = new Map<string, string>();
  for (const typeId of new Set(items.flatMap((i) => (i.typeId ? [i.typeId] : [])))) {
    try {
      const def = typeSchema(repo, typeId).schema as unknown as SchemaDefinition;
      for (const f of definitionToFields(def))
        if (f.valueType === "select" && (f.options?.length ?? 0) > 0 && !out.has(f.name))
          out.set(f.name, fieldLabel(f));
    } catch {
      // A type whose schema does not project offers no fields.
    }
  }
  return [...out].map(([name, label]) => ({ name, label }));
}

/** One level of a nested anchored container, placed under `parent`. */
export function expandItem(repo: SrsRepository, parent: Item): Item[] {
  if (!parent.sectionContainerId) return [];
  return memberItems(repo, parent.sectionContainerId, parent.group).map((i) => ({
    ...i,
    depth: i.depth + parent.depth + 1,
  }));
}

/** One record ready to read as prose (or edit): the record and its schema fields; no record = a note. */
export interface ReadData {
  id: string;
  label: string;
  record?: SrsRecord;
  fields: FieldFormDef[];
  composites: CompositeFormDef[];
}

export type FocusData =
  | { kind: "read"; block: ReadData }
  /**
   * Document composed from records, one read block each (selectable, editable): `head` is the record
   * that anchors the container, shown as the document's heading (else `title`).
   */
  | { kind: "blocks"; title: string; head?: ReadData; blocks: ReadData[] }
  /** Document rendered from a composition (markdown through the core renderMarkdown), read-only. */
  | { kind: "document"; markdown: string; containerId: string }
  | { kind: "none" };

const schemaCache = new WeakMap<SrsRepository, Map<string, SchemaDefinition | null>>();
function schemaOf(repo: SrsRepository, r: SrsRecord): SchemaDefinition | null {
  const m = schemaCache.get(repo) ?? new Map<string, SchemaDefinition | null>();
  schemaCache.set(repo, m);
  const key = `${r.typeId}@${r.typeVersion}`;
  if (!m.has(key)) {
    try {
      m.set(key, typeSchema(repo, r.typeId, r.typeVersion).schema as unknown as SchemaDefinition);
    } catch {
      m.set(key, null);
    }
  }
  return m.get(key) ?? null;
}

export function loadRead(
  repo: SrsRepository,
  id: string,
  label = "",
  record = tryRecord(repo, id)
): ReadData {
  if (!record) return { id, label: label || id.slice(0, 8), fields: [], composites: [] };
  const def = schemaOf(repo, record);
  return {
    id,
    label: record.displayLabel || label || id.slice(0, 8),
    record,
    fields: def ? definitionToFields(def).map((f) => ({ ...f, label: fieldLabel(f) })) : [],
    composites: def ? definitionToComposites(def) : [],
  };
}

/** The Collection as one document: every listed record as a read block, in collection order. */
export function loadBlocks(repo: SrsRepository, items: Item[]): ReadData[] {
  return items.map((i) => loadRead(repo, i.id, i.label, i.record ?? tryRecord(repo, i.id)));
}

/**
 * A container as one document: its anchor record as the heading block, then the body entries in
 * arranged order (getContainerOutline's body excludes the anchor and identity).
 * ponytail: one level only, and every block renders through the generic read block; a nested container's
 * members and per-type rendering (a section's lede vs body as the site shows it) would re-implement the
 * engine's view; block anchors in render_composition would let the published render be selectable instead.
 */
export function loadContainerBlocks(
  repo: SrsRepository,
  containerId: string
): { head?: ReadData; blocks: ReadData[] } {
  const anchor = getContainerOutline(repo, containerId).anchorInstanceId;
  return {
    head: anchor ? loadRead(repo, anchor) : undefined,
    blocks: loadBlocks(repo, memberItems(repo, containerId)),
  };
}

/** The containers a record anchors, then the ones it is a member of, then a caller hint. */
export function containersOf(repo: SrsRepository, id: string, hint?: string): string[] {
  const ids = [
    ...listContainers(repo, { anchorInstanceId: id }).map((c) => c.containerId),
    ...containersForInstance(repo, id).map((c) => c.containerId),
  ];
  if (hint) ids.unshift(hint);
  return [...new Set(ids)];
}

/**
 * Compositions keyed by the container they render, including those `compositions_for_container` cannot
 * reach (no rootTypeRefs, a fixed container-subset section: the site pages, the problem grid). Each
 * composition's JSON projection names its container; computed once per repository.
 */
const fixedByContainer = new WeakMap<SrsRepository, Map<string, Shown[]>>();
function compositionsByContainer(repo: SrsRepository): Map<string, Shown[]> {
  let map = fixedByContainer.get(repo);
  if (map) return map;
  map = new Map();
  // ponytail: one JSON render per composition at first use; a `get_composition` binding would make this a lookup.
  for (const v of listDocumentViews(repo)) {
    try {
      const containerId = renderDocumentView(repo, v.id, "json").projection?.containerId;
      if (!containerId) continue;
      const list = map.get(containerId) ?? [];
      list.push({ compositionId: v.id, containerId, label: compositionTitle(v) });
      map.set(containerId, list);
    } catch {
      // A composition that cannot render without a container is reachable through compositions_for_container.
    }
  }
  fixedByContainer.set(repo, map);
  return map;
}

export interface Shown {
  compositionId: string;
  containerId: string;
  label: string;
}

/** The compositions that render each container the record belongs to. */
export function shownIn(repo: SrsRepository, containerIds: string[]): Shown[] {
  const fixed = compositionsByContainer(repo);
  return containerIds.flatMap((containerId) => {
    const bound = documentViewsForContainer(repo, containerId).map((v: DocumentView) => ({
      compositionId: v.id,
      containerId,
      label: compositionTitle(v),
    }));
    const extra = (fixed.get(containerId) ?? []).filter(
      (f) => !bound.some((b) => b.compositionId === f.compositionId)
    );
    return [...bound, ...extra];
  });
}

/**
 * Render the record's document: the lens composition if given, else the first that binds its container.
 * Markdown, not html: the html renderer leaves inline markdown in field values literal (backticks,
 * fences, link markup); the core renderMarkdown renders the whole thing.
 * ponytail: the rendered document carries no instance ids per block, so it cannot highlight or scroll to
 * the selection; that needs an engine hook (block anchors in render_composition).
 */
export function loadDocument(
  repo: SrsRepository,
  id: string,
  compositionId?: string,
  hint?: string
): FocusData {
  const containers = containersOf(repo, id, hint);
  for (const containerId of containers) {
    const views = shownIn(repo, [containerId]);
    const pick = compositionId ?? views[0]?.compositionId;
    if (!pick) continue;
    try {
      const r = renderDocumentView(repo, pick, "markdown", containerId);
      if (r.rendered.trim()) return { kind: "document", markdown: r.rendered, containerId };
    } catch {
      // Try the next container; a record with no renderable container falls back to reading.
    }
  }
  return { kind: "read", block: loadRead(repo, id) };
}

export interface ContextItem {
  id: string;
  label: string;
  typeName?: string;
  /** Set on flat / inside-outside lists, where the group no longer says which link it is. */
  direction?: "in" | "out";
  relation?: string;
}

export interface ContextGroupData {
  def: ContextGroupDef;
  total: number;
  items: ContextItem[];
}

export function loadGroup(
  repo: SrsRepository,
  id: string,
  def: ContextGroupDef,
  offset = 0
): ContextGroupData {
  const opts = { relationType: def.relationType, direction: def.direction };
  let total: number;
  let page: Neighbour[];
  if (def.types) {
    const types = def.types;
    // ponytail: `neighbours` has no type axis, so a typed group reads every edge of the relation and
    // filters here; a type filter on the binding would keep paging in the engine.
    const all = neighbours(repo, id, { ...opts, limit: 10_000 }).neighbours.filter((n) =>
      types.includes(`${n.neighbour.typeNamespace ?? ""}/${n.neighbour.typeName ?? ""}`)
    );
    total = all.length;
    page = all.slice(offset, offset + NEIGHBOUR_PAGE);
  } else {
    const r = neighbours(repo, id, { ...opts, limit: NEIGHBOUR_PAGE, offset });
    total = r.total;
    page = r.neighbours;
  }
  return {
    def,
    total,
    items: page.map((n) => ({
      id: n.neighbour.instanceId,
      label: n.neighbour.label,
      typeName: typeLabel(n.neighbour.typeName),
    })),
  };
}

/**
 * Every link of the record, both ways, for the flat and inside/outside Context lists.
 * ponytail: capped at 500 edges; a hub record beyond that needs paging per group.
 */
export function allEdges(repo: SrsRepository, id: string): ContextItem[] {
  return neighbours(repo, id, { limit: 500 }).neighbours.map((n) => ({
    id: n.neighbour.instanceId,
    label: n.neighbour.label,
    typeName: typeLabel(n.neighbour.typeName),
    direction: n.direction,
    relation: relationLabel(n.relationType),
  }));
}

/** Both-direction edges of one relation type (or all), for the graph layout; `name` labels each direction. */
export function graphEdges(
  repo: SrsRepository,
  id: string,
  relationType?: string,
  name: (key: string, direction: "in" | "out") => string = relationLabel
) {
  return neighbours(repo, id, { relationType, limit: 40 }).neighbours.map((n) => ({
    id: n.neighbour.instanceId,
    label: n.neighbour.label,
    relationType: name(n.relationType, n.direction),
    direction: n.direction,
  }));
}
