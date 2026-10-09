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
import { type ContextGroupDef, type Lens, relationLabel } from "./lens.js";

export const PAGE = 100;
export const NEIGHBOUR_PAGE = 20;

export interface Item {
  id: string;
  label: string;
  typeName?: string;
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
const compositionTitle = (v: { name: string }) => {
  const t = v.name.replaceAll(/[-_]/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function memberItems(repo: SrsRepository, containerId: string, group?: string): Item[] {
  const view = resolveContainerView(repo, containerId);
  const byId = new Map(view.members.map((m) => [m.instanceId, m]));
  return getContainerOutline(repo, containerId).body.map((e) => {
    const m = byId.get(e.instanceId);
    return {
      id: e.instanceId,
      label: m?.displayLabel || e.instanceId.slice(0, 8),
      typeName: typeLabel(m?.record?.typeName),
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
    return names.map((n) => ({ name: n, label: fields.find((f) => f.name === n)?.label ?? n }));
  return fields
    .filter((f) => f.valueType !== "markdown" && f.valueType !== "text")
    .slice(0, 4)
    .map((f) => ({ name: f.name, label: f.label }));
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
      const all = listRecords(repo, { typeNamespace: t.namespace, typeName: t.name });
      const groupBy = c.groupBy;
      const items = all.map((r) => {
        const g = groupBy ? r.fieldValues[groupBy] : undefined;
        return recordItem(r, typeof g === "string" ? g : groupBy ? "—" : undefined);
      });
      if (groupBy) items.sort((a, b) => (a.group ?? "").localeCompare(b.group ?? ""));
      return {
        items: items.slice(0, offset + PAGE),
        columns: typeColumns(repo, c.typeId, lens.columns),
        total: items.length,
      };
    }
    case "find": {
      const r = find(repo, {}, { limit: offset + PAGE, offset: 0 });
      return {
        items: r.hits.map((h) => ({
          id: h.instanceId,
          label: h.label,
          typeName: typeLabel(h.typeName),
          lifecycle: h.lifecycleState,
          depth: 0,
        })),
        columns: [],
        total: r.total,
      };
    }
  }
}

/** One level of a nested anchored container, placed under `parent`. */
export function expandItem(repo: SrsRepository, parent: Item): Item[] {
  if (!parent.sectionContainerId) return [];
  return memberItems(repo, parent.sectionContainerId, parent.group).map((i) => ({
    ...i,
    depth: i.depth + parent.depth + 1,
  }));
}

export type FocusData =
  | {
      kind: "reading" | "form";
      record: SrsRecord;
      fields: FieldFormDef[];
      composites: CompositeFormDef[];
    }
  | { kind: "document"; html: string; diagnostics: string[]; title: string; containerId: string }
  | { kind: "note"; id: string; label: string }
  | { kind: "none" };

export function loadReading(
  repo: SrsRepository,
  id: string,
  kind: "reading" | "form",
  label = ""
): FocusData {
  let record: SrsRecord | null;
  try {
    record = getRecord(repo, id);
  } catch {
    // ponytail: a Tier 0 note is not a record and getRecord throws; no note read binding is wired here.
    return { kind: "note", id, label: label || id.slice(0, 8) };
  }
  if (!record) return { kind: "none" };
  try {
    const def = typeSchema(repo, record.typeId, record.typeVersion)
      .schema as unknown as SchemaDefinition;
    return {
      kind,
      record,
      fields: definitionToFields(def),
      composites: definitionToComposites(def),
    };
  } catch {
    return { kind, record, fields: [], composites: [] };
  }
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

/** Render the record's document: the lens composition if given, else the first that binds its container. */
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
      const r = renderDocumentView(repo, pick, "html", containerId);
      if (r.rendered.trim())
        return {
          kind: "document",
          html: r.rendered,
          diagnostics: r.diagnostics,
          title: getContainer(repo, containerId).title,
          containerId,
        };
    } catch {
      // Try the next container; a record with no renderable container falls back to reading.
    }
  }
  return loadReading(repo, id, "reading");
}

export interface ContextItem {
  id: string;
  label: string;
  typeName?: string;
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

/** Both-direction edges of one relation type (or all), for the graph layout. */
export function graphEdges(repo: SrsRepository, id: string, relationType?: string) {
  return neighbours(repo, id, { relationType, limit: 40 }).neighbours.map((n) => ({
    id: n.neighbour.instanceId,
    label: n.neighbour.label,
    relationType: relationLabel(n.relationType),
    direction: n.direction,
  }));
}
