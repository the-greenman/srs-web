import { expect, it } from "vitest";
import {
  type AgentWrite,
  observeSession,
  pushWrite,
  rpcInfo,
  verb,
} from "../src/lib/agent-activity";

const summary = (tool: string, changed: unknown[]) => JSON.stringify({ tool, changed });
/** A session whose next handle reports `sum` once (drains, like the engine). */
const fake = (sum?: string) => {
  let pending: string | undefined;
  return {
    is_initialized: () => true,
    handle: () => ((pending = sum), "{}"),
    take_write_summary: () => {
      const s = pending;
      pending = undefined;
      return s;
    },
  };
};

it("a handled request's write summary becomes a write naming its agent and target", () => {
  const seen: AgentWrite[] = [];
  observeSession(
    fake(summary("record_update", [{ target: "instance", id: "p1", kind: "updated" }])),
    "agent:a",
    { onWrite: (w) => seen.push(w) }
  ).handle("{}");
  expect(seen[0]).toMatchObject({ agentId: "agent:a", tool: "record_update", instanceId: "p1" });
  expect(verb(seen[0])).toBe("updated");
});

it("indirect changes (fork) are reported; a relation is attributed to its target", () => {
  const seen: AgentWrite[] = [];
  const h = (sum: string) =>
    observeSession(
      fake(sum),
      "a",
      { onWrite: (w) => seen.push(w), relationTarget: (id) => (id === "r1" ? "p" : undefined) }
    ).handle("{}");
  h(
    summary("record_fork", [
      { target: "instance", id: "f", kind: "created" },
      { target: "relation", id: "r0", kind: "created" },
    ])
  );
  h(summary("relation_create", [{ target: "relation", id: "r1", kind: "created" }]));
  expect([seen[0].instanceId, seen[0].changed.length, verb(seen[0])]).toEqual(["f", 2, "added"]);
  expect([seen[1].instanceId, verb(seen[1])]).toEqual(["p", "linked"]);
});

it("requests that wrote nothing are not reported", () => {
  const seen: AgentWrite[] = [];
  observeSession(fake(undefined), "a", { onWrite: (w) => seen.push(w) }).handle("{}");
  expect(seen).toEqual([]);
});

it("the feed is newest first and capped", () => {
  const w = (at: number) => ({ seq: at, agentId: "a", tool: "t", changed: [], at });
  expect(pushWrite([w(1), w(2)], w(3), 2).map((x) => x.at)).toEqual([3, 1]);
});


it("observeSession reports the client's name from initialize", () => {
  const session = fake();
  let name = "";
  observeSession(
    session,
    "a",
    { onWrite: () => {}, onClientName: (n) => (name = n) }
  ).handle(JSON.stringify({ method: "initialize", params: { clientInfo: { name: "alpha" } } }));
  expect(name).toBe("alpha");
});

it("each observed write gets a larger seq than the one before", () => {
  const seqs: number[] = [];
  const h = observeSession(
    fake(summary("record_update", [{ target: "instance", id: "p", kind: "updated" }])),
    "a",
    { onWrite: (w) => seqs.push(w.seq) }
  );
  h.handle("{}");
  h.handle("{}");
  expect(seqs[1]).toBeGreaterThan(seqs[0]);
});

const INIT = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { clientInfo: { name: "claude-code" } },
});
const NOTIF = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
const LIST = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" });

/** A fake engine session with the real one's initialized state machine. */
function engine(initialized = false) {
  let ready = initialized;
  const handled: string[] = [];
  let summary: string | undefined;
  return {
    handled,
    session: {
      is_initialized: () => ready,
      take_write_summary: () => {
        const s = summary;
        summary = undefined;
        return s;
      },
      handle(t: string) {
        handled.push(t);
        const { method } = rpcInfo(t);
        if (method === "initialize") {
          if (t.includes("BAD")) return '{"jsonrpc":"2.0","id":1,"error":{"code":-32602}}';
          ready = true;
          summary = JSON.stringify({ tool: "x", changed: [] }); // must never surface from a replay
          return '{"jsonrpc":"2.0","id":1,"result":{}}';
        }
        if (method === "notifications/initialized") return undefined;
        return ready
          ? '{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}'
          : '{"jsonrpc":"2.0","id":2,"error":{"code":-32602,"message":"MCP session is not initialized"}}';
      },
    },
  };
}
const memStore = (i: { body: string; initialized: boolean } | null = null) => {
  let v = i;
  return {
    load: () => v,
    save: (x: { body: string; initialized: boolean }) => void (v = x),
    clear: () => void (v = null),
  };
};

