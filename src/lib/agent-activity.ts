/**
 * Agent activity (srs-web#372): which agent wrote what, observed at the one place that knows both
 * the agent and the write — the boundary of that agent's own MCP session.
 *
 * The session's actor is the connection id, so authorship is never inferred. A request counts as a
 * write only if the engine says so: `session.write_epoch()` moved (srs-rust#1140). What the core does
 * not yet report is the changed instance ids and operation, so the tool name and its own arguments
 * (and the created id in the result) are read from the request/response. Limits: srs-rust#1202
 * (a per-request write summary from the core would replace this parsing).
 */
import type { FrameHandler } from "./mcp/relay-executor";

export interface AgentWrite {
  /** Monotonic across all agents in this page; the feed key. */
  seq: number;
  /** The agent connection id (= the session actor id). */
  agentId: string;
  tool: string;
  /** The record the write touched, when the request or result names one. */
  instanceId?: string;
  /** Field names the request set (`record_update` / `record_create`). */
  fields: string[];
  at: number;
}

export const MAX_FEED = 50;

const obj = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** The write a handled `tools/call` made; undefined for anything that is not a single tool call. */
export function writeFrom(
  agentId: string,
  request: string,
  response: string | undefined,
  at: number,
  seq = 0
): AgentWrite | undefined {
  let req: Record<string, unknown> | undefined;
  let res: Record<string, unknown> | undefined;
  try {
    req = obj(JSON.parse(request));
    res = response ? obj(JSON.parse(response)) : undefined;
  } catch {
    return undefined;
  }
  if (req?.method !== "tools/call") return undefined;
  const params = obj(req.params);
  const tool = str(params?.name);
  if (!tool) return undefined;
  const args = obj(params?.arguments) ?? {};
  const created = obj(obj(res?.result)?.structuredContent);
  const instanceId = str(args.instanceId) ?? str(args.targetInstanceId) ?? str(created?.instanceId);
  return { seq, agentId, tool, instanceId, fields: Object.keys(obj(args.fieldValues) ?? {}), at };
}

let seq = 0;

/** Wrap a session so each request that mutated the store is reported with its agent. */
export function observeSession(
  session: FrameHandler & { write_epoch(): number },
  agentId: string,
  onWrite: (w: AgentWrite) => void,
  /** The client's own name from its `initialize` (the engine uses it as the actor name unless the host set a label). */
  onClientName?: (name: string) => void
): FrameHandler {
  return {
    handle(text) {
      if (onClientName && text.includes('"initialize"')) {
        try {
          const n = obj(obj(obj(JSON.parse(text))?.params)?.clientInfo)?.name;
          if (typeof n === "string" && n) onClientName(n);
        } catch {}
      }
      const before = session.write_epoch();
      const out = session.handle(text);
      if (session.write_epoch() !== before) {
        const w = writeFrom(agentId, text, out, Date.now(), ++seq);
        if (w) onWrite(w);
      }
      return out;
    },
  };
}

/** Newest first, capped. */
export const pushWrite = (feed: AgentWrite[], w: AgentWrite, max = MAX_FEED): AgentWrite[] =>
  [w, ...feed].slice(0, max);

const FIELD_VERB: Record<string, string> = {
  paragraph_title: "titled",
  body: "edited",
  comment_text: "commented on",
};
/** "titled", "edited", "added", ... — presentation of the tool + fields. */
export function verb(w: Pick<AgentWrite, "tool" | "fields">): string {
  const named = w.fields.map((f) => FIELD_VERB[f]).filter(Boolean);
  if (w.tool === "record_update" && named.length) return named.join(" and ");
  if (w.tool === "record_create") return named.length ? named[0] : "added";
  if (w.tool === "relation_create") return "linked";
  return w.tool.replace(/_/g, " ");
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
