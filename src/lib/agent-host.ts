import { type AgentWrite, observeSession } from "./agent-activity.js";
/**
 * Agent session host (srs-web#576): the composition that makes an MCP session safe to attach, so
 * every app built on srs-web connects agents the same way (capability layering: a composition every
 * app needs lives in `$lib`, never in one app's shell).
 *
 * Order matters and is fixed here: the previous session is freed, the write guard is applied before
 * anything attaches (fail closed: if it cannot be applied the agent is detached and the error is
 * reported), the RFC-046 actor is set only on a revision-9 corpus, and only then does the host attach.
 * The Rust/WASM `McpSession` owns all MCP semantics; this only hosts it.
 */
import { type AgentConnection, connections } from "./agent-connections.js";
import type { RelayHost } from "./mcp/relay-host.js";
import {
  type AgentWriteGuard,
  type McpSession,
  RFC046_MIGRATION_ID,
  type SrsRepository,
  listRelations,
  neededMigrationIds,
} from "./srs-client.js";

/** One connection's relay host and the engine session it currently serves. */
export interface AgentHostEntry {
  host: RelayHost;
  session: McpSession | null;
}

export interface AgentSessionOptions {
  /** The guard that applies to the repository now (policy); null clears any guard. Read again on every call. */
  guard: () => AgentWriteGuard | null;
  /** Each write the engine reports for this agent. */
  onWrite: (w: AgentWrite) => void;
  /** The client's own name from its `initialize`; `replayed` when it came from the stored one. */
  onClientName?: (name: string, replayed: boolean) => void;
  /** The guard could not be applied: the agent has been detached (fail closed). */
  onGuardError?: (message: string) => void;
}

/**
 * Apply the current guard to a session. Fail closed: on error the host is detached and the error
 * reported; recovery is the next repository change (`openAgentSession` re-applies the guard).
 */
export function applyAgentGuard(
  entry: AgentHostEntry,
  o: Pick<AgentSessionOptions, "guard" | "onGuardError">
): boolean {
  try {
    const guard = o.guard();
    if (guard) entry.session?.set_write_guard(JSON.stringify(guard));
    else entry.session?.clear_write_guard();
    return true;
  } catch (e) {
    console.error("MCP write guard could not be applied", e);
    entry.host.detach();
    o.onGuardError?.(`Write guard failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/**
 * Agent actor (RFC-046): the host assigns the id; the name is the user's label if set, else the
 * engine fills it from the client's initialize clientInfo. Only on a revision-9 corpus: below it an
 * actor would refuse writes, so a repo whose migration was declined keeps its agent writes unattributed.
 */
export function applyAgentActor(
  session: McpSession,
  repo: SrsRepository,
  conn: AgentConnection
): void {
  try {
    if (neededMigrationIds(repo).includes(RFC046_MIGRATION_ID)) return;
  } catch (e) {
    console.error("Agent actor not set: migration state unknown", e);
    return;
  }
  session.set_actor(
    JSON.stringify({ kind: "ai", id: conn.id, ...(conn.label ? { name: conn.label } : {}) })
  );
}

/**
 * The one place a connection's session is opened and configured (guard, actor) before attach.
 * Frees the previous repository's session; with no repository the host is left detached.
 */
export function openAgentSession(
  entry: AgentHostEntry,
  conn: AgentConnection,
  repo: SrsRepository | null,
  o: AgentSessionOptions
): void {
  entry.host.detach();
  entry.session?.free(); // release the previous repo's WASM session
  entry.session = repo ? repo.open_mcp_session() : null;
  const session = entry.session;
  if (!repo || !session) return;
  if (!applyAgentGuard(entry, o)) return;
  applyAgentActor(session, repo, conn);
  void entry.host.attach(
    observeSession(session, conn.id, {
      onWrite: o.onWrite,
      onClientName: o.onClientName,
      relationTarget: (id) =>
        listRelations(repo, {}).find((r) => r.relationId === id)?.targetInstanceId,
      initStore: {
        load: () => connections.loadInit(conn.id),
        save: (i) => connections.saveInit(conn.id, i),
        clear: () => connections.clearInit(conn.id),
      },
    })
  );
}
