import { describe, expect, it, vi } from "vitest";
import { RelayExecutor, type SocketLike } from "../src/lib/mcp/relay-executor.js";
import { type HostState, RelayHost } from "../src/lib/mcp/relay-host.js";
import { base64UrlDecode, base64UrlEncode } from "../src/lib/mcp/relay-wire.js";

type Frame = { response: { status: number; body?: string } } & Record<string, unknown>;

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror = null;
  sent: Frame[] = [];
  closed = false;
  constructor(public url: string) {}
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.closed = true;
  }
  /** relay -> executor request frame */
  request(body: string, id = "r1") {
    const url = new URL(this.url);
    this.onmessage?.({
      data: JSON.stringify({
        version: 1,
        type: "request",
        requestId: id,
        executorGeneration: url.searchParams.get("generation"),
        deadlineUnixMs: 0,
        request: {
          method: "POST",
          contentType: "application/json",
          headers: {},
          body: base64UrlEncode(new TextEncoder().encode(body)),
        },
      }),
    });
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const text = (f: Frame) => new TextDecoder().decode(base64UrlDecode(f.response.body ?? ""));
const track = (sockets: FakeSocket[]) => (u: string) => {
  const s = new FakeSocket(u);
  sockets.push(s);
  return s;
};

function make(handle: (t: string) => string | undefined) {
  const sockets: FakeSocket[] = [];
  const status: string[] = [];
  const onHandled = vi.fn();
  const ex = new RelayExecutor({
    executorUrl: "wss://relay.test/v1/channels/c/executor/cred",
    session: { handle },
    onStatus: (s) => status.push(s),
    onHandled,
    createSocket: (u) => {
      const s = new FakeSocket(u);
      sockets.push(s);
      return s;
    },
    reconnectMs: 1,
  });
  ex.start();
  sockets[0].onopen?.();
  return { ex, sockets, status, onHandled };
}

describe("RelayExecutor", () => {
  it("forwards opaque bodies verbatim and returns the raw result (200 / 202)", async () => {
    const seen: string[] = [];
    const { sockets } = make((t) => {
      seen.push(t);
      return t.includes("notif") ? undefined : `{"echo":${JSON.stringify(t)}}`;
    });
    sockets[0].request("not even json", "a");
    sockets[0].request("notif", "b");
    await flush();
    expect(seen).toEqual(["not even json", "notif"]);
    const [a, b] = sockets[0].sent;
    expect(a.requestId).toBe("a");
    expect(a.response.status).toBe(200);
    expect(text(a)).toBe('{"echo":"not even json"}');
    expect(b.response).toEqual({ status: 202, headers: {} });
  });

  it("serializes execution", async () => {
    const order: string[] = [];
    const { sockets } = make((t) => {
      order.push(`s${t}`);
      order.push(`e${t}`);
      return "{}";
    });
    sockets[0].request("1", "1");
    sockets[0].request("2", "2");
    await flush();
    expect(order).toEqual(["s1", "e1", "s2", "e2"]);
    expect(sockets[0].sent.map((f) => f.requestId)).toEqual(["1", "2"]);
  });

  it("returns 500 when the session throws and ignores a foreign generation", async () => {
    const { sockets } = make(() => {
      throw new Error("boom");
    });
    sockets[0].request("x", "a");
    sockets[0].onmessage?.({
      data: JSON.stringify({
        version: 1,
        type: "request",
        requestId: "z",
        executorGeneration: "other",
        request: { body: "" },
      }),
    });
    await flush();
    expect(sockets[0].sent).toHaveLength(1);
    expect(sockets[0].sent[0].response.status).toBe(500);
  });

  it("stop() ends the epoch: queued requests never run and no late reply is sent", async () => {
    const handle = vi.fn(() => "{}");
    const { ex, sockets } = make(handle);
    sockets[0].request("1", "1");
    ex.stop();
    sockets[0].request("2", "2");
    await flush();
    expect(handle).not.toHaveBeenCalled();
    expect(sockets[0].sent).toHaveLength(0);
  });

  it("reports rejected (closed before open), replaced (4002), and reconnects after a drop", async () => {
    const a = make(() => "{}");
    a.sockets[0].onclose?.({ code: 1006 });
    expect(a.status.at(-1)).toBe("offline");
    await new Promise((r) => setTimeout(r, 5));
    expect(a.sockets).toHaveLength(2);

    const sockets: FakeSocket[] = [];
    const status: string[] = [];
    new RelayExecutor({
      executorUrl: "wss://r/x",
      session: { handle: () => "" },
      onStatus: (s) => status.push(s),
      onHandled() {},
      createSocket: track(sockets),
    }).start();
    sockets[0].onclose?.({ code: 1006 });
    expect(status.at(-1)).toBe("rejected");
    const b = make(() => "{}");
    b.sockets[0].onclose?.({ code: 4002 });
    expect(b.status.at(-1)).toBe("replaced");
    expect(b.sockets).toHaveLength(1);
  });

  it("takeover passes takeover=true on the executor URL", () => {
    const sockets: FakeSocket[] = [];
    new RelayExecutor({
      executorUrl: "wss://r/x",
      takeover: true,
      session: { handle: () => "" },
      onStatus() {},
      onHandled() {},
      createSocket: track(sockets),
    }).start();
    expect(new URL(sockets[0].url).searchParams.get("takeover")).toBe("true");
  });
});

describe("RelayHost", () => {
  function host() {
    let epoch = 0;
    const sockets: FakeSocket[] = [];
    const store = new Map<string, string>();
    const onMutated = vi.fn();
    let n = 0;
    const fetchImpl = vi.fn(async () =>
      Response.json({
        channel: `c${++n}`,
        executorUrl: `wss://relay.test/e${n}`,
        callerUrl: `https://relay.test/call${n}`,
      })
    ) as unknown as typeof fetch;
    const states: HostState[] = [];
    const h = new RelayHost({
      relayUrl: "https://relay.test",
      onMutated,
      onChange: (s) => states.push(s),
      fetchImpl,
      createSocket: track(sockets),
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    });
    return {
      h,
      sockets,
      onMutated,
      fetchImpl,
      states,
      sess: (write: boolean) => ({
        handle: () => {
          if (write) epoch++;
          return "{}";
        },
        write_epoch: () => epoch,
      }),
    };
  }

  it("marks a mutation only when the repository changed, and reuses stored credentials", async () => {
    const t = host();
    const session = t.sess(true);
    await t.h.attach(session);
    t.sockets[0].onopen?.();
    t.sockets[0].request("write", "1");
    t.sockets[0].request("write", "2");
    await flush();
    expect(t.onMutated).toHaveBeenCalledTimes(2); // one per mutating request

    await t.h.attach(t.sess(false));
    expect(t.fetchImpl).toHaveBeenCalledTimes(1); // stored channel reused
    t.sockets[1].request("read", "3");
    await flush();
    expect(t.onMutated).toHaveBeenCalledTimes(2); // read: no change
    expect(t.states.at(-1).callerUrl).toBe("https://relay.test/call1");
  });

  it("rotate bootstraps a new channel; detach/attach isolates epochs", async () => {
    const t = host();
    await t.h.attach(t.sess(false));
    await t.h.rotate();
    expect(t.fetchImpl).toHaveBeenCalledTimes(2);
    expect(t.sockets[0].closed).toBe(true);
    expect(t.states.at(-1).callerUrl).toBe("https://relay.test/call2");
    t.h.detach();
    t.sockets[1].request("late", "9");
    await flush();
    expect(t.sockets[1].sent).toHaveLength(0);
    expect(t.states.at(-1).status).toBe("idle");
  });

  it("surfaces relay origin refusal codes from bootstrap", async () => {
    const states: HostState[] = [];
    const h = new RelayHost({
      relayUrl: "https://relay.test",
      onMutated() {},
      onChange: (s) => states.push(s),
      fetchImpl: (async () =>
        Response.json({ error: "invalid_origin" }, { status: 400 })) as unknown as typeof fetch,
      storage: { getItem: () => null, setItem() {} },
    });
    await h.attach({ handle: () => "{}", write_epoch: () => 0 });
    expect(states.at(-1).status).toBe("error");
    expect(states.at(-1).error).toContain("invalid_origin");
  });
});
