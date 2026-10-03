/**
 * Agent connections (srs-web#358): one relay channel + MCP session per agent. The HOST mints each
 * agent's stable id (`agent:<uuid>`, kept per connection so a reconnect keeps it); the agent's
 * client handle only becomes the display name in the engine. `label` is an optional host-fixed name.
 */
export interface AgentConnection {
  id: string;
  label?: string;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const LIST_KEY = "srs-web.agent-connections";
const LEGACY_ID_KEY = "srs-web.relay-agent-id"; // single-agent era (#360)
const LEGACY_CREDS_KEY = "srs-web.mcp-relay"; // pre-#358 channel credentials (also pre-#360 users, who have no id)
/** Relay credentials key for one connection (RelayHost `storageKey`). */
export const credsKey = (id: string) => `${LEGACY_CREDS_KEY}.${id}`;

/**
 * The connection list. Loaded once and then held in memory, so a throwing storage never throws
 * and never mints a fresh id mid-session; storage is best-effort persistence only.
 */
export function createConnectionStore(getStorage: () => Store = () => localStorage) {
  let cache: AgentConnection[] | null = null;
  const st = (): Store | null => {
    try {
      return getStorage();
    } catch {
      return null;
    }
  };
  const save = () => {
    try {
      st()?.setItem(LIST_KEY, JSON.stringify(cache));
    } catch {}
  };

  function migrate(s: Store | null): AgentConnection {
    const first: AgentConnection = { id: `agent:${crypto.randomUUID()}` };
    try {
      const legacyId = s?.getItem(LEGACY_ID_KEY);
      if (legacyId) first.id = legacyId;
      const creds = s?.getItem(LEGACY_CREDS_KEY);
      if (s && creds) {
        s.setItem(credsKey(first.id), creds);
        s.removeItem(LEGACY_CREDS_KEY); // only after the copy succeeded
      }
      if (s && legacyId) s.removeItem(LEGACY_ID_KEY);
    } catch {}
    return first;
  }

  return {
    /** The connections; first run seeds one, migrating the pre-#358 connection into it. */
    list(): AgentConnection[] {
      if (cache) return cache;
      const s = st();
      try {
        const v = JSON.parse(s?.getItem(LIST_KEY) ?? "null");
        if (Array.isArray(v)) {
          cache = v.filter((c) => typeof c?.id === "string");
          return cache;
        }
      } catch {}
      cache = [migrate(s)];
      save();
      return cache;
    },
    /** Add a connection; returns the list as displayed. */
    add(label?: string): AgentConnection[] {
      const l = label?.trim();
      cache = [...this.list(), { id: `agent:${crypto.randomUUID()}`, ...(l ? { label: l } : {}) }];
      save();
      return cache;
    },
    remove(id: string): AgentConnection[] {
      cache = this.list().filter((c) => c.id !== id);
      save();
      try {
        st()?.removeItem(credsKey(id));
      } catch {}
      return cache;
    },
  };
}

export const connections = createConnectionStore();

/**
 * One tab per channel (srs-web#391): a Web Lock per connection id, held while this tab has it open.
 * Without `navigator.locks` everything degrades to "free": the relay's 409 stays the backstop.
 */
const lockName = (id: string) => `srs-web.channel.${id}`;
const releasers = new Map<string, () => void>();

/** Take the channel's lock for this tab. False when another tab holds it. */
export function acquireChannelLock(id: string): Promise<boolean> {
  const locks = globalThis.navigator?.locks;
  if (!locks || releasers.has(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    locks
      .request(lockName(id), { ifAvailable: true }, (lock) => {
        if (!lock) return void resolve(false);
        return new Promise<void>((release) => {
          releasers.set(id, release);
          resolve(true);
        });
      })
      .catch(() => resolve(true));
  });
}

export function releaseChannelLock(id: string): void {
  releasers.get(id)?.();
  releasers.delete(id);
}

/** Ids of channels held by another tab (our own locks are excluded). */
export async function channelsInUseElsewhere(): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const { held = [] } = (await globalThis.navigator?.locks?.query()) ?? {};
    for (const l of held) {
      const id = l.name?.startsWith("srs-web.channel.")
        ? l.name.slice("srs-web.channel.".length)
        : "";
      if (id && !releasers.has(id)) out.add(id);
    }
  } catch {}
  return out;
}
