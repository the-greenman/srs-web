/**
 * Agent activity (srs-web#372): which agent wrote what, observed at the one place that knows both
 * the agent and the write — the boundary of that agent's own MCP session.
 *
 * The session's actor is the connection id, so authorship is never inferred. A request counts as a
 * write only if the engine says so: `session.take_write_summary()` (srs-rust#1202) names the tool
 * and every instance / relation / container it changed — including indirect ones (fork, copy).
 * v1 carries no field names, so verbs say what happened to the target, not which field.
 */
import type { FrameHandler } from "./mcp/relay-executor";

export interface WriteChange {
  target: "instance" | "relation" | "container";
  id: string;
  kind: "created" | "updated" | "deleted";
}

export interface AgentWrite {
  /** Monotonic across all agents in this page; the feed key. */
  seq: number;
  /** The agent connection id (= the session actor id). */
  agentId: string;
  tool: string;
  /** Everything the request changed, as reported by the engine. */
  changed: WriteChange[];
  /** The record the write touched: the first changed instance, else a changed relation's target. */
  instanceId?: string;
  at: number;
}

export const MAX_FEED = 50;

/** The session's host-facing surface: handle a frame, drain the write summary. */
export type ObservedSession = FrameHandler & {
  take_write_summary(): string | undefined;
  is_initialized(): boolean;
};

/** The client's last successful `initialize` body (opaque) and whether `notifications/initialized` followed. */
export interface Init {
  body: string;
  initialized: boolean;
}
export interface InitStore {
  load(): Init | null;
  save(i: Init): void;
  clear(): void;
}

let seq = 0;

/**
 * The only JSON-RPC parsing in the host (ADR-001): the method, the client's name and whether the
 * message carries an `error` member, from one parse. Never throws.
 */
export function rpcInfo(text: string): { method?: string; clientName?: string; isError: boolean } {
  try {
    const m = JSON.parse(text);
    const n = m?.params?.clientInfo?.name;
    return {
      method: typeof m?.method === "string" ? m.method : undefined,
      clientName: typeof n === "string" && n ? n : undefined,
      isError: m != null && typeof m === "object" && "error" in m,
    };
  } catch {
    return { isError: false };
  }
}

const INITIALIZED = '{"jsonrpc":"2.0","method":"notifications/initialized"}';

/**
 * Wrap a session so each request that wrote is reported with its agent. After a reload the session
 * is fresh and uninitialized: the client's own stored `initialize` is replayed into it (#418), so
 * the client never notices; `sessionUnknown()` tells the executor when nothing could be replayed.
 */
export function observeSession(
  session: ObservedSession,
  agentId: string,
  o: {
    onWrite(w: AgentWrite): void;
    /** The client's own name from its `initialize` (the engine uses it as the actor name unless the host set a label); `replayed` when it came from the stored one. */
    onClientName?(name: string, replayed: boolean): void;
    /** The instance a relation points at, so a link is attributed to the record it touches. */
    relationTarget?(relationId: string): string | undefined;
    initStore?: InitStore;
  }
): FrameHandler {
  let unknown = false;
  /** Drain the write summary: call exactly once per handled request. */
  const drain = (report: boolean) => {
    const raw = session.take_write_summary();
    if (!raw || !report) return;
    const { tool, changed } = JSON.parse(raw) as { tool: string; changed: WriteChange[] };
    const rel = changed.find((c) => c.target === "relation");
    o.onWrite({
      seq: ++seq,
      agentId,
      tool,
      changed,
      instanceId:
        changed.find((c) => c.target === "instance")?.id ??
        (rel ? o.relationTarget?.(rel.id) : undefined),
      at: Date.now(),
    });
  };
  /** Feed the stored initialize (and its notification) into a fresh session; replies are discarded. */
  const replay = (init: Init) => {
    const name = rpcInfo(init.body).clientName;
    const reply = session.handle(init.body);
    drain(false);
    if (reply === undefined || rpcInfo(reply).isError || !session.is_initialized()) {
      o.initStore?.clear();
      return;
    }
    if (name) o.onClientName?.(name, true);
    if (init.initialized) {
      session.handle(INITIALIZED);
      drain(false);
    }
  };
  return {
    handle(text) {
      const { method, clientName } = rpcInfo(text);
      // ponytail: one message per body; a JSON-RPC batch has no method here, so it is never stored or replayed
      const stored =
        method !== "initialize" && !session.is_initialized() ? o.initStore?.load() : null;
      if (stored) replay(stored);
      if (method === "initialize" && clientName) o.onClientName?.(clientName, false);
      const out = session.handle(text);
      drain(true);
      unknown = out !== undefined && method !== "initialize" && !session.is_initialized();
      if (
        method === "initialize" &&
        out !== undefined &&
        !rpcInfo(out).isError &&
        session.is_initialized()
      ) {
        o.initStore?.save({ body: text, initialized: false });
      } else if (method === "notifications/initialized") {
        const i = o.initStore?.load();
        if (i) o.initStore?.save({ ...i, initialized: true });
      }
      return out;
    },
    sessionUnknown: () => unknown,
  };
}

/** Newest first, capped. */
export const pushWrite = (feed: AgentWrite[], w: AgentWrite, max = MAX_FEED): AgentWrite[] =>
  [w, ...feed].slice(0, max);

const KIND_VERB = { created: "added", updated: "updated", deleted: "removed" } as const;
/** "added", "updated", "linked", ... — presentation of what the engine said the write did. */
export function verb(w: Pick<AgentWrite, "tool" | "changed">): string {
  const c = w.changed[0];
  if (!c) return w.tool.replace(/_/g, " ");
  if (c.target === "relation") return c.kind === "created" ? "linked" : `${KIND_VERB[c.kind]} link`;
  return c.target === "container" ? `${KIND_VERB[c.kind]} container` : KIND_VERB[c.kind];
}

/** What App's agent panel snippet may use from the shell (the paragraph label lives in the shell). */
export interface AgentPanelCtx {
  /** "titled ¶ Opening · 2 min ago" for the agent's latest write, or "No activity yet". */
  lastActivity(agentId: string): string;
}

/** What the shell needs to present agent activity; computed once in App. */
export interface AgentStatus {
  connected: number;
  total: number;
  agents: { id: string; name: string; status: string }[];
  /** Newest first. */
  writes: AgentWrite[];
}
