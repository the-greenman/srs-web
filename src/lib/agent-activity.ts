/**
 * Agent activity (srs-web#372): which agent wrote what, observed at the one place that knows both
 * the agent and the write — the boundary of that agent's own MCP session.
 *
 * The session's actor is the connection id, so authorship is never inferred. A request counts as a
 * write only if the engine says so: `session.take_write_summary()` (srs-rust#1202) names the tool
 * and every instance / relation / container it changed — including indirect ones (fork, copy).
 * v1 carries no field names, so verbs say what happened to the target, not which field.
 */
import type { HelpItem } from "./help/help.js";
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
 * The only JSON-RPC parsing in the host (ADR-001), with `withUiTools` below: the method, the client's
 * name and whether the message carries an `error` member, from one parse. Never throws.
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

// ── Host UI tools (srs-web#643, ADR-028) ─────────────────────────────────────────────────────────
// ui_help and ui_highlight are presentation, so the host answers them itself and the engine never
// sees them: tools/list gets them appended, tools/call for them is answered here. They read and
// point; they never change the document (domain rule: agents respond, they never write).

/** What the screen gives the UI tools: the open editor's help and the writer's screen. */
export interface UiHost {
  /** The open editor's help, in order; [] when it has none. */
  help(): HelpItem[];
  /** Whether a feature is on the writer's screen now. */
  onScreen(featureId: string): boolean;
  /** Point at a feature or a paragraph; `shown: false` with the reason when it is not on screen. */
  highlight(t: { featureId?: string; blockId?: string; message?: string }): {
    shown: boolean;
    reason?: string;
  };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
export const UI_TOOLS = [
  {
    name: "ui_help",
    description:
      "Read the manual of the editor the writer has open: each feature's id, what it is, how to teach it, and whether it is on the writer's screen now. Use it to teach the writer the editor, one feature at a time. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Editor manual", ...READ_ONLY },
  },
  {
    name: "ui_highlight",
    description:
      "Point at something on the writer's screen: a feature by its featureId (from ui_help) or a paragraph by its instanceId (blockId). It scrolls it into view, outlines it, and shows your short message beside it. Returns shown: false with the reason when it is not on screen. Never changes the document.",
    inputSchema: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "A feature id from ui_help, e.g. essay.layers." },
        blockId: { type: "string", description: "A paragraph's instanceId." },
        message: {
          type: "string",
          description: "One or two short sentences shown beside it (plain text).",
        },
      },
      additionalProperties: false,
    },
    annotations: { title: "Point at the screen", ...READ_ONLY },
  },
];
const UI_TOOL_NAMES = new Set(UI_TOOLS.map((t) => t.name));

/** The manual ui_help returns: every feature, with where it is now and how to teach it. */
export function uiManual(ui: UiHost): string {
  const items = ui.help();
  if (!items.length) return "This editor has no manual yet.";
  const head =
    "# How to use this editor\n\nTeach the writer one feature at a time, in this order. Show each one with ui_highlight (featureId) before you explain it; for a paragraph, use its instanceId as blockId.\n";
  return [
    head,
    ...items.map((i) => {
      const where =
        i.placement === "concept"
          ? "an idea, not one place on screen"
          : ui.onScreen(i.featureId)
            ? "on screen now"
            : "not on screen now";
      return [
        `## ${i.title} (\`${i.featureId}\`, ${where})`,
        i.summary,
        i.explanation,
        i.aiGuidance && `How to teach it: ${i.aiGuidance}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }),
  ].join("\n");
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Answer the host UI tools; pass everything else to the session, appending them to its tools/list. */
export function withUiTools(inner: FrameHandler, ui: UiHost): FrameHandler {
  return {
    handle(text) {
      let m: {
        id?: unknown;
        method?: unknown;
        params?: { name?: unknown; cursor?: unknown; arguments?: Record<string, unknown> };
      };
      try {
        m = JSON.parse(text);
      } catch {
        return inner.handle(text);
      }
      if (m?.method === "tools/call" && UI_TOOL_NAMES.has(m.params?.name as string)) {
        const a = m.params?.arguments ?? {};
        let result: { content: { type: "text"; text: string }[]; isError?: boolean };
        if (m.params?.name === "ui_help")
          result = { content: [{ type: "text", text: uiManual(ui) }] };
        else {
          const t = {
            featureId: str(a.featureId),
            blockId: str(a.blockId),
            message: str(a.message),
          };
          const r =
            t.featureId || t.blockId
              ? ui.highlight(t)
              : {
                  shown: false,
                  reason:
                    "Give a featureId (from ui_help) or a blockId (a paragraph's instanceId).",
                };
          result = {
            content: [{ type: "text", text: JSON.stringify(r) }],
            ...(t.featureId || t.blockId ? {} : { isError: true }),
          };
        }
        return JSON.stringify({ jsonrpc: "2.0", id: m.id, result });
      }
      const out = inner.handle(text);
      if (m?.method === "tools/list" && out !== undefined && m.params?.cursor === undefined) {
        try {
          const r = JSON.parse(out);
          if (Array.isArray(r?.result?.tools)) {
            r.result.tools.push(...UI_TOOLS);
            return JSON.stringify(r);
          }
        } catch {}
      }
      return out;
    },
    sessionUnknown: () => inner.sessionUnknown?.() ?? false,
  };
}
