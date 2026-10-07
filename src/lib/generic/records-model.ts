import type { DiscoveryFacets } from "$lib/srs-client.js";

/** Rows per page, in a group and in the flat list. Also the size at or below which a repo needs no groups. */
export const PAGE = 50;
/** The type-filter value (and group key) for Tier 0 notes, which carry no type. */
export const NOTES = "__notes__";

export interface TypeGroup {
  /** The typeId, or NOTES. */
  key: string;
  name: string;
  namespace: string;
  count: number;
}

/** Non-empty types from the facet, by count then name, with a Notes group last when there are notes. */
export function typeGroups(facets: DiscoveryFacets): TypeGroup[] {
  const groups = facets.byType
    .filter((t) => t.count > 0)
    .map((t) => {
      const slash = t.value.lastIndexOf("/");
      return {
        key: t.typeId,
        name: t.value.slice(slash + 1),
        namespace: slash < 0 ? "" : t.value.slice(0, slash),
        count: t.count,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (facets.notes > 0)
    groups.push({ key: NOTES, name: "Notes", namespace: "", count: facets.notes });
  return groups;
}
