/**
 * The one URL hash address (ADR-023): the only module that parses, formats or writes the hash.
 * Keys, in order: `e` essay, `p` paragraph (scroll + focus), `z` zoom, `lens` lens id (ADR-025),
 * `id` the shell-neutral selected instance, `by` Collection "Tell apart by", `ctxby` Context
 * "Tell apart by". Ids are instance UUIDs. The query string stays reserved for boot links
 * (ADR-021); the link trail lives in `history.state`.
 */

/** Lens ids (ADR-025). `pkg:` is reserved. */
export type LensId =
  | `nav:${string}`
  | `comp:${string}`
  | `type:${string}`
  | `pkg:${string}`
  | "find"
  | "set";
/** Collection "Tell apart by". */
export type CollectionBy =
  | "none"
  | "type"
  | "nesting"
  | "container"
  | "state"
  | "created-by"
  | `field:${string}`;
/** Context "Tell apart by". */
export type ContextBy = "link-type" | "none" | "boundary";

export const LENS_ID = /^(?:(?:nav|comp|type|pkg):[^\s&#=]+|find|set)$/;
export const COLLECTION_BY = /^(?:none|type|nesting|container|state|created-by|field:[^\s&#=]+)$/;
export const CONTEXT_BY = /^(?:link-type|none|boundary)$/;

export interface Address {
  essayId?: string; // e
  paragraphId?: string; // p
  zoomId?: string; // z
  lens?: LensId; // lens   (dropped unless LENS_ID matches)
  instanceId?: string; // id     (shell-neutral selected instance, ADR-023)
  by?: CollectionBy; // by     (dropped unless COLLECTION_BY matches)
  ctxBy?: ContextBy; // ctxby  (dropped unless CONTEXT_BY matches)
}

const KEYS: [keyof Address, string, RegExp?][] = [
  ["essayId", "e"],
  ["paragraphId", "p"],
  ["zoomId", "z"],
  ["lens", "lens", LENS_ID],
  ["instanceId", "id"],
  ["by", "by", COLLECTION_BY],
  ["ctxBy", "ctxby", CONTEXT_BY],
];

/** Tolerates junk, ignores unknown keys, accepts ":" raw or as %3A, drops invalid lens/by/ctxby values. */
export function parseAddress(hash: string): Address {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const out: Record<string, string> = {};
  for (const [field, key, valid] of KEYS) {
    const v = q.get(key);
    if (v && (!valid || valid.test(v))) out[field] = v;
  }
  return out as Address;
}

/** "" or "#…"; keys in the order e, p, z, lens, id, by, ctxby; empty values omitted; URLSearchParams encoding. */
export function formatAddress(a: Address): string {
  const q = new URLSearchParams();
  for (const [field, key] of KEYS) {
    const v = a[field];
    if (v) q.set(key, v);
  }
  const s = q.toString();
  return s ? `#${s}` : "";
}

export interface TrailEntry {
  id: string;
  label: string;
}

/** The trail in `state` (default history.state), or [] when absent or malformed. */
export function readTrail(state: unknown = history.state): TrailEntry[] {
  const t = (state as { trail?: unknown } | null)?.trail;
  if (!Array.isArray(t)) return [];
  return t.every((e) => typeof e?.id === "string" && typeof e?.label === "string")
    ? (t as TrailEntry[])
    : [];
}

function write(method: "pushState" | "replaceState", a: Address, trail?: TrailEntry[]): void {
  const h = formatAddress(a);
  if (method === "pushState") {
    const current = location.hash === "#" ? "" : location.hash;
    const same = JSON.stringify(readTrail()) === JSON.stringify(trail ?? []);
    if (h === current && same) return;
  }
  history[method](trail ? { trail } : null, "", h || location.pathname + location.search);
}

/** history.pushState({ trail } | null, …); a no-op when hash and trail are unchanged. Fires no event. */
export function pushAddress(a: Address, trail?: TrailEntry[]): void {
  write("pushState", a, trail);
}

/** history.replaceState with the same arguments. Fires no event. */
export function replaceAddress(a: Address, trail?: TrailEntry[]): void {
  write("replaceState", a, trail);
}
