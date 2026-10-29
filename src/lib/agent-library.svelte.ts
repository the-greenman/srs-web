/**
 * The relay agent controller (srs-web#603): the relay library, one relay channel + MCP session per
 * saved agent connection (srs-web#358), cross-tab channel locks, reopen after a reload (#418) and
 * cross-tab storage sync. Every app built on srs-web attaches agents through it; the app keeps only
 * policy (which write guard applies, `guard`) and placement (where `AgentPanel` renders).
 *
 * The Rust/WASM McpSession owns all MCP semantics; `$lib/agent-host` opens and configures each
 * session; this keeps the hosts. MCP writes reach the app through `onHandled` and never call a
 * storage provider: persistence stays the app's.
 *
 * Construct it during component init: it registers effects (the in-use refresh, storage sync and
 * the 15 s clock) that live as long as that component.
 */
import { tick } from "svelte";
import { type AgentStatus, type AgentWrite, type UiHost, pushWrite } from "./agent-activity.js";
import {
  type AgentConnection,
  acquireChannelLock,
  channelsInUseElsewhere,
  connections,
  credsKey,
  releaseChannelLock,
} from "./agent-connections.js";
import { type AgentHostEntry, applyAgentGuard, openAgentSession } from "./agent-host.js";
import type { PanelAgent } from "./components/agent-panel.js";
import { type HostState, RelayHost } from "./mcp/relay-host.js";
import { notify } from "./notices.svelte.js";
import { relays } from "./relay-library.js";
import { reopenSaved } from "./reopen.js";
import { type AgentWriteGuard, type SrsRepository, repositoryId } from "./srs-client.js";

type Agent = { conn: AgentConnection; state: HostState };

export interface AgentLibraryOptions {
  /** The write guard in force now (policy); null = none. Read again whenever a session opens or `applyGuards` runs. */
  guard: () => AgentWriteGuard | null;
  /** An agent request was handled (it may have written): the app marks its document unsaved. */
  onHandled: () => void;
  /** The writer's screen for the host UI tools (ui_help, ui_highlight). */
  ui?: UiHost;
}

export class AgentLibrary {
  /** Relays are a user-managed library (srs-web#442); each agent is bound to one. */
  relayList = $state(relays.list());
  /** Saved channels. */
  library = $state<AgentConnection[]>(connections.list());
  /** The agents open in this tab: the reactive view of `#hosts`. */
  agents = $state<Agent[]>([]);
  /** Agent writes observed at each session boundary (agent-activity.ts), newest first. */
  writes = $state<AgentWrite[]>([]);
  /** Client-reported names (MCP initialize clientInfo); the engine's actor name is the label, else this. */
  clientNames = $state<Record<string, string>>({});
  /** Channels held by another tab (Web Locks). */
  inUse = $state<Set<string>>(new Set());
  /** The 15 s clock for "Connected 2 min ago". */
  now = $state(Date.now());

  status = $derived<AgentStatus>({
    connected: this.agents.filter((a) => a.state.status === "online").length,
    total: this.agents.length,
    agents: this.agents.map((a) => ({
      id: a.conn.id,
      name: this.agentName(a.conn),
      status: a.state.status,
    })),
    writes: this.writes,
  });
  panelAgents = $derived<PanelAgent[]>(
    this.library.map((conn) => ({
      conn,
      name: this.agentName(conn),
      relayLabel: this.relayList.find((r) => r.id === conn.relayId)?.label ?? "Relay missing",
      state: this.agents.find((a) => a.conn.id === conn.id)?.state ?? null,
      inUseElsewhere: this.inUse.has(conn.id),
    }))
  );

  #o: AgentLibraryOptions;
  #hosts = new Map<string, AgentHostEntry>();
  // Ids mid-open (a Connect click must not duplicate them), and ids allowed exactly one automatic
  // takeover if the relay still holds the dead page's socket.
  #opening = new Set<string>();
  #autoTakeover = new Set<string>();
  #repo: SrsRepository | null = null;
  #reopened = false;

