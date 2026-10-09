/**
 * lens-distinctions — "Tell apart by" (plans/ux-lenses.md §7): the axis a pane splits its set by, or
 * deliberately none. Pure functions over already-loaded items and edges (no engine calls), so the
 * grouping and the inside/outside-the-set split are testable with fixtures.
 */
import type { Item } from "./lens-data.js";

/** Collection distinctions: "nothing" | "type" | "nesting" | "container" | "state" | "createdBy" | "field:<name>". */
export type By = string;
/** Context distinctions. */
export type CtxBy = "link" | "nothing" | "boundary";

export interface ByOption {
  value: By;
  label: string;
}

export interface SelectField {
  name: string;
  label: string;
}

export const NOT_SET = "Not set";

/** The options the current set supports; each is offered only when some member carries it (Nesting: an outline). */
export function collectionOptions(
  items: Item[],
  selectFields: SelectField[],
  outline = false
): ByOption[] {
  const opts: ByOption[] = [
    { value: "nothing", label: "Nothing" },
    { value: "type", label: "Type" },
  ];
  if (outline || items.some((i) => i.depth > 0 || i.sectionContainerId || i.group !== undefined))
    opts.push({ value: "nesting", label: "Nesting" });
  opts.push({ value: "container", label: "Container" });
  if (items.some((i) => i.lifecycle)) opts.push({ value: "state", label: "State" });
  if (items.some((i) => i.createdBy)) opts.push({ value: "createdBy", label: "Created by" });
  for (const f of selectFields) opts.push({ value: `field:${f.name}`, label: f.label });
  return opts;
}

/**
 * The set told apart by `by`: items get a `group` heading, groups in order of first appearance with
 * "Not set" last. "nesting" keeps the loader's sections and depth; every other choice flattens depth.
 * A member in several groups (containers, a multiselect) appears under each.
 */
export function groupItems(
  items: Item[],
  by: By,
  containersOf: (id: string) => string[] = () => []
): Item[] {
  if (by === "nesting") return items;
  const flat = items.map((i) => ({ ...i, depth: 0, group: undefined }));
  if (by === "nothing") return flat;
  const keys = (i: Item): string[] => {
    let v: unknown;
    if (by === "type") v = i.typeName;
    else if (by === "state") v = i.lifecycle;
    else if (by === "createdBy")
      v = i.createdBy ? (i.createdBy.kind === "ai" ? "AI" : "Human") : undefined;
    else if (by === "container") v = containersOf(i.id);
    else if (by.startsWith("field:")) v = i.record?.fieldValues[by.slice(6)];
    const list = (Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== "").map(String);
    return list.length > 0 ? list : [NOT_SET];
  };
  const buckets = new Map<string, Item[]>();
  for (const i of flat)
    for (const k of keys(i)) {
      const b = buckets.get(k) ?? [];
      b.push({ ...i, group: k });
      buckets.set(k, b);
    }
  const order = [...buckets.keys()].sort((a, b) => Number(a === NOT_SET) - Number(b === NOT_SET));
  return order.flatMap((k) => buckets.get(k) ?? []);
}

/** The field names every record in the set carries a short value for (board columns under "Nothing"). */
export function sharedFields(items: Item[], max = 5): string[] {
  const recs = items.flatMap((i) => (i.record ? [i.record] : []));
  if (recs.length === 0) return [];
  const short = (v: unknown) =>
    v != null &&
    v !== "" &&
    (typeof v !== "string" || v.length <= 80) &&
    !(Array.isArray(v) && typeof v[0] === "object");
  return Object.keys(recs[0].fieldValues)
    .filter((k) =>
      recs.every((r) => short(r.fieldValues[k]) && r.fieldValues[k] !== r.displayLabel)
    )
    .slice(0, max);
}

/** Links whose other end is a member of the set, and links that leave it. */
export function splitByBoundary<E extends { id: string }>(
  edges: E[],
  inSet: Set<string>
): { inside: E[]; outside: E[] } {
  return {
    inside: edges.filter((e) => inSet.has(e.id)),
    outside: edges.filter((e) => !inSet.has(e.id)),
  };
}

/** More links than this and a record is a hub: "Add everything" skips it unless added deliberately. */
export const HUB_LINKS = 50;

/** Split records to add into those to add and the hubs to skip (more than `max` links). */
export function skipHubs<T extends { id: string }>(
  items: T[],
  links: (id: string) => number,
  max = HUB_LINKS
): { add: T[]; skipped: T[] } {
  const add: T[] = [];
  const skipped: T[] = [];
  for (const i of items) (links(i.id) > max ? skipped : add).push(i);
  return { add, skipped };
}
