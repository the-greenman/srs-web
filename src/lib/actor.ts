/**
 * Human actor for UI writes (RFC-046, srs-web#359). The engine stamps `createdBy` from the
 * session actor; this module only decides WHO the session is and hands it to
 * `repo.set_actor`. Ids are scoped by login provider (`github:<login>`, a future provider
 * slots in as `<provider>:<id>`); with no login a generated `local:<uuid>` plus a display
 * name is kept in this browser; with neither, writes are unattributed.
 */
import type { Actor, SrsRepository } from "./srs-client.js";

const KEY = "srs-web.actor";
let signedIn: Actor | null = null;

/** The actor for a login provider: id `<provider>:<id>`, name = profile name (or the login). */
export function providerActor(provider: string, id: string, name?: string): Actor {
  return { kind: "human", id: `${provider}:${id}`, name: name || id };
}

/** Called when a provider login resolves (null on sign-out). */
export function setSignedInActor(actor: Actor | null): void {
  signedIn = actor;
}

export function localActor(): Actor | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return a?.id?.startsWith("local:") && a.name ? { kind: "human", id: a.id, name: a.name } : null;
  } catch {
    return null;
  }
}

/** Remember a display name (keeps the generated id once created). Null when blank or storage fails. */
export function saveLocalName(name: string): Actor | null {
  const n = name.trim();
  if (!n) return null;
  const actor: Actor = {
    kind: "human",
    id: localActor()?.id ?? `local:${crypto.randomUUID()}`,
    name: n,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(actor));
  } catch {
    return null;
  }
  return actor;
}

export const currentActor = (): Actor | null => signedIn ?? localActor();

/** Install the current actor on a repository handle (clear it when there is none). */
export function applyActor(repo: SrsRepository): void {
  const a = currentActor();
  if (a) repo.set_actor(JSON.stringify(a));
  else repo.clear_actor();
}

const RELAY_AGENT_KEY = "srs-web.relay-agent-id";
let relayAgent: string | null = null;

/**
 * Host-minted id of the agent on this relay connection (RFC-046: the host assigns the id; the
 * client handle is display name only). Stable per browser, in-memory when storage fails.
 * srs-web#358 (per-agent channels) extends this to one id per agent.
 */
export function relayAgentId(): string {
  try {
    const saved = localStorage.getItem(RELAY_AGENT_KEY);
    if (saved) return saved;
    const id = `agent:${crypto.randomUUID()}`;
    localStorage.setItem(RELAY_AGENT_KEY, id);
    return id;
  } catch {
    relayAgent ??= `agent:${crypto.randomUUID()}`;
    return relayAgent;
  }
}
