import type { AgentConnection } from "./agent-connections";

/**
 * Reopen the saved agents that were open on this repository (#418), in library order. `open`
 * resolves false when another tab holds the channel's lock; that is retried once, since a reload
 * usually releases the old page's lock a moment later.
 */
export async function reopenSaved(
  library: AgentConnection[],
  repoId: string,
  open: (c: AgentConnection) => Promise<boolean>,
  o: { retryMs?: number; stillValid?: () => boolean } = {}
): Promise<void> {
  for (const c of library) {
    if (c.reopen !== repoId) continue;
    if (!(await open(c)) && o.stillValid?.() !== false)
      setTimeout(() => void open(c), o.retryMs ?? 1000);
  }
}
