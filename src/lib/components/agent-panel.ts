import type { AgentConnection } from "../agent-connections.js";
import type { HostState } from "../mcp/relay-host.js";
import { PAIRING_WINDOW_SECONDS, type PairingResponse } from "../mcp/relay-protocol";

/** One agent row of the AgentPanel, resolved by App (names, relay label, live state). */
export interface PanelAgent {
  conn: AgentConnection;
  name: string;
  relayLabel: string;
  /** null = saved, not open in this tab. */
  state: HostState | null;
  inUseElsewhere: boolean;
}

/** Whole minutes left, rounded up, clamped to [1, PAIRING_WINDOW_SECONDS/60]; 0 when expiresAt <= now ("Refreshing…"). */
export function pairingMinutesLeft(expiresAt: number, now: number): number {
  if (expiresAt <= now) return 0;
  return Math.min(PAIRING_WINDOW_SECONDS / 60, Math.max(1, Math.ceil((expiresAt - now) / 60_000)));
}

/** What the open pairing row shows: the current code (kept across a failed refresh), the last error, whole minutes left. */
export interface PairingView {
  data: PairingResponse | null;
  error: string | null;
  minutes: number;
}
