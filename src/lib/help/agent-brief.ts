/**
 * The open editor's own rules for agents (srs-web#674): what the universal `ui_help` start page adds
 * after that editor's feature manual. Each editor's shell registers its provider (the essay: its
 * handoff) and clears it when it closes (owner: editors add their own help and instructions).
 * ponytail: one provider, as one shell is open at a time; key it by editor id if shells ever coexist.
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
