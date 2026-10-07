/** Pure layout for the relation map: a radial focus view and a capped container view. No SRS semantics. */

export const MAP_W = 720;
export const MAP_H = 440;
const CX = MAP_W / 2;
const CY = MAP_H / 2;

export interface MapNeighbour {
  id: string;
  label: string;
  relationType: string;
  direction: "in" | "out";
}

export interface PlacedNeighbour extends MapNeighbour {
  x: number;
  y: number;
}

export interface FocusLayout {
  center: { x: number; y: number };
  placed: PlacedNeighbour[];
  /** Relation types in first-seen order, with how many placed edges each has, per direction. */
  legend: { relationType: string; direction: "in" | "out"; count: number }[];
}

/**
 * Inbound neighbours on the left half of an ellipse, outbound on the right, each group ordered by relation
 * type so edges of one type sit together. Nodes are spaced evenly in y, so two-line labels never collide.
 * With one direction only, the focus moves toward the empty side's edge so the graph is not half blank.
 */
export function focusLayout(neighbours: MapNeighbour[]): FocusLayout {
  const hasIn = neighbours.some((n) => n.direction === "in");
  const hasOut = neighbours.some((n) => n.direction === "out");
  const cx = hasIn && hasOut ? CX : hasOut ? 190 : MAP_W - 190;
  const place = (list: MapNeighbour[], side: 1 | -1): PlacedNeighbour[] => {
    const sorted = [...list].sort((a, b) => a.relationType.localeCompare(b.relationType));
    return sorted.map((n, i) => {
      const t = sorted.length === 1 ? 0 : (i / (sorted.length - 1) - 0.5) * 1.9;
      return { ...n, x: cx + side * Math.sqrt(1 - t * t) * 230, y: CY + t * 190 };
    });
  };
  const placed = [
    ...place(
      neighbours.filter((n) => n.direction === "in"),
      -1
    ),
    ...place(
      neighbours.filter((n) => n.direction === "out"),
      1
    ),
  ];
  const legend: FocusLayout["legend"] = [];
  for (const n of placed) {
    const row = legend.find(
      (l) => l.relationType === n.relationType && l.direction === n.direction
    );
    if (row) row.count++;
    else legend.push({ relationType: n.relationType, direction: n.direction, count: 1 });
  }
  return { center: { x: cx, y: CY }, placed, legend };
}

export interface ContainerEdge {
  relationId: string;
  relationType: string;
  source: string;
  target: string;
}

export interface ContainerGraph {
  nodes: { id: string; label: string; x: number; y: number }[];
  edges: ContainerEdge[];
  /** Distinct endpoints before the cap. */
  totalNodes: number;
}

export const CONTAINER_NODE_CAP = 24;

/**
 * A container's relations on a ring, capped at `cap` nodes. The cap keeps the best connected endpoints
 * (most edges first, then first seen), and only edges between kept nodes are drawn.
 */
export function containerGraph(
  edges: ContainerEdge[],
  labelOf: (id: string) => string,
  cap = CONTAINER_NODE_CAP
): ContainerGraph {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const ids = [...degree.keys()];
  const kept = new Set(
    ids
      .map((id, i) => ({ id, i }))
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.i - b.i)
      .slice(0, cap)
      .map((x) => x.id)
  );
  const nodes = ids
    .filter((id) => kept.has(id))
    .map((id, i, all) => {
      const angle = (Math.PI * 2 * i) / all.length - Math.PI / 2;
      return {
        id,
        label: labelOf(id),
        x: CX + Math.cos(angle) * 270,
        y: CY + Math.sin(angle) * 170,
      };
    });
  return {
    nodes,
    edges: edges.filter((e) => kept.has(e.source) && kept.has(e.target)),
    totalNodes: ids.length,
  };
}
