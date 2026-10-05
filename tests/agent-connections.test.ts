import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireChannelLock, channelsInUseElsewhere, createConnectionStore, credsKey, initKey, releaseChannelLock } from "../src/lib/agent-connections";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
let s: ReturnType<typeof mem>;
const store = () => createConnectionStore(() => s);
beforeEach(() => {
  s = mem();
});

describe("stored initialize (#418)", () => {
  it("round-trips, never stores an empty body, and remove() clears it", () => {
    const c = store();
    const id = c.add()[1].id;
    c.saveInit(id, { body: "", initialized: true });
    expect(c.loadInit(id)).toBeNull();
    c.saveInit(id, { body: "{b}", initialized: true });
    expect(store().loadInit(id)).toEqual({ body: "{b}", initialized: true });
    c.clearInit(id);
    expect(c.loadInit(id)).toBeNull();
    c.saveInit(id, { body: "{b}", initialized: false });
    c.remove(id);
    expect(s.getItem(initKey(id))).toBeNull();
  });
  it("sweepInits removes only orphaned keys", () => {
    const m = new Map<string, string>([
      [initKey("live"), "1"],
      [initKey("gone"), "2"],
      ["other", "3"],
    ]);
    const st = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
    };
    createConnectionStore(() => st).sweepInits(["live"]);
    expect([...m.keys()]).toEqual([initKey("live"), "other"]);
  });
  it("a throwing storage does not throw", () => {
    const bad = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    const c = createConnectionStore(() => bad);
    c.saveInit("a", { body: "b", initialized: true });
    expect(c.loadInit("a")).toBeNull();
    c.clearInit("a");
    c.sweepInits([]);
  });
});

describe("agent connections", () => {
  it("setReopen sets and clears the repository id, persisting, touching only that entry", () => {
    const c = store();
    const [first] = c.list();
    const second = c.add()[1];
    expect(c.setReopen(second.id, "repo-1")[1].reopen).toBe("repo-1");
    expect(store().list()[1].reopen).toBe("repo-1");
    expect(store().list()[0]).toEqual(first);
    c.setReopen(second.id, null);
    expect("reopen" in JSON.parse(s.getItem("srs-web.agent-connections") as string)[1]).toBe(false);
  });
  it("setReopen does not throw on a throwing storage", () => {
    const bad = {
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {},
    };
    const c = createConnectionStore(() => bad);
    const [first] = c.list();
    expect(c.setReopen(first.id, "r")[0].reopen).toBe("r");
  });
  it("an old list loads as never-reopen", () => {
    s.setItem("srs-web.agent-connections", JSON.stringify([{ id: "agent:x" }, { id: "agent:y", reopen: true }]));
    expect(store().list()[0].reopen).toBeUndefined();
  });
  it("seeds one connection and keeps its id across reloads", () => {
    const a = store().list();
    expect(a).toHaveLength(1);
    expect(a[0].id).toMatch(/^agent:[0-9a-f-]{36}$/);
    expect(store().list()[0].id).toBe(a[0].id);
  });
  it("mints distinct ids with optional trimmed label; persists", () => {
    const c = store();
    c.list();
    const l = c.add("  Bot ");
    expect(l[1].label).toBe("Bot");
    expect(l[1].id).not.toBe(l[0].id);
    expect(store().list()).toEqual(l);
    expect(c.add("")[2].label).toBeUndefined();
  });
  it("removes one and its credentials, leaving the rest", () => {
    const c = store();
    const [first] = c.list();
    const second = c.add()[1];
    s.setItem(credsKey(second.id), "x");
    expect(c.remove(second.id)).toEqual([first]);
    expect(s.getItem(credsKey(second.id))).toBeNull();
  });
  it("migrates the pre-#358 connection (id + credentials)", () => {
    s.setItem("srs-web.relay-agent-id", "agent:old");
    s.setItem("srs-web.mcp-relay", '{"creds":1}');
    expect(store().list()).toEqual([{ id: "agent:old" }]);
    expect(s.getItem(credsKey("agent:old"))).toBe('{"creds":1}');
    expect(s.getItem("srs-web.mcp-relay")).toBeNull();
    expect(s.getItem("srs-web.relay-agent-id")).toBeNull();
  });
  it("migrates credentials even with no legacy id (pre-#360 users)", () => {
    s.setItem("srs-web.mcp-relay", '{"creds":2}');
    const [c] = store().list();
    expect(s.getItem(credsKey(c.id))).toBe('{"creds":2}');
    expect(s.getItem("srs-web.mcp-relay")).toBeNull();
  });
  it("a throwing storage neither throws nor re-mints within a session", () => {
    const boom = () => {
      throw new Error("denied");
    };
    const c = createConnectionStore(boom);
    const [a] = c.list();
    expect(c.list()[0].id).toBe(a.id);
    expect(c.add("x")).toHaveLength(2);
    expect(c.remove(a.id)).toHaveLength(1);
  });
  it("setItem-only failures keep the in-memory list authoritative", () => {
    const c = createConnectionStore(() => ({
      ...mem(),
      setItem: () => {
        throw new Error("full");
      },
    }));
    const [a] = c.list();
    expect(c.add()).toHaveLength(2);
    expect(c.list()[0].id).toBe(a.id);
  });
});

