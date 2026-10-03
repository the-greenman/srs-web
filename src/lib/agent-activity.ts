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
};

let seq = 0;

/** Wrap a session so each request that wrote is reported with its agent. */
export function observeSession(
  session: ObservedSession,
  agentId: string,
  onWrite: (w: AgentWrite) => void,
  /** The client's own name from its `initialize` (the engine uses it as the actor name unless the host set a label). */
  onClientName?: (name: string) => void,
  /** The instance a relation points at, so a link is attributed to the record it touches. */
  relationTarget?: (relationId: string) => string | undefined
): FrameHandler {
  return {
    handle(text) {
      if (onClientName && text.includes('"initialize"')) {
        try {
          const n = JSON.parse(text)?.params?.clientInfo?.name;
          if (typeof n === "string" && n) onClientName(n);
        } catch {}
      }
      const out = session.handle(text);
      const raw = session.take_write_summary(); // drains: call exactly once per handled request
      if (raw) {
        const { tool, changed } = JSON.parse(raw) as { tool: string; changed: WriteChange[] };
        const rel = changed.find((c) => c.target === "relation");
        onWrite({
          seq: ++seq,
          agentId,
          tool,
          changed,
          instanceId:
            changed.find((c) => c.target === "instance")?.id ??
            (rel ? relationTarget?.(rel.id) : undefined),
          at: Date.now(),
        });
      }
      return out;
    },
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

export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Eight well-separated hues; the actor id picks one (same id, same colour, in every session). */
const HUES = [0, 45, 90, 140, 190, 230, 280, 320];
export function actorHue(id: string): number {
  return HUES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
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
