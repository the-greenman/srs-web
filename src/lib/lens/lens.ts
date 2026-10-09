/**
 * Lens — presentation-only wiring that says how the three panes (Collection, Focus, Context)
 * are populated and labelled for one way of looking at a repository (ADR-025, plans/ux-lenses.md §2).
 * Derived lenses only: every id names an engine object the WASM bindings already resolve, and no
 * repository id, field name, relation key or namespace decides anything here.
 */
import type { CollectionBy, LensId } from "$lib/address.js";
import { humanise } from "$lib/labels.js";
import {
  type RelationTypeInfo,
  type SrsRepository,
  find,
  listDocumentViews,
  listTypes,
  repositoryNavigation,
} from "$lib/srs-client.js";
import type { ContextItem } from "./lens-data.js";

export type Layout = "trail" | "reader" | "board" | "graph";

export type Collection =
  /** A container's members in arranged order with depth. */
  | { kind: "outline"; containerId: string }
  /** A composition's sections, each listing its container's members. */
  | { kind: "composition"; compositionId: string }
  /** Every record of a type. */
  | { kind: "type"; typeId: string }
  /** A hand-drawn set ("My set"): these records, in this order. */
  | { kind: "ids"; ids: string[] }
  /** Everything: `find` over the repository. */
  | { kind: "find" };

/**
 * How Focus starts (switchable in its header). "read" = one record as prose. "document" = the set as one
 * continuous read of record blocks (selectable, editable in place). "published" = the composition
 * rendered by the engine (read-only; `compositionId`, else the first that shows the record).
 */
export type Focus = { kind: "read" } | { kind: "document" | "published"; compositionId?: string };

export interface Lens {
  id: LensId;
  label: string;
  collection: Collection;
  focus: Focus;
}

export interface ContextGroupDef {
  relationType: string;
  /** Relative to the selected record: "in" = the neighbour points at it. */
  direction: "in" | "out";
  label: string;
}

/**
 * One group per (relationType, direction) present in `edges`: installed types in listRelationTypes order,
 * out before in, labelled from RelationTypeInfo.label (humanise(key) when empty); a key listRelationTypes
 * does not return sorts last, labelled humanise(key).
 */
export function defaultContext(edges: ContextItem[], types: RelationTypeInfo[]): ContextGroupDef[] {
  const present = new Set(edges.map((e) => `${e.direction} ${e.relationType}`));
  const keys = [
    ...types.map((t) => t.key),
    ...new Set(edges.map((e) => e.relationType).filter((k) => !types.some((t) => t.key === k))),
  ];
  return keys.flatMap((key) => {
    const label = types.find((t) => t.key === key)?.label || humanise(key);
    return (["out", "in"] as const)
      .filter((direction) => present.has(`${direction} ${key}`))
      .map((direction) => ({ relationType: key, direction, label }));
  });
}

/** Kind-derived defaults only (outline → "nesting", else "type"). */
export function defaultBy(c: Collection): CollectionBy {
  return c.kind === "outline" ? "nesting" : "type";
}

/**
 * nav lenses (depth-0 sections with a sectionContainerId; the identity entry is not a section), comp lenses
 * (listDocumentViews order), type lenses (facets.byType by count), find; plus `set` when `set` is non-empty.
 */
export function deriveLenses(repo: SrsRepository, set: string[] = []): Lens[] {
  const out: Lens[] = [];
  try {
    for (const s of repositoryNavigation(repo).sections) {
      if (s.sectionContainerId && (s.depth ?? 0) === 0)
        out.push({
          id: `nav:${s.sectionContainerId}`,
          label: s.displayLabel,
          collection: { kind: "outline", containerId: s.sectionContainerId },
          focus: { kind: "read" },
        });
    }
  } catch {
    // A pre-RFC-013 repository has no navigation; the type lenses still work.
  }
  for (const c of listDocumentViews(repo))
    out.push({
      id: `comp:${c.id}`,
      // ponytail: ADR-025 gap 5 (srs#928) — a Composition has no display title; humanise its name.
      label: humanise(c.name),
      collection: { kind: "composition", compositionId: c.id },
      focus: { kind: "published", compositionId: c.id },
    });
  const names = new Map(listTypes(repo).map((t) => [t.id, t.name]));
  const types = [...find(repo, {}, { limit: 0, byTypeLimit: 0 }).facets.byType].sort(
    (a, b) => b.count - a.count
  );
  for (const t of types)
    out.push({
      id: `type:${t.typeId}`,
      label: humanise(names.get(t.typeId) ?? t.typeId),
      collection: { kind: "type", typeId: t.typeId },
      focus: { kind: "read" },
    });
  out.push({
    id: "find",
    label: "Everything",
    collection: { kind: "find" },
    focus: { kind: "read" },
  });
  if (set.length > 0)
    out.push({
      id: "set",
      label: "My set",
      collection: { kind: "ids", ids: set },
      focus: { kind: "read" },
    });
  return out;
}