  constructor(o: AgentLibraryOptions) {
    this.#o = o;
    connections.sweepInits(connections.list().map((c) => c.id));
    this.#adoptRelays();
    $effect(() => {
      const t = setInterval(() => {
        this.now = Date.now();
      }, 15000);
      return () => clearInterval(t);
    });
    // Another tab changed the stored lists: re-read what is displayed. Never touches open agents
    // (`agents`/`#hosts` are separate state), and `storage` never fires in the tab that wrote.
    $effect(() => {
      const onStorage = (e: StorageEvent) => {
        if (e.storageArea !== localStorage) return;
        if (relays.reload(e.key)) this.relayList = relays.list();
        if (connections.reload(e.key)) this.library = [...connections.list()];
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    });
    $effect(() => {
      if (this.library.length === 0) return;
      this.refreshInUse();
      window.addEventListener("focus", this.refreshInUse);
      document.addEventListener("visibilitychange", this.refreshInUse);
      return () => {
        window.removeEventListener("focus", this.refreshInUse);
        document.removeEventListener("visibilitychange", this.refreshInUse);
      };
    });
  }

  agentName = (conn: AgentConnection): string =>
    conn.label ?? this.clientNames[conn.id] ?? `Agent ${conn.id.slice(6, 12)}`;

  refreshInUse = (): void => {
    void channelsInUseElsewhere().then((s) => {
      this.inUse = s;
    });
  };

  // --- relays ------------------------------------------------------------------------------

  /** Bind agents that predate the library to the default relay (after every relay change). */
  #adoptRelays(): void {
    const d = this.relayList.find((r) => r.isDefault);
    if (d) this.library = [...connections.adoptRelay(d.id)];
  }
  #relayResult(
    r: { relays: ReturnType<typeof relays.list> } | { error: string },
    done?: string
  ): string | null {
    if ("error" in r) return r.error;
    this.relayList = r.relays;
    this.#adoptRelays();
    if (done) notify({ kind: "info", key: "agents", text: done });
    return null;
  }
  addRelay = (label: string, url: string): string | null =>
    this.#relayResult(relays.add(label, url), "Relay added");
  updateRelay = (id: string, patch: { label?: string; url?: string }): string | null =>
    this.#relayResult(relays.update(id, patch));
  removeRelay = (id: string): string | null =>
    this.#relayResult(relays.remove(id), "Relay removed");
  setDefaultRelay = (id: string): void => {
    this.relayList = relays.setDefault(id);
  };

  // --- sessions ----------------------------------------------------------------------------

  #setState(id: string, state: HostState): void {
    if (state.status === "online") this.#autoTakeover.delete(id);
    else if (state.status === "rejected" && this.#autoTakeover.delete(id))
      void this.#hosts.get(id)?.host.takeover();
    if (
      state.status === "online" &&
      this.agents.find((a) => a.conn.id === id)?.state.status !== "online"
    )
      this.library = [...connections.touch(id)];
    this.agents = this.agents.map((a) => (a.conn.id === id ? { ...a, state } : a));
  }
  #guardError = (id: string) => (error: string) =>
    this.#setState(id, { status: "error", callerUrl: null, error });

  #entry(conn: AgentConnection): AgentHostEntry {
    let h = this.#hosts.get(conn.id);
    if (!h) {
      h = {
        host: new RelayHost({
          relayUrl: relays.get(conn.relayId)?.url ?? "",
          storageKey: credsKey(conn.id),
          onHandled: () => this.#o.onHandled(),
          onChange: (s) => this.#setState(conn.id, s),
        }),
        session: null,
      };
      this.#hosts.set(conn.id, h);
    }
    return h;
  }

  #openSession(conn: AgentConnection): void {
    openAgentSession(this.#entry(conn), conn, this.#repo, {
      guard: this.#o.guard,
      ui: this.#o.ui,
      onGuardError: this.#guardError(conn.id),
      onWrite: (w) => {
        this.writes = pushWrite(this.writes, w);
      },
      // a replayed initialize only fills a missing name; it never flips one client's name to another's
      onClientName: (n, replayed) => {
        if (!replayed || !this.clientNames[conn.id])
          this.clientNames = { ...this.clientNames, [conn.id]: n };
      },
    });
  }

  /** Re-apply the current guard to every open session (call when the app's policy changes). */
  applyGuards = (): void => {
    this.#hosts.forEach((entry, id) =>
      applyAgentGuard(entry, { guard: this.#o.guard, onGuardError: this.#guardError(id) })
    );
  };

  /**
   * The app's repository changed: every open agent moves to it. Once per page load, the first
   * repository also reopens the agents that were open on it, after a tick, so the app has declared
   * its write guard before any agent can write.
   */
  setRepository = (repo: SrsRepository | null): void => {
    this.#repo = repo;
    this.writes = []; // a new repository: earlier writes name instances that are gone
    const rid = repo && this.agents.length ? repositoryId(repo) : null;
    for (const { conn } of this.agents) {
      this.#openSession(conn);
      if (rid) this.library = [...connections.setReopen(conn.id, rid)];
    }
    if (!repo || this.#reopened) return;
    this.#reopened = true;
    void tick().then(() => {
      if (this.#repo !== repo) {
        this.#reopened = false; // the next setRepository reopens for its repository
        return;
      }
      void reopenSaved(this.library, repositoryId(repo), (c) => this.#openChannel(c, true), {
        stillValid: () => this.#repo === repo,
      });
    });
  };

  /** Open a saved channel in this tab, only if no other tab holds it. */
  async #openChannel(conn: AgentConnection, reopening = false): Promise<boolean> {
    if (this.agents.some((a) => a.conn.id === conn.id) || this.#opening.has(conn.id)) return true;
    if (!relays.get(conn.relayId)) return true; // unbound or relay missing: cannot connect
    this.#opening.add(conn.id);
    try {
      if (!(await acquireChannelLock(conn.id))) {
        this.refreshInUse();
        return false;
      }
      this.agents = [
        ...this.agents,
        { conn, state: { status: "idle", callerUrl: null, error: null } },
      ];
      if (this.#repo) this.library = [...connections.setReopen(conn.id, repositoryId(this.#repo))];
      if (reopening) this.#autoTakeover.add(conn.id); // only a reopen that really opened may take over
      this.#openSession(conn);
      return true;
    } finally {
      this.#opening.delete(conn.id);
    }
  }

  // --- the panel's actions ----------------------------------------------------------------

  connect = (id: string): void => {
    const c = this.library.find((x) => x.id === id);
    if (c) void this.#openChannel(c);
  };
  connectNew = (label: string | undefined, relayId: string): void => {
    this.library = [...connections.add(label, relayId)];
    void this.#openChannel(this.library[this.library.length - 1]);
  };
  /** Disconnected agents only: the actor name is fixed when a session opens. */
  rename = (id: string, label: string): void => {
    this.library = [...connections.rename(id, label)];
  };
  /** Detach in this tab; the channel and its credentials stay in the library. */
  disconnect = async (id: string): Promise<void> => {
    const h = this.#hosts.get(id);
    h?.host.detach();
    h?.session?.free();
    this.library = [...connections.setReopen(id, null)];
    this.#hosts.delete(id);
    this.#autoTakeover.delete(id);
    const released = releaseChannelLock(id);
    this.agents = this.agents.filter((a) => a.conn.id !== id);
    await released; // the in-use query must not still see our own lock
    this.refreshInUse();
  };
  forget = async (id: string): Promise<void> => {
    // Defence in depth: the menu disables Forget, but the in-use set can be stale. Ask the locks now.
    if ((await channelsInUseElsewhere()).has(id)) {
      this.refreshInUse();
      return;
    }
    void this.disconnect(id);
    this.library = [...connections.remove(id)];
    notify({ kind: "info", key: "agents", text: "Agent forgotten" });
  };
  /** A new channel means new clients. */
  rotate = (id: string): void => {
    connections.clearInit(id);
    const { [id]: _gone, ...rest } = this.clientNames;
    this.clientNames = rest;
    void this.#hosts.get(id)?.host.rotate();
  };
  takeover = (id: string): void => {
    void this.#hosts.get(id)?.host.takeover();
  };
  pair = async (id: string) => {
    const e = this.#hosts.get(id);
    if (!e) throw new Error("No channel yet: connect the agent first.");
    return e.host.pair();
  };
}
