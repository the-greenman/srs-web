/**
 * lens-distinctions — "Tell apart by" (ADR-025, plans/ux-lenses.md §7): the axis a pane splits its set by,
 * or deliberately none. Presentation over engine-returned data only: pure functions over already-loaded
 * items and edges (no engine calls). They group, never filter, and never derive membership.
 */
import type { CollectionBy } from "$lib/address.js";
import type { Item } from "./lens-data.js";

export interface ByOption {
  value: CollectionBy;
  label: string;
}

export const NOT_SET = "Not set";

/** More links than this and a record is a hub: "Add everything" skips it unless added deliberately. */
export const HUB_LINKS = 50;

/**
 * The options the current set supports: Nesting only for outlines, State and Created by only when some
 * member carries them.
 * ponytail: ADR-025 gap 6 (srs#931) — no field options; they come back with engine field ids.
 */
export function collectionOptions(items: Item[], outline: boolean): ByOption[] {
  const opts: ByOption[] = [
    { value: "none", label: "Nothing" },
    { value: "type", label: "Type" },
  ];
  if (outline) opts.push({ value: "nesting", label: "Nesting" });
  opts.push({ value: "container", label: "Container" });
  if (items.some((i) => i.lifecycle)) opts.push({ value: "state", label: "State" });
  if (items.some((i) => i.createdBy)) opts.push({ value: "created-by", label: "Created by" });
  return opts;
}

/**
 * The set told apart by `by`: items get a `group` heading, groups in order of first appearance with
 * "Not set" last. "nesting" keeps the loader's sections and depth; every other choice flattens depth.
 * A member in several groups (containers) appears under each. `created-by` groups by actor id.
 * A `field:<fieldId>` value is treated as the kind default (`opts.kindDefault`, else "type") until
 * ADR-025 gap 6 (srs#931): there is no field grouping.
 */
export function groupItems(
  items: Item[],
  by: CollectionBy,
  opts: { containersOf?: (id: string) => string[]; kindDefault?: CollectionBy } = {}
): Item[] {
  if (by.startsWith("field:")) {
    const fallback =
      opts.kindDefault && !opts.kindDefault.startsWith("field:") ? opts.kindDefault : "type";
    return groupItems(items, fallback, opts);
  }
  if (by === "nesting") return items;
  const flat = items.map((i) => ({ ...i, depth: 0, group: undefined }));
  if (by === "none") return flat;
  const containersOf = opts.containersOf ?? (() => []);
  const keys = (i: Item): string[] => {
    let v: unknown;
    if (by === "type") v = i.typeName;
    else if (by === "state") v = i.lifecycle;
    else if (by === "created-by") v = i.createdBy?.id;
    else if (by === "container") v = containersOf(i.id);
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

/** The one edge-to-set classifier (ADR-025): edges whose other end is in the set vs leaving it. */
export function splitByBoundary<E extends { id: string }>(
  edges: E[],
  inSet: ReadonlySet<string>
): { inside: E[]; outside: E[] } {
  return {
    inside: edges.filter((e) => inSet.has(e.id)),
    outside: edges.filter((e) => !inSet.has(e.id)),
  };
}

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