it("rpcInfo reads method, client name and error from one parse; never throws", () => {
  expect(rpcInfo(INIT)).toEqual({ method: "initialize", clientName: "claude-code", isError: false });
  expect(rpcInfo('{"error":{}}').isError).toBe(true);
  expect(rpcInfo("not json")).toEqual({ isError: false });
  const call = JSON.stringify({ method: "tools/call", params: { arguments: { text: '"initialize"' } } });
  expect(rpcInfo(call).method).toBe("tools/call");
});

it("stores a successful initialize, not a failed one; the last initializer wins; the notification flags it", () => {
  const e = engine();
  const store = memStore();
  const h = observeSession(e.session, "a", { onWrite: () => {}, initStore: store });
  h.handle(INIT.replace("claude-code", "BAD"));
  expect(store.load()).toBeNull();
  h.handle(INIT);
  expect(store.load()).toEqual({ body: INIT, initialized: false });
  h.handle(NOTIF);
  expect(store.load()?.initialized).toBe(true);
  const other = INIT.replace("claude-code", "other");
  h.handle(other);
  expect(store.load()).toEqual({ body: other, initialized: false });
});

it("replays the stored initialize into a fresh session: only the real reply, no writes, name only as replayed", () => {
  const e = engine();
  const writes: AgentWrite[] = [];
  const names: [string, boolean][] = [];
  const h = observeSession(e.session, "a", {
    onWrite: (w) => writes.push(w),
    onClientName: (n, r) => names.push([n, r]),
    initStore: memStore({ body: INIT, initialized: true }),
  });
  expect(h.handle(LIST)).toContain('"tools"');
  expect(e.handled).toEqual([INIT, NOTIF, LIST]);
  expect(writes).toEqual([]);
  expect(names).toEqual([["claude-code", true]]);
  expect(h.sessionUnknown?.()).toBe(false);
  h.handle(LIST);
  expect(e.handled).toHaveLength(4); // no second replay
});

it("initialize, reload, notifications/initialized, tools/list replays once", () => {
  const e = engine();
  const h = observeSession(e.session, "a", {
    onWrite: () => {},
    initStore: memStore({ body: INIT, initialized: false }),
  });
  h.handle(NOTIF);
  h.handle(LIST);
  expect(e.handled.filter((t) => t === INIT)).toHaveLength(1);
  expect(e.handled).toEqual([INIT, NOTIF, LIST]);
});

it("does not replay on an initialized session", () => {
  const e = engine(true);
  observeSession(e.session, "a", {
    onWrite: () => {},
    initStore: memStore({ body: INIT, initialized: true }),
  }).handle(LIST);
  expect(e.handled).toEqual([LIST]);
});

it("a failing replay clears the store and the engine's error is unknown-session", () => {
  const e = engine();
  const store = memStore({ body: INIT.replace("claude-code", "BAD"), initialized: true });
  const h = observeSession(e.session, "a", { onWrite: () => {}, initStore: store });
  expect(h.handle(LIST)).toContain("not initialized");
  expect(store.load()).toBeNull();
  expect(h.sessionUnknown?.()).toBe(true);
});

it("sessionUnknown: only a replied non-initialize message on an uninitialized session", () => {
  const e = engine();
  const h = observeSession(e.session, "a", { onWrite: () => {} });
  h.handle(NOTIF);
  expect(h.sessionUnknown?.()).toBe(false);
  h.handle(INIT.replace("claude-code", "BAD"));
  expect(h.sessionUnknown?.()).toBe(false);
  h.handle(LIST);
  expect(h.sessionUnknown?.()).toBe(true);
  h.handle(INIT);
  h.handle(LIST);
  expect(h.sessionUnknown?.()).toBe(false);
});
