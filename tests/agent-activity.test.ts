import { expect, it } from "vitest";
import {
  type AgentWrite,
  observeSession,
  pushWrite,
  rpcInfo,
  START_PAGE_INSTRUCTIONS,
  UI_TOOLS,
  type UiHost,
  verb,
  withUiTools,
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
    observeSession(fake(sum), "a", {
      onWrite: (w) => seen.push(w),
      relationTarget: (id) => (id === "r1" ? "p" : undefined),
    }).handle("{}");
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
  observeSession(session, "a", { onWrite: () => {}, onClientName: (n) => (name = n) }).handle(
    JSON.stringify({ method: "initialize", params: { clientInfo: { name: "alpha" } } })
  );
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
  expect(rpcInfo(INIT)).toEqual({
    method: "initialize",
    clientName: "claude-code",
    isError: false,
  });
  expect(rpcInfo('{"error":{}}').isError).toBe(true);
  expect(rpcInfo("not json")).toEqual({ isError: false });
  const call = JSON.stringify({
    method: "tools/call",
    params: { arguments: { text: '"initialize"' } },
  });
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

// ── Host UI tools (srs-web#643, ADR-028) ─────────────────────────────────────────────────────

const toolEngine = (tools: unknown[] = [{ name: "find" }]) => {
  const seen: string[] = [];
  return {
    seen,
    handle(text: string) {
      seen.push(text);
      const m = JSON.parse(text);
      return JSON.stringify({
        jsonrpc: "2.0",
        id: m.id,
        result: m.method === "tools/list" ? { tools } : {},
      });
    },
  };
};
const host = (o: Partial<UiHost> = {}): UiHost => ({
  help: () => [
    {
      instanceId: "1",
      featureId: "essay.layers",
      placement: "ui",
      title: "Layers",
      summary: "An outline.",
      aiGuidance: "Show it.",
    },
    {
      instanceId: "2",
      featureId: "essay.indents",
      placement: "concept",
      title: "Indents",
      summary: "Grouping.",
    },
  ],
  onScreen: (id) => id === "essay.layers",
  highlight: () => ({ shown: true }),
  ...o,
});
const call = (name: string, args: unknown = {}) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name, arguments: args },
  });

it("appends the UI tools to the engine's first tools/list page only", () => {
  const h = withUiTools(toolEngine(), host());
  const first = JSON.parse(h.handle('{"jsonrpc":"2.0","id":1,"method":"tools/list"}')!);
  expect(first.result.tools.map((t: { name: string }) => t.name)).toEqual([
    "find",
    ...UI_TOOLS.map((t) => t.name),
  ]);
  const next = JSON.parse(
    h.handle('{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"cursor":"x"}}')!
  );
  expect(next.result.tools.map((t: { name: string }) => t.name)).toEqual(["find"]);
});

it("answers ui_help itself with the manual, in order; the call never reaches the engine", () => {
  const e = toolEngine();
  const r = JSON.parse(withUiTools(e, host()).handle(call("ui_help"))!);
  expect(e.seen.map((t) => JSON.parse(t).method)).toEqual(["ping"]); // the lifecycle check, never the call
  expect(r.id).toBe(7);
  const text: string = r.result.content[0].text;
  expect(text.indexOf("Layers")).toBeLessThan(text.indexOf("Indents"));
  expect(text).toContain("`essay.layers`, on the page now");
  expect(text).toContain("`essay.indents`, an idea");
  expect(text).toContain("How to teach it: Show it.");
});

it("ui_highlight passes the target and says when it is not on screen; with no target it is an error", () => {
  const seen: unknown[] = [];
  const h = withUiTools(
    toolEngine(),
    host({ highlight: (t) => (seen.push(t), { shown: false, reason: "closed" }) })
  );
  const r = JSON.parse(
    h.handle(call("ui_highlight", { featureId: " essay.layers ", message: "Here" }))!
  );
  expect(seen).toEqual([{ featureId: "essay.layers", blockId: undefined, message: "Here" }]);
  expect(JSON.parse(r.result.content[0].text)).toEqual({ shown: false, reason: "closed" });
  const none = JSON.parse(h.handle(call("ui_highlight", {}))!);
  expect(none.result.isError).toBe(true);
});

it("a UI call keeps the lifecycle: before the session has answered, a ping goes first and an unknown session stands", () => {
  const seen: string[] = [];
  let unknown = true;
  const inner = {
    handle: (t: string) => (
      seen.push(JSON.parse(t).method),
      JSON.stringify({ jsonrpc: "2.0", id: JSON.parse(t).id, result: {} })
    ),
    sessionUnknown: () => unknown,
  };
  const h = withUiTools(inner, host());
  expect(JSON.parse(h.handle(call("ui_help"))!).result).toEqual({}); // the ping's reply: unknown session
  expect(h.sessionUnknown?.()).toBe(true);
  unknown = false;
  expect(JSON.parse(h.handle(call("ui_help"))!).result.content[0].text).toContain("Layers");
  expect(seen).toEqual(["ping", "ping"]);
  expect(h.sessionUnknown?.()).toBe(false);
  h.handle(call("ui_help"));
  expect(seen).toEqual(["ping", "ping"]); // ready: no more pings
});

it("a UI call sent as a notification (no id) is the engine's", () => {
  const seen: string[] = [];
  const h = withUiTools({ handle: (t) => (seen.push(t), undefined) }, host());
  const note = JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: { name: "ui_help" },
  });
  expect(h.handle(note)).toBeUndefined();
  expect(seen).toEqual([note]);
});

it("passes every other call, and unparseable frames, to the engine", () => {
  const seen: string[] = [];
  const h = withUiTools({ handle: (t) => (seen.push(t), "ok") }, host());
  expect(h.handle(call("find"))).toBe("ok");
  expect(h.handle("not json")).toBe("ok");
  expect(seen).toEqual([call("find"), "not json"]);
});

it("adds the start page to the engine's initialize instructions (srs-web#674)", () => {
  const init = (instructions?: string) => ({
    handle: (t: string) =>
      JSON.stringify({
        jsonrpc: "2.0",
        id: JSON.parse(t).id,
        result: { protocolVersion: "x", ...(instructions ? { instructions } : {}) },
      }),
  });
  const req = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}';
  const withOwn = JSON.parse(withUiTools(init("Engine rules."), host()).handle(req)!).result
    .instructions;
  expect(withOwn).toBe(`Engine rules.\n\n${START_PAGE_INSTRUCTIONS}`);
  expect(JSON.parse(withUiTools(init(), host()).handle(req)!).result.instructions).toBe(
    START_PAGE_INSTRUCTIONS
  );
  expect(START_PAGE_INSTRUCTIONS).toContain("ui_help");
});

it("the start page ends with the open editor's brief, or is the brief alone when there is no manual", () => {
  const text = (ui: UiHost) =>
    JSON.parse(withUiTools(toolEngine(), ui).handle(call("ui_help"))!).result.content[0]
      .text as string;
  const page = text(host({ brief: () => "How to work on this essay\n- rule" }));
  expect(page.indexOf("Layers")).toBeLessThan(page.indexOf("How to work on this essay"));
  expect(text(host({ help: () => [], brief: () => "Only rules" }))).toBe("Only rules");
});
