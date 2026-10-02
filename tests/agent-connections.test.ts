import { beforeEach, describe, expect, it } from "vitest";
import { createConnectionStore, credsKey } from "../src/lib/agent-connections";

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

describe("agent connections", () => {
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
