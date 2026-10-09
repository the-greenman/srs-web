/**
 * lens-data — every engine read the lens panes need, as plain functions over the WASM client so the
 * three components stay presentational (fixture-renderable on /styleguide). No SRS semantics here:
 * labels, order, depth, columns and neighbours all come resolved from the core, and no relation
 * result is computed in TypeScript (ADR-025, D10).
 */
import { definitionToComposites, definitionToFields } from "$lib/editor/blueprint-fields.js";
import type { CompositeFormDef } from "$lib/editor/blueprint-fields.js";
import type { FieldFormDef } from "$lib/governance/types.js";
import { humanise } from "$lib/labels.js";
import {
  type Actor,
  type DiscoveryHit,
  type ProjectedRecord,
  type SchemaDefinition,
  type SrsRecord,
  type SrsRepository,
  containersForInstance,
  documentViewsForContainer,
  find,
  getContainerOutline,
  getRecord,
  listContainers,
  neighbours,
  renderDocumentView,
  resolveContainerView,
  typeSchema,
} from "$lib/srs-client.js";
import type { ContextGroupDef, Lens } from "./lens.js";

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
  /** Group heading (a section title, container title or distinction value). */
  group?: string;
  record?: SrsRecord;
}

/**
 * A board column: a ColumnSpec column (carries fieldId; its cells are read by the core-provided
 * `fieldName`, as the governance list pane reads them), or one of the fixed label/type/state columns.
 */
export type Column =
  | { kind: "field"; fieldId: string; fieldName: string; label: string }
  | { kind: "label" | "type" | "state" };

export interface CollectionData {
  items: Item[];
  columns: Column[];
  total: number;
}

export interface ContextItem {
  id: string;
  label: string;
  typeName?: string;
  direction: "in" | "out";
  relationType: string;
}

export interface ContextGroupData {
  def: ContextGroupDef;
  total: number;
  items: ContextItem[];
}

