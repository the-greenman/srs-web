/**
 * Relay library (srs-web#442): the relays this viewer can connect agents to. Client configuration
 * only (ADR-001); localStorage per viewer. `VITE_MCP_RELAY_URL` and the legacy
 * `srs-web.mcp-relay-url` key (the dev/e2e seed) seed it ONCE: a removed seed does not return and
 * a changed env value does not re-seed an existing library.
 */
import { connections } from "./agent-connections";

export interface Relay {
  id: string;
  label: string;
  url: string;
  isDefault: boolean;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Result = { relays: Relay[] } | { error: string };
export const KEY = "srs-web.relays";
const LEGACY_URL_KEY = "srs-web.mcp-relay-url";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https only (http for localhost); a bare origin (that is what `bootstrapChannel` expects), so a path or query is refused, never truncated. */
export function validateRelayUrl(
  input: string
): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { ok: false, error: "Enter a full URL, like https://relay.example.com." };
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname)))
    return { ok: false, error: "A relay must use https (http is allowed only for localhost)." };
  if (u.username || u.password)
    return { ok: false, error: "A relay URL cannot contain credentials." };
  if (u.pathname !== "/" || u.search)
    return {
      ok: false,
      error:
        "A relay URL must be just an origin, like https://relay.example.com (no path or query).",
    };
  if (u.hash) return { ok: false, error: "A relay URL cannot contain a fragment." };
  return { ok: true, url: u.origin };
}

const cleanLabel = (label: string, url: string) => (label.trim() || new URL(url).host).slice(0, 40);

export function createRelayStore(
  getStorage: () => Store = () => localStorage,
  opts: { env?: string; legacy?: () => string | null; usedBy?: (relayId: string) => number } = {}
) {
  let cache: Relay[] | null = null;
  const usedBy = (id: string) => opts.usedBy?.(id) ?? 0;
  const st = (): Store | null => {
    try {
      return getStorage();
    } catch {
      return null;
    }
  };
  const save = () => {
    try {
      st()?.setItem(KEY, JSON.stringify({ relays: cache }));
    } catch {}
  };
  const legacy = () => {
    try {
      return opts.legacy ? opts.legacy() : (st()?.getItem(LEGACY_URL_KEY) ?? null);
    } catch {
      return null;
    }
  };
  const newRelay = (label: string, url: string, isDefault: boolean): Relay => ({
    id: `relay:${crypto.randomUUID()}`,
    label: cleanLabel(label, url),
    url,
    isDefault,
  });

  /** The one invariant gate, for stored and new lists alike: valid origins, string labels, exactly one default. */
  function normalise(raw: unknown[]): Relay[] {
    const out: Relay[] = [];
    for (const r of raw as Partial<Relay>[]) {
      const v = typeof r?.url === "string" ? validateRelayUrl(r.url) : null;
      if (typeof r?.id !== "string" || !v?.ok || out.some((o) => o.id === r.id || o.url === v.url))
        continue;
      out.push({
        id: r.id,
        url: v.url,
        label: cleanLabel(typeof r.label === "string" ? r.label : "", v.url),
        isDefault: !!r.isDefault,
      });
    }
    const first = out.findIndex((r) => r.isDefault);
    return out.map((r, i) => ({ ...r, isDefault: i === (first < 0 ? 0 : first) }));
  }

  function load(): Relay[] {
    if (cache) return cache;
    try {
      // A stored library (even an empty one) means the seeds were already applied: they never return.
      const v = JSON.parse(st()?.getItem(KEY) ?? "null");
      if (v && Array.isArray(v.relays)) {
        cache = normalise(v.relays);
        return cache;
      }
    } catch {}
    const seeds: Relay[] = [];
    for (const seed of [opts.env, legacy()]) {
      const v = seed ? validateRelayUrl(seed) : null;
      if (v?.ok) seeds.push(newRelay("", v.url, seeds.length === 0));
    }
    cache = normalise(seeds);
    save();
    return cache;
  }
  /** Commit a new list through the same gate as a loaded one. */
  function commit(next: Relay[]): Relay[] {
    cache = normalise(next);
    save();
    return cache;
  }

  return {
    /** As the connection store's `reload`: another tab rewrote the relay list. */
    reload(key: string | null): boolean {
      if (key !== null && key !== KEY) return false;
      cache = null;
      return true;
    },
    list: (): Relay[] => load(),
    get: (id: string | undefined): Relay | undefined => load().find((r) => r.id === id),
    add(label: string, url: string): Result {
      const v = validateRelayUrl(url);
      if (!v.ok) return { error: v.error };
      const l = load();
      if (l.some((r) => r.url === v.url)) return { error: "That relay is already in the library." };
      return { relays: commit([...l, newRelay(label, v.url, l.length === 0)]) };
    },
    update(id: string, patch: { label?: string; url?: string }): Result {
      const l = load();
      const cur = l.find((r) => r.id === id);
      if (!cur) return { error: "That relay no longer exists." };
      let url = cur.url;
      if (patch.url !== undefined) {
        const v = validateRelayUrl(patch.url);
        if (!v.ok) return { error: v.error };
        if (v.url !== cur.url) {
          if (usedBy(id) > 0)
            return { error: "Forget this relay's agents before changing its URL." };
          if (l.some((r) => r.url === v.url))
            return { error: "That relay is already in the library." };
          url = v.url;
        }
      }
      const label = patch.label === undefined ? cur.label : cleanLabel(patch.label, url);
      return { relays: commit(l.map((r) => (r.id === id ? { ...r, label, url } : r))) };
    },
    setDefault: (id: string): Relay[] =>
      commit(load().map((r) => ({ ...r, isDefault: r.id === id }))),
    remove(id: string): Result {
      const n = usedBy(id);
      if (n > 0) return { error: `Forget its ${n} agent${n === 1 ? "" : "s"} first.` };
      const rest = load().filter((r) => r.id !== id);
      // the default was removed: commit promotes the first remaining
      return { relays: commit(rest) };
    },
  };
}

export const relays = createRelayStore(undefined, {
  env: import.meta.env.VITE_MCP_RELAY_URL,
  usedBy: (id) => connections.count(id),
});
