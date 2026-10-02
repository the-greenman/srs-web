import { beforeEach, describe, expect, it } from "vitest";
import {
  addConnection,
  credsKey,
  loadConnections,
  removeConnection,
} from "../src/lib/agent-connections";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};
let s: ReturnType<typeof mem>;
beforeEach(() => {
  s = mem();
});

describe("agent connections", () => {
  it("seeds one connection and keeps its id across reloads", () => {
    const a = loadConnections(s);
    expect(a).toHaveLength(1);
    expect(a[0].id).toMatch(/^agent:[0-9a-f-]{36}$/);
    expect(loadConnections(s)[0].id).toBe(a[0].id);
  });
  it("mints distinct ids with optional trimmed label; persists", () => {
    loadConnections(s);
    const l = addConnection("  Bot ", s);
    expect(l).toHaveLength(2);
    expect(l[1].label).toBe("Bot");
    expect(l[1].id).not.toBe(l[0].id);
    expect(loadConnections(s)).toEqual(l);
    expect(addConnection("", s)[2].label).toBeUndefined();
  });
  it("removes one and its credentials, leaving the rest", () => {
    const [first] = loadConnections(s);
    const [, second] = addConnection(undefined, s);
    s.setItem(credsKey(second.id), "x");
    expect(removeConnection(second.id, s)).toEqual([first]);
    expect(s.getItem(credsKey(second.id))).toBeNull();
  });
  it("migrates the single pre-#358 connection (id + credentials)", () => {
    s.setItem("srs-web.relay-agent-id", "agent:old");
    s.setItem("srs-web.mcp-relay", '{"creds":1}');
    expect(loadConnections(s)).toEqual([{ id: "agent:old" }]);
    expect(s.getItem(credsKey("agent:old"))).toBe('{"creds":1}');
    expect(s.getItem("srs-web.mcp-relay")).toBeNull();
  });
});