export interface Shown {
  compositionId: string;
  containerId: string;
  label: string;
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

/** A type name in user words, through the one shared humaniser. */
const typeLabel = (name?: string) => (name ? humanise(name) : undefined);
/** ponytail: ADR-025 gap 5 (srs#928) — a Composition has no display title; humanise its name. */
const compositionTitle = (v: { name: string }) => humanise(v.name);
/** Sets with no container view: label, type and state only. */
// ponytail: ADR-025 gap 6 (srs#931) — schema-order field columns wait for engine field ids.
const FIXED_COLUMNS: Column[] = [{ kind: "label" }, { kind: "type" }, { kind: "state" }];

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

/** A find hit as an item: the record when it reads, else the hit's own label and type. */
function hitItem(repo: SrsRepository, h: DiscoveryHit): Item {
  // ponytail: ADR-025 gap 4 (srs-rust#1380) — find hits carry no field values, so one getRecord per hit.
  const r = tryRecord(repo, h.instanceId);
  return r
    ? recordItem(r)
    : {
        id: h.instanceId,
        label: h.label,
        typeName: typeLabel(h.typeName),
        typeId: h.typeId,
        lifecycle: h.lifecycleState,
        depth: 0,
      };
}

/**
 * Where each Item's `record` comes from: outline → resolveContainerView members' `record`;
 * type → find({ typeId }, { limit: offset + PAGE }) then getRecord per hit (gap 4);
 * find → find({}, { limit: offset + PAGE }) then getRecord per hit (gap 4);
 * composition → the JSON render projection's ids then getRecord (gap 1).
 * columns: resolveContainerView(...).columns for outline lenses; [label, type, state] for every other kind (gap 6).
 */
export function loadCollection(repo: SrsRepository, lens: Lens, offset = 0): CollectionData {
  const c = lens.collection;
  switch (c.kind) {
    case "outline": {
      const items = memberItems(repo, c.containerId);
      const columns: Column[] = [...resolveContainerView(repo, c.containerId).columns]
        .sort((a, b) => a.order - b.order)
        .slice(0, 4)
        .map((col) => ({
          kind: "field",
          fieldId: col.fieldId,
          fieldName: col.fieldName,
          label: col.displayLabel,
        }));
      return { items, columns, total: items.length };
    }
    case "composition": {
      // ponytail: ADR-025 gap 1 (srs-rust#1378) — no binding reads one Composition by id with its
      // sections, so the JSON projection stands in: its sections name the records.
      const projection = renderDocumentView(repo, c.compositionId, "json").projection;
      const flatten = (rs: ProjectedRecord[]): ProjectedRecord[] =>
        rs.flatMap((r) => [r, ...flatten(r.children ?? [])]);
      const items = (projection?.sections ?? []).flatMap((s) =>
        flatten(s.records).map((pr) => {
          const r = tryRecord(repo, pr.instanceId);
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
      return { items, columns: FIXED_COLUMNS, total: items.length };
    }
    case "type": {
      const r = find(repo, { typeId: c.typeId }, { limit: offset + PAGE, offset: 0 });
      return { items: r.hits.map((h) => hitItem(repo, h)), columns: FIXED_COLUMNS, total: r.total };
    }
    case "find": {
      const r = find(repo, {}, { limit: offset + PAGE, offset: 0 });
      return { items: r.hits.map((h) => hitItem(repo, h)), columns: FIXED_COLUMNS, total: r.total };
    }
  }
}

/** A record, or undefined for a Tier 0 note (getRecord throws on one). */
export function tryRecord(repo: SrsRepository, id: string): SrsRecord | undefined {
  // ponytail: ADR-025 gap 3 (srs-rust#1379) — a Tier 0 note cannot be read through WASM.
  try {
    return getRecord(repo, id) ?? undefined;
  } catch {
    return undefined;
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
    fields: def ? definitionToFields(def) : [],
    composites: def ? definitionToComposites(def) : [],
  };
}

/** The Collection as one document: every listed record as a read block, in collection order. */
export function loadBlocks(repo: SrsRepository, items: Item[]): ReadData[] {
  return items.map((i) => loadRead(repo, i.id, i.label, i.record ?? tryRecord(repo, i.id)));
}

/**
 * The container's anchor as `head`, then its body entries in arranged order (getContainerOutline's body
 * excludes the anchor and identity).
 * ponytail: ADR-025 gap 2 (srs-rust#1288) — the rendered composition has no per-record anchors, so
 * Document builds its own blocks; presentation limit: one level deep, every block through RecordProse.
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
 * documentViewsForContainer over the given containers; nothing else (D10). A composition with a fixed
 * container section is missing until ADR-025 gap 1 (srs-rust#1378).
 */
export function shownIn(repo: SrsRepository, containerIds: string[]): Shown[] {
  return containerIds.flatMap((containerId) =>
    documentViewsForContainer(repo, containerId).map((v) => ({
      compositionId: v.id,
      containerId,
      label: compositionTitle(v),
    }))
  );
}

/**
 * Renders `compositionId`, else the first shownIn composition of the record's containers, as markdown;
 * else a read block. Markdown, not html: the html renderer leaves inline markdown in field values literal.
 * ponytail: ADR-025 gap 2 (srs-rust#1288) — the rendered document carries no instance ids per block,
 * so it cannot highlight or scroll to the selection.
 */
export function loadDocument(
  repo: SrsRepository,
  id: string,
  compositionId?: string,
  hint?: string
): FocusData {
  for (const containerId of containersOf(repo, id, hint)) {
    const pick = compositionId ?? shownIn(repo, [containerId])[0]?.compositionId;
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

/** Every edge of the record: one neighbours(repo, id) call with no limit. */
export function loadEdges(repo: SrsRepository, id: string): ContextItem[] {
  return neighbours(repo, id).neighbours.map((n) => ({
    id: n.neighbour.instanceId,
    label: n.neighbour.label,
    typeName: typeLabel(n.neighbour.typeName),
    direction: n.direction,
    relationType: n.relationType,
  }));
}

const sameDef = (e: ContextItem, d: ContextGroupDef) =>
  e.relationType === d.relationType && e.direction === d.direction;

/** Buckets `edges` by the defs (same relationType and direction); `total` = bucket size. No engine call. */
export function groupEdges(edges: ContextItem[], defs: ContextGroupDef[]): ContextGroupData[] {
  return defs.map((def) => {
    const items = edges.filter((e) => sameDef(e, def));
    return { def, total: items.length, items };
  });
}
