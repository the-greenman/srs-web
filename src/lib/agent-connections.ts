/**
 * Agent connections (srs-web#358): one relay channel + MCP session per agent. The HOST mints each
 * agent's stable id (`agent:<uuid>`, kept per connection so a reconnect keeps it); the agent's
 * client handle only becomes the display name in the engine. `label` is an optional host-fixed name.
 */
export interface AgentConnection {
  id: string;
  /** Host-fixed display name (rename edits it). */
  label?: string;
  /** Fixed at creation (srs-web#442); absent only before `adoptRelay` binds a pre-library entry. */
  relayId?: string;
  /** ISO 8601, updated each time a session reaches "online" (every reconnect). */
  lastConnectedAt?: string;
  /** The repositoryId this agent was connected on (#418); reopened on load when that repository opens. Absent = never. */
  reopen?: string;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const LIST_KEY = "srs-web.agent-connections";
const LEGACY_ID_KEY = "srs-web.relay-agent-id"; // single-agent era (#360)
const LEGACY_CREDS_KEY = "srs-web.mcp-relay"; // pre-#358 channel credentials (also pre-#360 users, who have no id)
/** Relay credentials key for one connection (RelayHost `storageKey`). */
export const credsKey = (id: string) => `${LEGACY_CREDS_KEY}.${id}`;
/** The client's last successful `initialize` for one connection (#418): opaque body, client metadata only. */
const INIT_PREFIX = "srs-web.mcp-init.";
export const initKey = (id: string) => `${INIT_PREFIX}${id}`;

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

  function patch(
    self: { list(): AgentConnection[] },
    id: string,
    f: (c: AgentConnection) => AgentConnection
  ) {
    cache = self.list().map((c) => (c.id === id ? f(c) : c));
    save();
    return cache;
  }

  const clearInit = (id: string) => {
    try {
      st()?.removeItem(initKey(id));
    } catch {}
  };

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
    add(label?: string, relayId?: string): AgentConnection[] {
      const l = label?.trim();
      cache = [
        ...this.list(),
        {
          id: `agent:${crypto.randomUUID()}`,
          ...(l ? { label: l } : {}),
          ...(relayId ? { relayId } : {}),
        },
      ];
      save();
      return cache;
    },
    /** An empty label clears it. */
    rename(id: string, label: string): AgentConnection[] {
      const l = label.trim();
      return patch(this, id, (c) => ({ ...c, label: l || undefined }));
    },
    /** Remember (a repository id) or forget (null) that this agent was open. */
    setReopen(id: string, repositoryId: string | null): AgentConnection[] {
      return patch(this, id, (c) => ({ ...c, reopen: repositoryId ?? undefined }));
    },
    touch(id: string, at = new Date().toISOString()): AgentConnection[] {
      return patch(this, id, (c) => ({ ...c, lastConnectedAt: at }));
    },
    /** Bind every entry that has no relay to this one. */
    adoptRelay(defaultRelayId: string): AgentConnection[] {
      const l = this.list();
      if (l.every((c) => c.relayId)) return l;
      cache = l.map((c) => (c.relayId ? c : { ...c, relayId: defaultRelayId }));
      save();
      return cache;
    },
    /** Agents on a relay. */
    count(relayId: string): number {
      return this.list().filter((c) => c.relayId === relayId).length;
    },
    remove(id: string): AgentConnection[] {
      cache = this.list().filter((c) => c.id !== id);
      save();
      try {
        st()?.removeItem(credsKey(id));
      } catch {}
      clearInit(id);
      return cache;
    },
    saveInit(id: string, init: { body: string; initialized: boolean }): void {
      if (!init.body) return;
      try {
        st()?.setItem(initKey(id), JSON.stringify(init));
      } catch {}
    },
    loadInit(id: string): { body: string; initialized: boolean } | null {
      try {
        const v = JSON.parse(st()?.getItem(initKey(id)) ?? "null");
        return typeof v?.body === "string" && v.body
          ? { body: v.body, initialized: !!v.initialized }
          : null;
      } catch {
        return null;
      }
    },
    clearInit,
    /** Drop stored initializes whose agent is gone (a crash between steps). */
    sweepInits(liveIds: string[]): void {
      try {
        const s = st() as Storage | null;
        if (!s || typeof s.length !== "number") return;
        const keys = Array.from({ length: s.length }, (_, i) => s.key(i) ?? "");
        for (const k of keys)
          if (k.startsWith(INIT_PREFIX) && !liveIds.includes(k.slice(INIT_PREFIX.length)))
            s.removeItem(k);
      } catch {}
    },
  };
}

export const connections = createConnectionStore();

/**
 * One tab per channel (srs-web#391): a Web Lock per connection id, held while this tab has it open.
 * Without `navigator.locks` everything degrades to "free": the relay's 409 stays the backstop.
 */
const lockName = (id: string) => `srs-web.channel.${id}`;
const releasers = new Map<string, { release: () => void; released: () => Promise<unknown> }>();

/** Take the channel's lock for this tab. False when another tab holds it. */
export function acquireChannelLock(id: string): Promise<boolean> {
  const locks = globalThis.navigator?.locks;
  if (!locks || releasers.has(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let released: Promise<unknown> = Promise.resolve();
    released = locks
      .request(lockName(id), { ifAvailable: true }, (lock) => {
        if (!lock) return void resolve(false);
        return new Promise<void>((release) => {
          releasers.set(id, { release, released: () => released });
          resolve(true);
        });
      })
      .catch(() => resolve(true));
  });
}

/** Resolves once the browser has actually released the lock (the request promise settles after the callback does). */
export async function releaseChannelLock(id: string): Promise<void> {
  const r = releasers.get(id);
  releasers.delete(id);
  r?.release();
  await r?.released();
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
