/**
 * The open editor's working rules for agents (srs-web#674): what `ui_help` adds after the feature
 * manual, so an agent's start page holds everything it needs. The open shell registers a provider
 * (the essay: its handoff) and clears it when it closes; one shell is open at a time.
 */
let provider: (() => string | undefined) | null = null;

/** Register the open shell's brief; returns the unregister function (call it on unmount). */
export function provideAgentBrief(fn: () => string | undefined): () => void {
  provider = fn;
  return () => {
    if (provider === fn) provider = null;
  };
}

/** The open editor's brief for agents, if it has one. */
export function agentBrief(): string | undefined {
  try {
    return provider?.() || undefined;
  } catch {
    return undefined;
  }
}
