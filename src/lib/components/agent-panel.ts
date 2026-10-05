import type { AgentConnection } from "../agent-connections.js";
import type { HostState } from "../mcp/relay-host.js";

/** One agent row of the AgentPanel, resolved by App (names, relay label, live state). */
export interface PanelAgent {
  conn: AgentConnection;
  name: string;
  relayLabel: string;
  /** null = saved, not open in this tab. */
  state: HostState | null;
  inUseElsewhere: boolean;
}