describe("library: keep vs forget", () => {
  it("list() keeps an entry and its credentials until remove() forgets it", () => {
    const c = store();
    const [a] = c.list();
    s.setItem(credsKey(a.id), "creds");
    expect(store().list()).toEqual([a]); // a "disconnect" never touches the store
    expect(s.getItem(credsKey(a.id))).toBe("creds");
    c.remove(a.id); // forget
    expect(s.getItem(credsKey(a.id))).toBeNull();
  });
});

describe("one tab per channel (Web Locks)", () => {
  // Minimal navigator.locks: exclusive, ifAvailable, shared across "tabs" in this process.
  const held = new Set<string>();
  const fake = {
    request: async (name: string, _o: unknown, cb: (l: unknown) => Promise<void> | void) => {
      if (held.has(name)) return cb(null);
      held.add(name);
      try {
        await cb({ name });
      } finally {
        held.delete(name);
      }
    },
    query: async () => ({ held: [...held].map((name) => ({ name })) }),
  };
  beforeEach(() => vi.stubGlobal("navigator", { locks: fake }));
  afterEach(() => {
    vi.unstubAllGlobals();
    held.clear();
  });

  it("acquires, blocks a second holder, and frees on release", async () => {
    expect(await acquireChannelLock("agent:1")).toBe(true);
    held.add("srs-web.channel.agent:2"); // another tab
    expect(await acquireChannelLock("agent:2")).toBe(false);
    expect([...(await channelsInUseElsewhere())]).toEqual(["agent:2"]); // not our own agent:1
    releaseChannelLock("agent:1");
    await new Promise((r) => setTimeout(r, 0));
    expect(held.has("srs-web.channel.agent:1")).toBe(false);
  });
  it("degrades to free without navigator.locks", async () => {
    vi.stubGlobal("navigator", {});
    expect(await acquireChannelLock("agent:3")).toBe(true);
    expect((await channelsInUseElsewhere()).size).toBe(0);
  });
});

describe("relay binding (#442)", () => {
  it("add binds a relay; rename, touch and count behave", () => {
    const c = store();
    c.list();
    const b = c.add("Bot", "relay:1")[1];
    expect(b.relayId).toBe("relay:1");
    expect(c.count("relay:1")).toBe(1);
    expect(c.rename(b.id, " New ")[1].label).toBe("New");
    expect(c.rename(b.id, "")[1].label).toBeUndefined();
    expect(c.touch(b.id, "2026-01-01T00:00:00.000Z")[1].lastConnectedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(store().list()[1].lastConnectedAt).toBe("2026-01-01T00:00:00.000Z");
  });
  it("a seeded entry stays unbound until adoptRelay binds it (bound ones keep theirs)", () => {
    const c = store();
    const [seed] = c.list();
    expect(seed.relayId).toBeUndefined();
    c.add("x", "relay:own");
    const l = c.adoptRelay("relay:default");
    expect(l.map((x) => x.relayId)).toEqual(["relay:default", "relay:own"]);
    expect(c.count("relay:default")).toBe(1);
  });
});
