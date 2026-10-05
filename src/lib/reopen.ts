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
  const valid = () => o.stillValid?.() !== false;
  for (const c of library) {
    if (!valid()) return;
    if (c.reopen !== repoId) continue;
    if (!(await open(c)) && valid()) setTimeout(() => valid() && void open(c), o.retryMs ?? 1000);
  }
}
