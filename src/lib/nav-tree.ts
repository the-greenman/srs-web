/**
 * nav-tree — the headless model behind NavTree (story muDemocracy.org#282, phase 6).
 *
 * A flat, ordered list of nodes with `parentId` links in; the rows to show out. No markup, no DOM
 * beyond an optional Storage handle (ADR-027 headless layer). The hierarchy itself is the engine's
 * (`repositoryNavigation`, `getContainerOutline`): this module only decides what is visible, where
 * focus goes on a key press, and what to remember.
 */

export interface NavTreeNode {
  /** Stable id, unique in the tree. */
  id: string;
  label: string;
  /** Parent node id; null for a root. A parent must precede its children in the list. */
  parentId: string | null;
  /** Small trailing text (a type, a "note" mark). */
  detail?: string;
  /** Optional trailing count (e.g. open annotations, Phase 3). */
  count?: number;
  /** Expandable although no child is loaded yet (children are fetched on expand). */
  lazy?: boolean;
  /** A kind of its own (a record rather than a container); styling and test hook only. */
  kind?: string;
  /** A container node that is also a member's own record: selecting it opens that record too. */
  recordId?: string;
}

export interface NavRow {
  node: NavTreeNode;
  /** 0 for a root. */
  level: number;
  expandable: boolean;
  expanded: boolean;
}

function childIndex(nodes: readonly NavTreeNode[]): Map<string | null, NavTreeNode[]> {
  const byParent = new Map<string | null, NavTreeNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  return byParent;
}

/** Ids of every ancestor of `id`, nearest first. Stops at a missing parent or a cycle. */
export function ancestorsOf(nodes: readonly NavTreeNode[], id: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cursor = byId.get(id)?.parentId ?? null;
  while (cursor !== null && byId.has(cursor) && !seen.has(cursor)) {
    out.push(cursor);
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return out;
}

/**
 * The rows to render, in order. With a non-blank `filter`, a node shows if its label contains the text
 * (case-insensitive) or a descendant does; ancestors of a match are expanded regardless of `expanded`.
 */
export function visibleRows(
  nodes: readonly NavTreeNode[],
  expanded: ReadonlySet<string>,
  filter = ""
): NavRow[] {
  const byParent = childIndex(nodes);
  const needle = filter.trim().toLowerCase();
  const keep = new Set<string>();
  if (needle) {
    for (const node of nodes) {
      if (node.label.toLowerCase().includes(needle)) {
        keep.add(node.id);
        for (const a of ancestorsOf(nodes, node.id)) keep.add(a);
      }
    }
  }
  const rows: NavRow[] = [];
  const walk = (parentId: string | null, level: number): void => {
    for (const node of byParent.get(parentId) ?? []) {
      if (needle && !keep.has(node.id)) continue;
      const children = byParent.get(node.id) ?? [];
      const expandable = children.length > 0 || node.lazy === true;
      const isOpen =
        expandable && (needle ? children.some((c) => keep.has(c.id)) : expanded.has(node.id));
      rows.push({ node, level, expandable, expanded: isOpen });
      if (isOpen) walk(node.id, level + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export type NavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

export interface NavKeyResult {
  /** Row id that should take focus. */
  focus?: string;
  /** Open or close the focused row. */
  toggle?: { id: string; open: boolean };
}

/** WAI-ARIA tree keyboard model over the visible rows. */
export function keyNavigate(
  rows: readonly NavRow[],
  currentId: string | null,
  key: NavKey
): NavKeyResult {
  if (rows.length === 0) return {};
  const index = Math.max(
    0,
    rows.findIndex((r) => r.node.id === currentId)
  );
  const row = rows[index];
  switch (key) {
    case "ArrowDown":
      return { focus: rows[Math.min(index + 1, rows.length - 1)].node.id };
    case "ArrowUp":
      return { focus: rows[Math.max(index - 1, 0)].node.id };
    case "Home":
      return { focus: rows[0].node.id };
    case "End":
      return { focus: rows[rows.length - 1].node.id };
    case "ArrowRight":
      if (row.expandable && !row.expanded) return { toggle: { id: row.node.id, open: true } };
      if (row.expanded && rows[index + 1]?.level === row.level + 1)
        return { focus: rows[index + 1].node.id };
      return {};
    case "ArrowLeft": {
      if (row.expanded) return { toggle: { id: row.node.id, open: false } };
      for (let i = index - 1; i >= 0; i--) {
        if (rows[i].level < row.level) return { focus: rows[i].node.id };
      }
      return {};
    }
  }
}

/** Read a remembered expanded set. Any failure (no storage, bad JSON) yields an empty set. */
export function loadExpanded(
  key: string,
  storage: Pick<Storage, "getItem"> | undefined
): Set<string> {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
    );
  } catch {
    return new Set();
  }
}

export function saveExpanded(
  key: string,
  expanded: ReadonlySet<string>,
  storage: Pick<Storage, "setItem"> | undefined
): void {
  try {
    storage?.setItem(key, JSON.stringify([...expanded].sort()));
  } catch {
    // Remembering is a convenience; a full or blocked store must not break navigation.
  }
}

/**
 * Filter a searchable list (the top-bar picker): label contains the text, case-insensitive, order kept.
 * A blank query returns everything.
 */
export function filterOptions<T extends { label: string }>(
  options: readonly T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : [...options];
}
